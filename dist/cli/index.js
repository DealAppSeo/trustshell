#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VERSION = exports.EXIT = void 0;
exports.parseArgs = parseArgs;
exports.verdictExitCode = verdictExitCode;
exports.formatVerdictLine = formatVerdictLine;
exports.formatVerify = formatVerify;
exports.formatRepid = formatRepid;
exports.formatProof = formatProof;
exports.makeClient = makeClient;
exports.run = run;
exports.main = main;
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
const trustshell_1 = require("../lib/trustshell");
const badge_1 = require("../lib/badge");
const version_1 = require("../lib/version");
/** Exit codes — a small, stable contract so CI scripts can branch on them. */
exports.EXIT = {
    /** HAL PASS (or soft FLAG) — safe to proceed. */
    OK: 0,
    /** HAL VETO — the gate fails the build. */
    VETO: 1,
    /** Usage / argument error. */
    USAGE: 2,
    /** Runtime error (network / backend / timeout). */
    RUNTIME: 3,
};
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
exports.VERSION = (0, version_1.resolvePackageVersion)(__dirname);
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
function parseArgs(argv) {
    const flags = new Set();
    const positionals = [];
    for (const a of argv) {
        if (a === '--json')
            flags.add('json');
        else if (a === '--verify')
            flags.add('verify');
        else if (a === '--markdown' || a === '--md')
            flags.add('markdown');
        else if (a === '-h' || a === '--help')
            flags.add('help');
        else if (a === '-v' || a === '--version')
            flags.add('version');
        else if (a.startsWith('-')) {
            return {
                command: 'help',
                json: false,
                verify: false,
                error: `unknown option: ${a}`,
            };
        }
        else
            positionals.push(a);
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
        case 'badge': {
            const operand = rest[0];
            if (!operand) {
                const what = cmd === 'verify' ? '"<text>"' : '<agentIdOrSlug>';
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
function verdictExitCode(verdict) {
    return verdict === 'VETO' ? exports.EXIT.VETO : exports.EXIT.OK;
}
/** Human-readable one-line verdict banner (no color deps — plain, CI-log-safe). */
function formatVerdictLine(r) {
    const mark = r.verdict === 'VETO' ? '✗' : r.verdict === 'FLAG' ? '⚠' : '✓';
    return `${mark} ${r.verdict}  trust ${r.trustScore}/100`;
}
/** Format a full verify result for human terminal output. */
function formatVerify(r) {
    const lines = [formatVerdictLine(r)];
    if (r.decisionReason)
        lines.push(`  ${r.decisionReason}`);
    if (r.evidence && r.evidence.length) {
        lines.push('  evidence:');
        for (const e of r.evidence)
            lines.push(`    - ${e}`);
    }
    return lines.join('\n');
}
/** Format a RepID result for human terminal output. */
function formatRepid(agentId, repid, tier) {
    return `${agentId}\n  RepID ${repid}  (${tier})`;
}
/** Format a proof presentation for human terminal output. */
function formatProof(p) {
    const lines = [
        `${p.agentId}`,
        `  tier      ${p.tier}`,
        `  scheme    ${p.scheme ?? '(none)'}`,
        `  createdAt ${p.createdAt ?? '(none)'}`,
        `  proof     ${p.proofBytes ? `${p.proofBytes.length} base64 chars` : '(empty)'}`,
    ];
    if (p.statement) {
        lines.push(`  statement repid_score=${p.statement.repid_score} threshold=${p.statement.threshold} tier=${p.statement.tier}`);
    }
    if (p.verification) {
        const v = p.verification;
        lines.push(v.verified
            ? `  verified  ✓ (client-side, ${v.verifierVersion})`
            : `  verified  ✗ NOT verified — ${v.error ?? 'unknown'} (${v.verifierVersion})`);
    }
    return lines.join('\n');
}
/** Build the SDK client from env (apiKey + apiUrl are both optional). */
function makeClient() {
    return new trustshell_1.TrustShell({
        apiKey: process.env.REPID_API_KEY?.trim() || undefined,
        apiUrl: process.env.TRUSTSHELL_API_URL?.trim() || undefined,
    });
}
const realIO = {
    out: (s) => process.stdout.write(s + '\n'),
    err: (s) => process.stderr.write(s + '\n'),
};
/**
 * Execute a parsed command against a client and return the process exit code.
 * The client is injected so tests can pass a mock (no live network).
 */
async function run(args, client, io = realIO) {
    if (args.error) {
        io.err(`error: ${args.error}\n`);
        io.err(HELP);
        return exports.EXIT.USAGE;
    }
    switch (args.command) {
        case 'help':
            io.out(HELP);
            return exports.EXIT.OK;
        case 'version':
            io.out(exports.VERSION);
            return exports.EXIT.OK;
        case 'verify': {
            try {
                const r = await client.verifyOutput(args.operand);
                if (args.json)
                    io.out(JSON.stringify(r, null, 2));
                else
                    io.out(formatVerify(r));
                return verdictExitCode(r.verdict);
            }
            catch (e) {
                io.err(`verify failed: ${e?.message ?? String(e)}`);
                return exports.EXIT.RUNTIME;
            }
        }
        case 'repid': {
            try {
                const r = await client.getRepID(args.operand);
                if (args.json)
                    io.out(JSON.stringify(r, null, 2));
                else
                    io.out(formatRepid(r.agentId, r.repid, r.tier));
                return exports.EXIT.OK;
            }
            catch (e) {
                io.err(`repid failed: ${e?.message ?? String(e)}`);
                return exports.EXIT.RUNTIME;
            }
        }
        case 'proof': {
            try {
                const p = await client.presentProof(args.operand, { verify: args.verify });
                if (args.json)
                    io.out(JSON.stringify(p, null, 2));
                else
                    io.out(formatProof(p));
                // When --verify was requested, a proof that did not verify is a hard failure —
                // never let a non-verified proof read as success (HONESTY, mirrors the MCP).
                if (args.verify && p.verification?.verified !== true) {
                    io.err('proof was NOT verified client-side — do not claim the RepID proof is verified.');
                    return exports.EXIT.RUNTIME;
                }
                return exports.EXIT.OK;
            }
            catch (e) {
                io.err(`proof failed: ${e?.message ?? String(e)}`);
                return exports.EXIT.RUNTIME;
            }
        }
        case 'badge': {
            try {
                // A badge is a shareable CLAIM, so we always verify the proof before rendering.
                // The badge itself is honest (green only on a true local verification), and the
                // exit code mirrors that: a non-verified badge must not read as success in CI.
                const p = await client.presentProof(args.operand, { verify: true });
                const status = (0, badge_1.proofBadgeStatus)(p);
                if (args.json) {
                    io.out(JSON.stringify(status, null, 2));
                }
                else if (args.markdown) {
                    io.out((0, badge_1.renderProofBadgeMarkdown)(p));
                }
                else {
                    io.out((0, badge_1.renderProofBadge)(p));
                }
                if (status.state !== 'verified') {
                    io.err(`badge rendered in '${status.state}' state — ${status.detail}. ` +
                        `It is honest, but do NOT present it as a verified proof.`);
                    return exports.EXIT.RUNTIME;
                }
                return exports.EXIT.OK;
            }
            catch (e) {
                io.err(`badge failed: ${e?.message ?? String(e)}`);
                return exports.EXIT.RUNTIME;
            }
        }
        default:
            io.out(HELP);
            return exports.EXIT.OK;
    }
}
/** Entry point: parse argv, run, exit with the returned code. */
async function main(argv = process.argv.slice(2)) {
    const args = parseArgs(argv);
    const code = await run(args, makeClient());
    process.exit(code);
}
// Boot ONLY when run as the entry point (not when imported by a test/consumer), so the
// pure helpers above can be unit-tested without spawning a process.exit.
const isEntry = (() => {
    try {
        const argvPath = process.argv[1];
        if (!argvPath)
            return false;
        // dist/cli/index.js is the built bin; match against the invoked script path.
        return /[\\/]cli[\\/]index\.js$/.test(argvPath) || /trustshell$/.test(argvPath);
    }
    catch {
        return false;
    }
})();
if (isEntry) {
    main().catch((e) => {
        process.stderr.write(`trustshell: fatal: ${e?.stack ?? e}\n`);
        process.exit(exports.EXIT.RUNTIME);
    });
}
