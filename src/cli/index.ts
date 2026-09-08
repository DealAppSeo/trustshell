#!/usr/bin/env node
/**
 * @hyperdag/trustshell — CLI
 * ------------------------------------------------------------------
 * The THIRD distribution channel for the TrustShell trust harness:
 *   - SDK  (`import { TrustShell }`)  → code
 *   - MCP  (`@hyperdag/trustshell-mcp`) → AI agents (Claude Desktop / Cursor / …)
 *   - CLI  (`trustshell …`)            → terminal + CI  ← this file
 *
 * A THIN wrapper over the SDK (../lib/trustshell). No fake verdicts — every
 * command makes a real SDK call against the live HyperDAG backend.
 *
 * The headline capability: `trustshell verify` is a CI/pre-commit GATE.
 *   exit 0  → HAL PASS  (or soft FLAG)   → build proceeds
 *   exit 1  → HAL VETO                    → build FAILS ("don't ship a vetoed claim")
 *   exit 2  → usage / bad-args error
 *   exit 3  → runtime error (network, backend, timeout, …)
 *
 * ENV:
 *   REPID_API_KEY       — attaches an API key (optional; the verify/repid/proof paths are keyless)
 *   TRUSTSHELL_API_URL  — override the backend origin (default: live Railway backend baked into the SDK)
 *
 * Kept dependency-light on purpose: a tiny hand-rolled arg parser, no `commander`.
 * The pure functions (parseArgs, verdictExitCode, formatting) are exported so the
 * arg-parsing + exit-code logic is unit-testable with NO network (mirrors the MCP).
 */
import { TrustShell, type VerifyOutputResult, type ProofPresentation } from '../lib/trustshell';
import { renderProofBadge, renderProofBadgeMarkdown, proofBadgeStatus } from '../lib/badge';
import { resolvePackageVersion } from '../lib/version';
import { runCheck, formatCheckCard, checkExitCode, CheckError } from '../lib/check';
import { runInit, formatInitCard, initExitCode, TRUSTSHELL_DIR, PROFILE_FILE, type InitFs } from '../lib/init';
import {
  verifyChain,
  readClaudeCode,
  noLog,
  formatInspectCard,
  inspectExitCode,
} from '../lib/inspect';
import { buildReport, formatReportCard, reportExitCode, type EvidenceDoc } from '../lib/report';
import { parseProfile, defaultProfile } from '../lib/profile';

/** Exit codes — a small, stable contract so CI scripts can branch on them. */
export const EXIT = {
  /** HAL PASS (or soft FLAG) — safe to proceed. */
  OK: 0,
  /** HAL VETO — the gate fails the build. */
  VETO: 1,
  /** Usage / argument error. */
  USAGE: 2,
  /** Runtime error (network / backend / timeout). */
  RUNTIME: 3,
} as const;

export type Command =
  | 'verify'
  | 'repid'
  | 'proof'
  | 'badge'
  | 'check'
  | 'inspect'
  | 'init'
  | 'report'
  | 'help'
  | 'version';

/** Result of parsing argv (everything after `node cli.js`). Pure + testable. */
export interface ParsedArgs {
  command: Command;
  /** Positional operand: the text (verify) or the agent id/slug (repid/proof). */
  operand?: string;
  json: boolean;
  /** badge: emit a Markdown snippet (data-URI SVG + caption) instead of raw SVG. */
  markdown?: boolean;
  /** proof: verify the proof client-side. */
  verify: boolean;
  /** init: replace an existing profile. Without it, an existing profile is left untouched. */
  force?: boolean;
  /** inspect: read a foreign log through an adapter. Adapters always yield UNCHAINED. */
  from?: string;
  /** report: path to the session log. */
  session?: string;
  /** report: path to saved `check --json` output. `report` never fetches. */
  evidence?: string;
  /** A usage error message; when set the caller should print help + exit USAGE. */
  error?: string;
}

