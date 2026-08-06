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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TrustShell, type VerifyOutputResult, type ProofPresentation } from '../lib/trustshell';

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

export type Command = 'verify' | 'repid' | 'proof' | 'help' | 'version';

/** Result of parsing argv (everything after `node cli.js`). Pure + testable. */
export interface ParsedArgs {
  command: Command;
  /** Positional operand: the text (verify) or the agent id/slug (repid/proof). */
  operand?: string;
  json: boolean;
  /** proof: verify the proof client-side. */
  verify: boolean;
  /** A usage error message; when set the caller should print help + exit USAGE. */
  error?: string;
}

/**
 * The version the CLI reports — read from the package it was installed as,
 * never retyped here.
 *
 * This was a hardcoded `'1.0.0'`, and it stayed 1.0.0 through the 1.1.0 and
 * 1.2.0 releases. `trustshell --version` therefore answered a question it had
 * no way to actually know: the string was written once and never again checked
 * against the thing it described. Anyone bisecting a bug report against the
 * reported version was reading a two-release-old number.
 *
 * WHY A RUNTIME READ AND NOT `import pkg from '../../package.json'`:
 * tsconfig.sdk.json pins `rootDir: ./src`, so importing package.json is a
 * TS6059 compile error — and relaxing rootDir would move every emitted file
 * from `dist/cli/` to `dist/src/cli/`, breaking the `bin` paths. So we resolve
 * it at runtime instead. Output is CommonJS, so `__dirname` is real:
 * `dist/cli/` -> `../../` -> the package root, which holds package.json in both
 * the repo and the published tarball (npm always ships package.json).
 *
 * Falls back to 'unknown' rather than to a number: a wrong version is worse
 * than an absent one, and this is the exact failure being fixed.
 */
function resolveVersion(): string {
  try {
    const raw = readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    const v =
      typeof parsed === 'object' && parsed !== null
        ? (parsed as { version?: unknown }).version
        : undefined;
    return typeof v === 'string' && v.length > 0 ? v : 'unknown';
  } catch {
    return 'unknown';
  }
}

export const VERSION = resolveVersion();

/**
 * Turn a transport failure into something a first-time user can act on.
 *
 * WHY THIS EXISTS. The very first command in the quickstart is
 * `trustshell verify "..."`, and on a shared or repeat-visited IP it returns
 * `verify failed: HAL evaluation failed: 429 Too Many Requests`. That is the
 * worst possible first impression: a raw HTTP code, no cause, no remedy, and no
 * indication the tool is working correctly — which it is. The public endpoint is
 * deliberately capped so anonymous traffic cannot burn the fleet's inference
 * budget, and hitting that cap means the install SUCCEEDED.
 *
 * A rate limit is not a broken install and must not read like one.
 */
export function explainFailure(command: string, e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);

  if (/\b429\b|too many requests|rate.?limit/i.test(msg)) {
    return [
      `${command}: rate limit reached on the public endpoint — your install is fine.`,
      '',
      '  The keyless endpoint is capped per IP so anonymous traffic cannot drain',
      '  the shared model budget. You have hit that cap, not a bug.',
      '',
      '  What still works right now, keyless and uncapped:',
      '    trustshell repid <agentId>            live RepID + tier',
      '    trustshell proof <agentId> --verify   ZK range proof, verified locally',
      '',
      '  To lift the cap, point the CLI at your own deployment:',
      '    TRUSTSHELL_API_URL=https://your-engine  trustshell verify "..."',
    ].join('\n');
  }

  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|fetch failed|network/i.test(msg)) {
    return [
      `${command}: could not reach the engine — this looks like a network problem, not a verdict.`,
      `  ${msg}`,
      '  Nothing was evaluated, so treat this as UNKNOWN rather than as a pass or a veto.',
    ].join('\n');
  }

  // "timed out" is what Node and fetch actually say; a \btimeout\b matcher misses
  // it entirely. Caught by this module's own test.
  if (/\b408\b|time[d]?\s?out|timeout|aborted/i.test(msg)) {
    return [
      `${command}: timed out before the quorum answered.`,
      '  The cross-provider fact-check can be slow under load. Nothing was decided —',
      '  do NOT treat a timeout as a pass.',
    ].join('\n');
  }

  return `${command} failed: ${msg}`;
}

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

OPTIONS
  --json                     Emit machine-readable JSON instead of human text.
  -h, --help                 Show this help.
  -v, --version              Show the version.

EXIT CODES
  0  HAL PASS (or soft FLAG) — safe to proceed
  1  HAL VETO — the claim did not pass (fail the build)
  2  usage / bad arguments
  3  runtime error (network / backend / timeout)

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
  for (const a of argv) {
    if (a === '--json') flags.add('json');
    else if (a === '--verify') flags.add('verify');
    else if (a === '-h' || a === '--help') flags.add('help');
    else if (a === '-v' || a === '--version') flags.add('version');
    else if (a.startsWith('-')) {
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
    case 'proof': {
      const operand = rest[0];
      if (!operand) {
        const what = cmd === 'verify' ? '"<text>"' : '<agentIdOrSlug>';
        return {
          command: cmd,
          json,
          verify,
          error: `\`trustshell ${cmd}\` requires ${what}`,
        };
      }
      return { command: cmd, operand, json, verify };
    }
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
        io.err(explainFailure('verify', e));
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
        io.err(explainFailure('repid', e));
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
        io.err(explainFailure('proof', e));
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
const isEntry = (() => {
  try {
    const argvPath = process.argv[1];
    if (!argvPath) return false;
    // dist/cli/index.js is the built bin; match against the invoked script path.
    return /[\\/]cli[\\/]index\.js$/.test(argvPath) || /trustshell$/.test(argvPath);
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