/**
 * The version the CLI reports — read from the package it was installed as,
 * never retyped here. See `../lib/version.ts` for why this is a runtime read
 * rather than a static import, and for the MCP server's identical bug this
 * helper was extracted to also fix.
 *
 * This was a hardcoded `'1.0.0'`, and it stayed 1.0.0 through the 1.1.0 and
 * 1.2.0 releases. `trustshell --version` therefore answered a question it had
 * no way to actually know: the string was written once and never again checked
 * against the thing it described. Anyone bisecting a bug report against the
 * reported version was reading a two-release-old number.
 */
export const VERSION = resolvePackageVersion(__dirname);

const HELP = `trustshell — trust rails for AI agents, in your terminal + CI

USAGE
  trustshell <command> [arguments] [options]

COMMANDS
  verify "<text>"            Run <text> through the live HAL cross-provider fact-check
                             quorum. Prints PASS / FLAG / VETO + trust score + evidence.
                             EXIT 0 on PASS/FLAG, EXIT 1 on VETO — use it as a CI gate.
  repid <agentIdOrSlug>      Print an agent's live RepID score + tier (keyless).
  proof <agentIdOrSlug>      Fetch an agent's ZK RepID range proof (POSTCARD tier).
      [--verify]             …and verify it client-side with the bundled WASM verifier.
  badge <agentIdOrSlug>      Fetch + client-side-verify the proof, then emit a portable,
                             self-contained SVG badge ("RepID ≥ threshold ✓ ZK-verified").
                             Green ONLY on a true local verification. The BADGE never
                             prints the score — the proof's statement still carries it
                             as a public input. EXIT 3 if not in the verified state.
      [--markdown]           Emit a copy-pasteable Markdown snippet (data-URI SVG) instead.
  check <runUrl>             Ask GitHub what it can confirm about an Actions run, and say
                             plainly what it does NOT prove. No account, no key, no backend —
                             talks to api.github.com and nothing else.
                             EXIT 0 COMPLETE, 1 FAILED/INCONSISTENT, 3 INCONCLUSIVE.

  inspect [<path>]           Verify an append-only tool-call log. Reads a local file and
                             computes hashes; opens NO socket. INTACT (0) / BROKEN (1) /
                             UNCHAINED (3) / NO_LOG (3). Defaults to .trustshell/session.jsonl.
      [--from <format>]      Read a foreign log through an adapter (claude-code). An
                             adapter can only ever report UNCHAINED — a log we did not
                             chain proves nothing about its own integrity.
  init [<dir>]               Create .trustshell/ and a blank profile.md. No network, no
                             account, nothing collected. Never overwrites without --force.
      [--force]              Replace an existing profile.
  report                     State what your log and your saved GitHub evidence TOGETHER
                             support, and where they disagree. NO NETWORK — evidence is a
                             file you produced. CONFIRMED (0) / INCONSISTENT (1) /
                             UNSUPPORTED (3).
      [--session <path>]     Session log (default .trustshell/session.jsonl).
      [--evidence <path>]    Saved output of \`trustshell check --json\`.

OPTIONS
  --json                     Emit machine-readable JSON instead of human text.
  -h, --help                 Show this help.
  -v, --version              Show the version.

EXIT CODES
  0  HAL PASS (or soft FLAG) — safe to proceed        · check: COMPLETE
  1  HAL VETO — the claim did not pass                · check: FAILED / INCONSISTENT
  2  usage / bad arguments
  3  runtime error (network / backend / timeout)      · check: INCONCLUSIVE (NOT CHECKED)

NETWORK EGRESS (what each command dials, and nothing else)
  verify · repid · proof · badge   the HyperDAG backend (TRUSTSHELL_API_URL)
  check                            api.github.com only — no backend, no account
  inspect                          NOTHING. Reads a local file.
  init                             NOTHING. Writes one local file.
  report                           NOTHING. It has no fetch and no URL parameter;
                                   external evidence arrives as a file you supply.

ENV
  REPID_API_KEY        optional API key (verify/repid/proof are keyless)
  TRUSTSHELL_API_URL   override backend origin (default: live HyperDAG backend)

CI GATE EXAMPLE
  # fail the build if HAL vetoes a claim in your changelog
  trustshell verify "$(cat CHANGELOG_CLAIM.txt)" || exit 1
`;

/**
 * Parse CLI arguments into a {@link ParsedArgs}. PURE — no I/O, no network — so the
 * command routing + option handling can be unit-tested directly.
 *
 * `argv` is the slice AFTER the node binary + script path (i.e. `process.argv.slice(2)`).
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const flags = new Set<string>();
  const positionals: string[] = [];
  // Options that consume the NEXT argument. Indexed rather than for-of because a
  // value-taking flag has to be able to look ahead.
  const values: Record<string, string | undefined> = {};
  const VALUE_OPTS = new Set(['--from', '--session', '--evidence']);
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i] as string;
    if (a === '--json') flags.add('json');
    else if (a === '--verify') flags.add('verify');
    else if (a === '--markdown' || a === '--md') flags.add('markdown');
    else if (a === '--force') flags.add('force');
    else if (a === '-h' || a === '--help') flags.add('help');
    else if (a === '-v' || a === '--version') flags.add('version');
    else if (VALUE_OPTS.has(a)) {
      const v = argv[i + 1];
      // A value-taking flag with nothing after it, or followed by another flag,
      // is a usage error rather than a silent undefined — otherwise
      // `--evidence` alone would quietly become "no evidence supplied" and
      // report UNSUPPORTED, which reads as a finding instead of a typo.
      if (v === undefined || v.startsWith('-')) {
        return { command: 'help', json: false, verify: false, error: `${a} requires a value` };
      }
      values[a.slice(2)] = v;
      i += 1;
    } else if (a.startsWith('-')) {
      return {
        command: 'help',
        json: false,
        verify: false,
        error: `unknown option: ${a}`,
      };
    } else positionals.push(a);
  }

  const json = flags.has('json');
  const verify = flags.has('verify');

  // Top-level --version / --help (or bare invocation) short-circuit to those commands.
  // --version wins over an empty invocation so `trustshell --version` prints the version.
  if (flags.has('version')) {
    return { command: 'version', json, verify };
  }
  if (flags.has('help') || positionals.length === 0) {
    return { command: 'help', json, verify };
  }

  const [cmd, ...rest] = positionals;

  switch (cmd) {
    case 'verify':
    case 'repid':
    case 'proof':
    case 'badge':
    case 'check': {
      const operand = rest[0];
      if (!operand) {
        const what =
          cmd === 'verify'
            ? '"<text>"'
            : cmd === 'check'
              ? '<github-actions-run-url>'
              : '<agentIdOrSlug>';
        return {
          command: cmd,
          json,
          verify,
          markdown: flags.has('markdown'),
          error: `\`trustshell ${cmd}\` requires ${what}`,
        };
      }
      return { command: cmd, operand, json, verify, markdown: flags.has('markdown') };
    }
    case 'inspect':
    case 'init':
    case 'report':
      // Operand is OPTIONAL for all three: init defaults to cwd, inspect and
      // report default to `.trustshell/`. Requiring one would make the common
      // case the verbose case.
      return {
        command: cmd,
        json,
        verify,
        force: flags.has('force'),
        from: values['from'],
        session: values['session'],
        evidence: values['evidence'],
        ...(rest[0] !== undefined ? { operand: rest[0] } : {}),
      };
    case 'help':
      return { command: 'help', json, verify };
    case 'version':
      return { command: 'version', json, verify };
    default:
      return {
        command: 'help',
        json,
        verify,
        error: `unknown command: ${cmd}`,
      };
  }
}

/**
 * Map a HAL verdict to a process exit code. PURE + testable.
 * VETO fails the build (exit 1); PASS and FLAG both succeed (exit 0) — a soft FLAG is
 * informational, not a gate failure, matching the SDK's `ok = verdict !== 'VETO'`.
 */
export function verdictExitCode(verdict: 'PASS' | 'FLAG' | 'VETO'): number {
  return verdict === 'VETO' ? EXIT.VETO : EXIT.OK;
}

/** Human-readable one-line verdict banner (no color deps — plain, CI-log-safe). */
export function formatVerdictLine(r: Pick<VerifyOutputResult, 'verdict' | 'trustScore'>): string {
  const mark = r.verdict === 'VETO' ? '✗' : r.verdict === 'FLAG' ? '⚠' : '✓';
  return `${mark} ${r.verdict}  trust ${r.trustScore}/100`;
}

/** Format a full verify result for human terminal output. */
export function formatVerify(r: VerifyOutputResult): string {
  const lines: string[] = [formatVerdictLine(r)];
  if (r.decisionReason) lines.push(`  ${r.decisionReason}`);
  if (r.evidence && r.evidence.length) {
    lines.push('  evidence:');
    for (const e of r.evidence) lines.push(`    - ${e}`);
  }
  return lines.join('\n');
}

/** Format a RepID result for human terminal output. */
export function formatRepid(agentId: string, repid: number, tier: string): string {
  return `${agentId}\n  RepID ${repid}  (${tier})`;
}

/** Format a proof presentation for human terminal output. */
export function formatProof(p: ProofPresentation): string {
  const lines: string[] = [
    `${p.agentId}`,
    `  tier      ${p.tier}`,
    `  scheme    ${p.scheme ?? '(none)'}`,
    `  createdAt ${p.createdAt ?? '(none)'}`,
    `  proof     ${p.proofBytes ? `${p.proofBytes.length} base64 chars` : '(empty)'}`,
  ];
  if (p.statement) {
    lines.push(
      `  statement repid_score=${p.statement.repid_score} threshold=${p.statement.threshold} tier=${p.statement.tier}`,
    );
  }
  if (p.verification) {
    const v = p.verification;
    lines.push(
      v.verified
        ? `  verified  ✓ (client-side, ${v.verifierVersion})`
        : `  verified  ✗ NOT verified — ${v.error ?? 'unknown'} (${v.verifierVersion})`,
    );
  }
  return lines.join('\n');
}

/** Build the SDK client from env (apiKey + apiUrl are both optional). */
export function makeClient(): TrustShell {
  return new TrustShell({
    apiKey: process.env.REPID_API_KEY?.trim() || undefined,
    apiUrl: process.env.TRUSTSHELL_API_URL?.trim() || undefined,
  });
}

/** IO surface, injectable so run() is testable without touching the real process. */
export interface CliIO {
  out: (s: string) => void;
  err: (s: string) => void;
}

const realIO: CliIO = {
  out: (s) => process.stdout.write(s + '\n'),
  err: (s) => process.stderr.write(s + '\n'),
};

/**
 * Execute a parsed command against a client and return the process exit code.
 * The client is injected so tests can pass a mock (no live network).
 */
export async function run(
  args: ParsedArgs,
  client: TrustShell,
  io: CliIO = realIO,
): Promise<number> {
  if (args.error) {
    io.err(`error: ${args.error}\n`);
    io.err(HELP);
    return EXIT.USAGE;
  }

  switch (args.command) {
    case 'help':
      io.out(HELP);
      return EXIT.OK;
    case 'version':
      io.out(VERSION);
      return EXIT.OK;

    case 'verify': {
      try {
        const r = await client.verifyOutput(args.operand as string);
        if (args.json) io.out(JSON.stringify(r, null, 2));
        else io.out(formatVerify(r));
        return verdictExitCode(r.verdict);
      } catch (e: any) {
        io.err(`verify failed: ${e?.message ?? String(e)}`);
        return EXIT.RUNTIME;
      }
    }

    case 'repid': {
      try {
        const r = await client.getRepID(args.operand as string);
        if (args.json) io.out(JSON.stringify(r, null, 2));
        else io.out(formatRepid(r.agentId, r.repid, r.tier));
        return EXIT.OK;
      } catch (e: any) {
        io.err(`repid failed: ${e?.message ?? String(e)}`);
        return EXIT.RUNTIME;
      }
    }

    case 'proof': {
      try {
        const p = await client.presentProof(args.operand as string, { verify: args.verify });
        if (args.json) io.out(JSON.stringify(p, null, 2));
        else io.out(formatProof(p));
        // When --verify was requested, a proof that did not verify is a hard failure —
        // never let a non-verified proof read as success (HONESTY, mirrors the MCP).
        if (args.verify && p.verification?.verified !== true) {
          io.err('proof was NOT verified client-side — do not claim the RepID proof is verified.');
          return EXIT.RUNTIME;
        }
        return EXIT.OK;
      } catch (e: any) {
        io.err(`proof failed: ${e?.message ?? String(e)}`);
        return EXIT.RUNTIME;
      }
    }

    case 'badge': {
      try {
        // A badge is a shareable CLAIM, so we always verify the proof before rendering.
        // The badge itself is honest (green only on a true local verification), and the
        // exit code mirrors that: a non-verified badge must not read as success in CI.
        const p = await client.presentProof(args.operand as string, { verify: true });
        const status = proofBadgeStatus(p);
        if (args.json) {
          io.out(JSON.stringify(status, null, 2));
        } else if (args.markdown) {
          io.out(renderProofBadgeMarkdown(p));
        } else {
          io.out(renderProofBadge(p));
        }
        if (status.state !== 'verified') {
          io.err(
            `badge rendered in '${status.state}' state — ${status.detail}. ` +
            `It is honest, but do NOT present it as a verified proof.`,
          );
          return EXIT.RUNTIME;
        }
        return EXIT.OK;
      } catch (e: any) {
        io.err(`badge failed: ${e?.message ?? String(e)}`);
        return EXIT.RUNTIME;
      }
    }

    case 'check': {
      // GitHub-only. Deliberately does NOT touch `client` — no backend, no key,
      // no account. That independence is the command's entire value.
      try {
        const r = await runCheck(args.operand as string);
        if (args.json) io.out(JSON.stringify(r, null, 2));
        else io.out(formatCheckCard(r));
        return checkExitCode(r.verdict);
      } catch (e: any) {
        if (e instanceof CheckError) {
          io.err(`check failed: ${e.message}`);
          return e.usage ? EXIT.USAGE : EXIT.RUNTIME;
        }
        io.err(`check failed: ${e?.message ?? String(e)}`);
        return EXIT.RUNTIME;
      }
    }

    case 'init': {
      // No network, no account, no telemetry. One directory, one file.
      const fs = require('node:fs') as typeof import('node:fs');
      const impl: InitFs = {
        exists: (p) => fs.existsSync(p),
        mkdirp: (p) => { fs.mkdirSync(p, { recursive: true }); },
        writeFile: (p, data) => { fs.writeFileSync(p, data, 'utf8'); },
      };
      try {
        const r = runInit(impl, { cwd: args.operand ?? '.', force: args.force === true });
        if (args.json) io.out(JSON.stringify(r, null, 2));
        else io.out(formatInitCard(r));
        return initExitCode(r.outcome);
      } catch (e: any) {
        io.err(`init failed: ${e?.message ?? String(e)}`);
        return EXIT.RUNTIME;
      }
    }

    case 'inspect': {
      // Local file only. Opens no socket.
      const fs = require('node:fs') as typeof import('node:fs');
      const path = args.operand ?? `${TRUSTSHELL_DIR}/session.jsonl`;
      try {
        if (!fs.existsSync(path)) {
          // A missing log is NOT CHECKED, never "clean". Exit 3.
          const r = noLog(path);
          if (args.json) io.out(JSON.stringify(r, null, 2));
          else io.out(formatInspectCard(r));
          return inspectExitCode(r.verdict);
        }
        const text = fs.readFileSync(path, 'utf8');
        const from = args.from;
        if (from !== undefined && from !== 'trustshell' && from !== 'claude-code') {
          io.err(`inspect: unknown --from format "${from}" (known: trustshell, claude-code)`);
          return EXIT.USAGE;
        }
        const r = from === 'claude-code' ? readClaudeCode(text, path) : verifyChain(text, path);
        if (args.json) io.out(JSON.stringify(r, null, 2));
        else io.out(formatInspectCard(r));
        return inspectExitCode(r.verdict);
      } catch (e: any) {
        io.err(`inspect failed: ${e?.message ?? String(e)}`);
        return EXIT.RUNTIME;
      }
    }

    case 'report': {
      // NO FETCH. External evidence arrives as a file the operator produced with
      // `check --json`. There is deliberately no URL parameter here.
      const fs = require('node:fs') as typeof import('node:fs');
      try {
        const sessionPath = args.session ?? `${TRUSTSHELL_DIR}/session.jsonl`;
        const session = fs.existsSync(sessionPath)
          ? verifyChain(fs.readFileSync(sessionPath, 'utf8'), sessionPath)
          : null;

        let evidence: EvidenceDoc | null = null;
        if (args.evidence !== undefined) {
          if (!fs.existsSync(args.evidence)) {
            io.err(`report: evidence file not found: ${args.evidence}`);
            return EXIT.USAGE;
          }
          try {
            evidence = JSON.parse(fs.readFileSync(args.evidence, 'utf8')) as EvidenceDoc;
          } catch {
            io.err(`report: evidence file is not valid JSON: ${args.evidence}`);
            return EXIT.USAGE;
          }
        }

        const profilePath = `${TRUSTSHELL_DIR}/${PROFILE_FILE}`;
        const profile = fs.existsSync(profilePath)
          ? parseProfile(fs.readFileSync(profilePath, 'utf8')).profile
          : defaultProfile();

        const r = buildReport({ session, evidence, profile });
        if (args.json) io.out(JSON.stringify(r, null, 2));
        else io.out(formatReportCard(r));
        return reportExitCode(r.verdict);
      } catch (e: any) {
        io.err(`report failed: ${e?.message ?? String(e)}`);
        return EXIT.RUNTIME;
      }
    }

    default:
      io.out(HELP);
      return EXIT.OK;
  }
}

/** Entry point: parse argv, run, exit with the returned code. */
export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const code = await run(args, makeClient());
  process.exit(code);
}

// Boot ONLY when run as the entry point (not when imported by a test/consumer), so the
// pure helpers above can be unit-tested without spawning a process.exit.
//
// THIS MATCHED THE INVOKED NAME, AND `hal` DID NOTHING AT ALL. `package.json`
// publishes three bins, two of which — `trustshell` and `hal` — point at THIS
// file. npm installs each as a separate symlink, and Node leaves
// `process.argv[1]` as the path you invoked rather than the symlink's target. So
// under `hal` the path ended in `hal`, matched neither pattern, `main()` never
// ran, and the process exited **0 having done nothing**.
//
// Silent and exit 0 is the worst available failure for this particular tool: a
// caller who wrote `hal verify "$claim" || exit 1` had a gate that could only
// ever pass. Measured on a clean install from the real tarball —
// `trustshell check` exits 2 with a usage error, `hal check` prints nothing and
// exits 0.
//
// Comparing the RESOLVED path against this module's own path is name-independent,
// so a fourth bin added later works without anyone remembering this. The regex
// fallback is kept only for the case where realpath itself throws.
/**
 * PURE-ish (one realpath call, no other I/O). Exported so the `hal` regression
 * has a guard: `isEntryPath` must answer TRUE for every bin name npm links to
 * this file, and FALSE when a test runner imports it.
 */
export function isEntryPath(argvPath: string | undefined, selfPath: string): boolean {
  if (!argvPath) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { realpathSync } = require('node:fs') as typeof import('node:fs');
    return realpathSync(argvPath) === realpathSync(selfPath);
  } catch {
    // realpath can throw on an exotic filesystem or a deleted path; fall back to
    // the old shape rather than refusing to boot at all.
    return /[\\/]cli[\\/]index\.js$/.test(argvPath) || /trustshell$/.test(argvPath);
  }
}

const isEntry = (() => {
  try {
    return isEntryPath(process.argv[1], __filename);
  } catch {
    return false;
  }
})();

if (isEntry) {
  main().catch((e) => {
    process.stderr.write(`trustshell: fatal: ${e?.stack ?? e}\n`);
    process.exit(EXIT.RUNTIME);
  });
}
