#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INIT_PAI_DOC = exports.INIT_PAI_SCRIPT = exports.VERSION = exports.EXIT = void 0;
exports.resolveInitPai = resolveInitPai;
exports.runInitPai = runInitPai;
exports.parseArgs = parseArgs;
exports.verdictExitCode = verdictExitCode;
exports.formatVerdictLine = formatVerdictLine;
exports.formatVerify = formatVerify;
exports.formatRepid = formatRepid;
exports.formatProof = formatProof;
exports.makeClient = makeClient;
exports.run = run;
exports.runClaimCheck = runClaimCheck;
exports.main = main;
exports.isEntryPath = isEntryPath;
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
const action_envelope_1 = require("../lib/action-envelope");
const badge_1 = require("../lib/badge");
const version_1 = require("../lib/version");
const check_1 = require("../lib/check");
const claim_1 = require("../lib/claim");
const init_1 = require("../lib/init");
const inspect_1 = require("../lib/inspect");
const report_1 = require("../lib/report");
const status_1 = require("./status");
const profile_1 = require("../lib/profile");
const laya_lane_1 = require("./laya-lane");
const remember_1 = require("./remember");
const recall_1 = require("./recall");
const redact_key_1 = require("./redact-key");
const bind_status_1 = require("./bind-status");
const scrub_print_1 = require("./scrub-print");
const traps_1 = require("./traps");
const node_path_1 = require("node:path");
/** Exit codes — a small, stable contract so CI scripts can branch on them. */
exports.EXIT = {
    /** HAL PASS (or soft FLAG) — safe to proceed. */
    OK: 0,
    /** HAL VETO — the gate fails the build. */
    VETO: 1,
    /** Usage / argument error. */
    USAGE: 2,
    /**
     * HAL did not decide (abstain, no decision, or no provider consulted). Shares 2 with USAGE on
     * purpose: `check "<sentence>"` already exits 2 for not-checked, and a CI gate written as
     * `trustshell verify … || exit 1` must fail on it, never pass.
     */
    NOT_CHECKED: 2,
    /** Runtime error (network / backend / timeout). */
    RUNTIME: 3,
    /** Laya ask. A person has to answer. HAL was not called. */
    ASK: 4,
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
/** Repo-relative path the published CLI must be able to spawn. */
exports.INIT_PAI_SCRIPT = 'scripts/init-pai.mjs';
/** The path a stranger can run from a clone when the script is not in this install. */
exports.INIT_PAI_DOC = 'node scripts/init-pai.mjs --name <n>';
/** `cliDir` is src/cli or dist/cli — both sit two levels below the package root. */
function resolveInitPai(cliDir) {
    return (0, node_path_1.join)(cliDir, '..', '..', exports.INIT_PAI_SCRIPT);
}
/**
 * Spawn scripts/init-pai.mjs. Missing script → USAGE, never silent 0
 * (the unpublished-bin failure class).
 */
function runInitPai(impl, opts) {
    const script = resolveInitPai(opts.cliDir);
    if (!impl.exists(script)) {
        return { code: exports.EXIT.USAGE, missing: true, script };
    }
    const args = [script];
    if (opts.name)
        args.push('--name', opts.name);
    if (opts.answers)
        args.push('--answers', opts.answers);
    if (opts.force)
        args.push('--force');
    const r = impl.spawn(process.execPath, args);
    return { code: r.status === null ? exports.EXIT.RUNTIME : r.status, missing: false, script };
}
const HELP = `trustshell — trust rails for AI agents, in your terminal + CI

USAGE
  trustshell <command> [arguments] [options]

COMMANDS
  verify "<text>"            Run <text> through the live HAL cross-provider fact-check
                             quorum. Prints PASS / FLAG / VETO + trust score + evidence.
                             EXIT 0 on PASS/FLAG, EXIT 1 on VETO — use it as a CI gate.
  evaluate "<text>"          Alias of verify. Same HAL quorum, same exits.
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
  check "<sentence>"         Label one sentence pass / veto / not-checked — the same label the
                             Chrome extension shows (POST <backend>/api/v1/classify). Any
                             operand that is not a URL is a sentence. Prints the label, then
                             one line of explanation; --json prints the response object.
                             EXIT 0 pass, 1 veto, 2 not-checked, 3 error. A timeout (6 s),
                             network failure, non-200 or off-contract body is not-checked.

  inspect [<path>]           Verify an append-only tool-call log. Reads a local file and
                             computes hashes; opens NO socket. INTACT (0) / BROKEN (1) /
                             UNCHAINED (3) / NO_LOG (3). Defaults to .trustshell/session.jsonl.
      [--from <format>]      Read a foreign log through an adapter (claude-code). An
                             adapter can only ever report UNCHAINED — a log we did not
                             chain proves nothing about its own integrity.
  init [<dir>]               Create .trustshell/ and a blank profile.md. No network, no
                             account, nothing collected. Never overwrites without --force.
      [--force]              Replace an existing profile.
      [--pai]                Run scripts/init-pai.mjs (PAI FACE — live register). Equivalent:
                             node scripts/init-pai.mjs --name <n>
      [--dry-run]            With --pai: do not mint ERC-8004. Prints NOT_MINTED. No network.
                             trustshell init --pai dry-run is the same path.
      [--name <n>]           With --pai: PAI name (forwarded to init-pai).
      [--answers <a|b|c>]    With --pai: non-interactive interview answers.
  status                     Print the after-create table, one Honesty A line, and counted first_pass fields. A NOT_CHECKED body or a missing column is NOT_CHECKED, never 0. post-HAL is printed only when post_hal_verdict is in the JSON. can_bind is true only when GET /readiness exact_true.HUMAN_AGENT_BIND_ENABLED is true. can_stake stays shadow — not live unless SAYS_STAKE_LIVE is the exact string 'true'.
  remember "<text>"          Write a note into the local sqlite memory. No network.
  remember KEY VALUE         Save one value under KEY. Refuses sb_secret_, postgresql://, and eyJ. No network.
  recall                     Print saved notes. do_not_send rows print as a count only.
  recall KEY                 Print the value for KEY. Missing is NOT_CHECKED, never empty.
  redact KEY                 Delete the KEY row. Missing is NOT_CHECKED. No network.
  bind-status                Read after-create. Print can_bind. can_stake true stays shadow — not live. No send.
  traps                      List the ten local fixture HAL claims. Each row is NOT_CHECKED until a receipt id exists. No scoreboard. No HAL wins.
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
  verify · repid · proof · badge · status · bind-status   the HyperDAG backend (TRUSTSHELL_API_URL)
  check <runUrl>                   api.github.com only — no backend, no account
  check "<sentence>"               the HyperDAG backend (TRUSTSHELL_API_URL), /api/v1/classify only
  inspect                          NOTHING. Reads a local file.
  init                             NOTHING (default). --pai runs scripts/init-pai.mjs (live register).
  remember · recall · redact       NOTHING. Local sqlite only.
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
function parseArgs(argv) {
    const flags = new Set();
    const positionals = [];
    // Options that consume the NEXT argument. Indexed rather than for-of because a
    // value-taking flag has to be able to look ahead.
    const values = {};
    const VALUE_OPTS = new Set(['--from', '--session', '--evidence', '--name', '--answers']);
    for (let i = 0; i < argv.length; i += 1) {
        const a = argv[i];
        if (a === '--json')
            flags.add('json');
        else if (a === '--verify')
            flags.add('verify');
        else if (a === '--markdown' || a === '--md')
            flags.add('markdown');
        else if (a === '--force')
            flags.add('force');
        else if (a === '--pai')
            flags.add('pai');
        else if (a === '--dry-run')
            flags.add('dry-run');
        else if (a === '-h' || a === '--help')
            flags.add('help');
        else if (a === '-v' || a === '--version')
            flags.add('version');
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
        }
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
        case 'evaluate':
        case 'repid':
        case 'proof':
        case 'badge':
        case 'check': {
            const operand = rest[0];
            if (!operand) {
                const what = cmd === 'verify' || cmd === 'evaluate'
                    ? '"<text>"'
                    : cmd === 'check'
                        ? '<github-actions-run-url> or "<sentence>"'
                        : '<agentIdOrSlug>';
                return {
                    command: cmd,
                    json,
                    verify,
                    markdown: flags.has('markdown'),
                    error: `\`trustshell ${cmd}\` requires ${what}`,
                };
            }
            // `check` with a non-URL operand is a sentence: join the words so an unquoted
            // sentence is checked whole rather than as its first word.
            const full = cmd === 'check' && !(0, claim_1.isUrlOperand)(operand) ? rest.join(' ') : operand;
            return { command: cmd, operand: full, json, verify, markdown: flags.has('markdown') };
        }
        case 'status':
            return { command: 'status', json, verify };
        case 'remember': {
            const text = rest.join(' ').trim();
            if (!text) {
                return {
                    command: 'remember',
                    json,
                    verify,
                    error: '`trustshell remember` requires "<text>" or "<key> <value>"',
                };
            }
            if (rest.length >= 2) {
                const key = (rest[0] ?? '').trim();
                const value = rest.slice(1).join(' ').trim();
                if (!key || !value) {
                    return {
                        command: 'remember',
                        json,
                        verify,
                        error: '`trustshell remember` requires "<key> <value>"',
                    };
                }
                return { command: 'remember', key, operand: value, json, verify };
            }
            return { command: 'remember', operand: text, json, verify };
        }
        case 'recall': {
            const key = rest.join(' ').trim();
            return key ? { command: 'recall', key, json, verify } : { command: 'recall', json, verify };
        }
        case 'redact': {
            const key = rest.join(' ').trim();
            if (!key) {
                return {
                    command: 'redact',
                    json,
                    verify,
                    error: '`trustshell redact` requires <key>',
                };
            }
            return { command: 'redact', key, json, verify };
        }
        case 'bind-status':
            return { command: 'bind-status', json, verify };
        case 'traps':
            return { command: 'traps', json, verify };
        case 'inspect':
        case 'report':
            // Operand is OPTIONAL: inspect and report default to `.trustshell/`.
            return {
                command: cmd,
                json,
                verify,
                force: flags.has('force'),
                pai: flags.has('pai'),
                from: values['from'],
                session: values['session'],
                evidence: values['evidence'],
                name: values['name'],
                answers: values['answers'],
                ...(rest[0] !== undefined ? { operand: rest[0] } : {}),
            };
        case 'init': {
            // Operand is OPTIONAL: init defaults to cwd. `dry-run` is not a directory.
            const positional = rest[0];
            const dryWord = flags.has('pai') && positional === 'dry-run';
            return {
                command: 'init',
                json,
                verify,
                force: flags.has('force'),
                pai: flags.has('pai'),
                dryRun: flags.has('dry-run') || dryWord,
                name: values['name'],
                answers: values['answers'],
                ...(positional !== undefined && !dryWord ? { operand: positional } : {}),
            };
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
 * VETO fails the build (exit 1); NOT_CHECKED exits 2, never 0; PASS and FLAG succeed (exit 0) —
 * a soft FLAG is informational, not a gate failure, matching the SDK's `ok`.
 */
function verdictExitCode(verdict) {
    if (verdict === 'VETO')
        return exports.EXIT.VETO;
    if (verdict === 'PASS' || verdict === 'FLAG')
        return exports.EXIT.OK;
    return exports.EXIT.NOT_CHECKED;
}
/** Human-readable one-line verdict banner (no color deps — plain, CI-log-safe). */
function formatVerdictLine(r) {
    // NOT_CHECKED gets no check mark and no trust number: nothing was earned.
    if (r.verdict === 'NOT_CHECKED')
        return '○ NOT_CHECKED  HAL did not decide. This is not a pass.';
    const mark = r.verdict === 'VETO' ? '✗' : r.verdict === 'FLAG' ? '⚠' : '✓';
    return `${mark} ${r.verdict}  trust ${r.trustScore}/100`;
}
/**
 * Format a full verify result for human terminal output. "You have a receipt." is printed only
 * when a receipt was actually written: it used to print on every PASS, including runs whose
 * receipt line said NOT_CHECKED.
 */
function formatVerify(r, opts = {}) {
    const lines = [formatVerdictLine(r)];
    if (r.decisionReason)
        lines.push(`  ${r.decisionReason}`);
    if (r.evidence && r.evidence.length) {
        lines.push('  evidence:');
        for (const e of r.evidence)
            lines.push(`    - ${e}`);
    }
    if (r.verdict === 'PASS' && opts.receiptWritten === true)
        lines.push('You have a receipt. Paste another claim when you want.');
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
    out: (s) => process.stdout.write((0, scrub_print_1.scrubPrinted)(s) + '\n'),
    err: (s) => process.stderr.write((0, scrub_print_1.scrubPrinted)(s) + '\n'),
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
        case 'status': {
            const text = await (0, status_1.buildStatusReport)({ env: process.env, fetchImpl: fetch });
            io.out(args.json ? JSON.stringify((0, status_1.statusJsonFromText)(text), null, 2) : text);
            return exports.EXIT.OK;
        }
        case 'remember': {
            try {
                const value = String(args.operand ?? '');
                if ((0, remember_1.refusedValue)(value)) {
                    io.err('remember refused');
                    return exports.EXIT.USAGE;
                }
                if (args.key) {
                    const stored = (0, remember_1.rememberKey)(args.key, value);
                    if (!stored) {
                        io.err('remember refused');
                        return exports.EXIT.USAGE;
                    }
                }
                else
                    (0, remember_1.rememberNote)(value);
                io.out('remembered');
                return exports.EXIT.OK;
            }
            catch (e) {
                io.err(`remember failed: ${e?.message ?? String(e)}`);
                return exports.EXIT.RUNTIME;
            }
        }
        case 'recall': {
            try {
                io.out(args.key ? (0, recall_1.recallKey)(args.key) : (0, recall_1.recallNotes)());
                return exports.EXIT.OK;
            }
            catch (e) {
                io.err(`recall failed: ${e?.message ?? String(e)}`);
                return exports.EXIT.RUNTIME;
            }
        }
        case 'redact': {
            try {
                io.out((0, redact_key_1.redactKey)(args.key));
                return exports.EXIT.OK;
            }
            catch (e) {
                io.err(`redact failed: ${e?.message ?? String(e)}`);
                return exports.EXIT.RUNTIME;
            }
        }
        case 'bind-status': {
            const text = await (0, bind_status_1.bindStatusText)({ env: process.env, fetchImpl: fetch });
            io.out(text);
            return exports.EXIT.OK;
        }
        case 'traps': {
            const rows = (0, traps_1.buildTrapsList)(process.cwd());
            io.out((0, traps_1.formatTrapsList)(rows, args.json));
            return exports.EXIT.OK;
        }
        case 'verify':
        case 'evaluate': {
            const claim = String(args.operand ?? '');
            const lane = await (0, laya_lane_1.resolveLayaLane)(claim, process.env, fetch);
            if (lane === 'ask') {
                io.out('ASK');
                return exports.EXIT.ASK;
            }
            if (lane === 'cheap') {
                const verdictLine = 'laya cheap NOT_CHECKED';
                if (args.json) {
                    io.out(JSON.stringify({
                        receipt_written: false,
                        family_host_verdict: verdictLine,
                    }, null, 2));
                }
                else {
                    io.out(verdictLine);
                }
                // Laya's cheap lane sends nothing to HAL, so nothing was checked: exit 2, never the PASS code.
                return exports.EXIT.NOT_CHECKED;
            }
            const honestyPromise = (0, status_1.loadHonestyBody)({ env: process.env, fetchImpl: fetch });
            const passFrom = (body) => (body == null ? ['first-pass NOT_CHECKED'] : (0, status_1.firstPassLines)(body)).join('\n');
            try {
                const r = await (0, action_envelope_1.runEnvelopedAction)({ origin: 'Cli', actionClass: 'verify', policyId: 'hal' }, () => client.verifyOutput(args.operand));
                const body = await honestyPromise;
                const pass = passFrom(body);
                const posted = await (0, status_1.postHalReceipt)({
                    env: process.env,
                    fetchImpl: fetch,
                    body,
                    verdict: r.verdict,
                });
                const receipt = posted.status;
                if (args.json) {
                    const offline = process.env.OFFLINE === '1';
                    const verdictLine = offline ? 'NOT_CHECKED' : (0, status_1.familyHostVerdictLine)(body, r.verdict);
                    const payload = {
                        receipt_written: (0, status_1.receiptWrittenValue)(receipt),
                        family_host_verdict: verdictLine,
                        ...(offline ? {} : r),
                        firstPass: pass,
                    };
                    payload.receipt_id = posted.receiptId;
                    const counted = offline ? undefined : (0, status_1.firstPassObject)(body);
                    if (counted)
                        payload.first_pass = counted;
                    const postHal = offline ? undefined : (0, status_1.postHalValue)(body);
                    if (postHal)
                        payload.post_hal = postHal;
                    const honestyRows = offline ? undefined : (0, status_1.honestyRowsValue)(body);
                    if (honestyRows !== undefined)
                        payload.honesty_rows = honestyRows;
                    io.out(JSON.stringify(payload, null, 2));
                }
                else {
                    io.out(formatVerify(r, { receiptWritten: (0, status_1.receiptWrittenValue)(receipt) === true }));
                    io.out(pass);
                    if ((0, status_1.trustshellApiUrlSet)(process.env))
                        io.out((0, status_1.honestyRowsLine)(body));
                    io.out(`receipt-id ${posted.receiptId}`);
                    const receiptLine = (0, status_1.receiptHumanLine)(receipt);
                    if (receiptLine)
                        io.out(receiptLine);
                    io.out((0, status_1.familyHostVerdictLine)(body, r.verdict));
                }
                return verdictExitCode(r.verdict);
            }
            catch (e) {
                io.err(`verify failed: ${e?.message ?? String(e)}`);
                const body = await honestyPromise;
                io.out(passFrom(body));
                if ((0, status_1.trustshellApiUrlSet)(process.env))
                    io.out((0, status_1.honestyRowsLine)(body));
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
        case 'check': {
            if (!(0, claim_1.isUrlOperand)(String(args.operand ?? ''))) {
                return runClaimCheck(String(args.operand ?? ''), args.json, io);
            }
            // GitHub-only. Deliberately does NOT touch `client` — no backend, no key,
            // no account. That independence is the command's entire value.
            try {
                const r = await (0, check_1.runCheck)(args.operand);
                if (args.json)
                    io.out(JSON.stringify(r, null, 2));
                else
                    io.out((0, check_1.formatCheckCard)(r));
                return (0, check_1.checkExitCode)(r.verdict);
            }
            catch (e) {
                if (e instanceof check_1.CheckError) {
                    io.err(`check failed: ${e.message}`);
                    return e.usage ? exports.EXIT.USAGE : exports.EXIT.RUNTIME;
                }
                io.err(`check failed: ${e?.message ?? String(e)}`);
                return exports.EXIT.RUNTIME;
            }
        }
        case 'init': {
            if (args.pai && args.dryRun) {
                io.out('NOT_MINTED');
                return exports.EXIT.OK;
            }
            if (args.pai) {
                const fs = require('node:fs');
                const { spawnSync } = require('node:child_process');
                const r = runInitPai({
                    exists: (p) => fs.existsSync(p),
                    spawn: (cmd, argv) => spawnSync(cmd, argv, { stdio: 'inherit' }),
                }, { cliDir: __dirname, name: args.name, answers: args.answers, force: args.force });
                if (r.missing) {
                    io.err(`init --pai: ${exports.INIT_PAI_SCRIPT} is not in this install.`);
                    io.err(`equivalent path: ${exports.INIT_PAI_DOC}`);
                    return r.code;
                }
                return r.code;
            }
            // No network, no account, no telemetry. One directory, one file.
            const fs = require('node:fs');
            const impl = {
                exists: (p) => fs.existsSync(p),
                mkdirp: (p) => { fs.mkdirSync(p, { recursive: true }); },
                writeFile: (p, data) => { fs.writeFileSync(p, data, 'utf8'); },
            };
            try {
                const r = (0, init_1.runInit)(impl, { cwd: args.operand ?? '.', force: args.force === true });
                if (args.json)
                    io.out(JSON.stringify(r, null, 2));
                else
                    io.out((0, init_1.formatInitCard)(r));
                return (0, init_1.initExitCode)(r.outcome);
            }
            catch (e) {
                io.err(`init failed: ${e?.message ?? String(e)}`);
                return exports.EXIT.RUNTIME;
            }
        }
        case 'inspect': {
            // Local file only. Opens no socket.
            const fs = require('node:fs');
            const path = args.operand ?? `${init_1.TRUSTSHELL_DIR}/session.jsonl`;
            try {
                if (!fs.existsSync(path)) {
                    // A missing log is NOT CHECKED, never "clean". Exit 3.
                    const r = (0, inspect_1.noLog)(path);
                    if (args.json)
                        io.out(JSON.stringify(r, null, 2));
                    else
                        io.out((0, inspect_1.formatInspectCard)(r));
                    return (0, inspect_1.inspectExitCode)(r.verdict);
                }
                const text = fs.readFileSync(path, 'utf8');
                const from = args.from;
                if (from !== undefined && from !== 'trustshell' && from !== 'claude-code') {
                    io.err(`inspect: unknown --from format "${from}" (known: trustshell, claude-code)`);
                    return exports.EXIT.USAGE;
                }
                const r = from === 'claude-code' ? (0, inspect_1.readClaudeCode)(text, path) : (0, inspect_1.verifyChain)(text, path);
                if (args.json)
                    io.out(JSON.stringify(r, null, 2));
                else
                    io.out((0, inspect_1.formatInspectCard)(r));
                return (0, inspect_1.inspectExitCode)(r.verdict);
            }
            catch (e) {
                io.err(`inspect failed: ${e?.message ?? String(e)}`);
                return exports.EXIT.RUNTIME;
            }
        }
        case 'report': {
            // NO FETCH. External evidence arrives as a file the operator produced with
            // `check --json`. There is deliberately no URL parameter here.
            const fs = require('node:fs');
            try {
                const sessionPath = args.session ?? `${init_1.TRUSTSHELL_DIR}/session.jsonl`;
                const session = fs.existsSync(sessionPath)
                    ? (0, inspect_1.verifyChain)(fs.readFileSync(sessionPath, 'utf8'), sessionPath)
                    : null;
                let evidence = null;
                if (args.evidence !== undefined) {
                    if (!fs.existsSync(args.evidence)) {
                        io.err(`report: evidence file not found: ${args.evidence}`);
                        return exports.EXIT.USAGE;
                    }
                    try {
                        evidence = JSON.parse(fs.readFileSync(args.evidence, 'utf8'));
                    }
                    catch {
                        io.err(`report: evidence file is not valid JSON: ${args.evidence}`);
                        return exports.EXIT.USAGE;
                    }
                }
                const profilePath = `${init_1.TRUSTSHELL_DIR}/${init_1.PROFILE_FILE}`;
                const profile = fs.existsSync(profilePath)
                    ? (0, profile_1.parseProfile)(fs.readFileSync(profilePath, 'utf8')).profile
                    : (0, profile_1.defaultProfile)();
                const r = (0, report_1.buildReport)({ session, evidence, profile });
                if (args.json)
                    io.out(JSON.stringify(r, null, 2));
                else
                    io.out((0, report_1.formatReportCard)(r));
                return (0, report_1.reportExitCode)(r.verdict);
            }
            catch (e) {
                io.err(`report failed: ${e?.message ?? String(e)}`);
                return exports.EXIT.RUNTIME;
            }
        }
        default:
            io.out(HELP);
            return exports.EXIT.OK;
    }
}
/**
 * `trustshell check "<sentence>"` — the sentence form. Calls {@link classifyClaim}, the
 * SAME function the MCP `check_claim` tool calls, so the two cannot drift.
 * Exit codes: pass 0, veto 1, not-checked 2, error 3 (nothing was sent).
 */
async function runClaimCheck(sentence, json, io) {
    try {
        const r = await (0, claim_1.classifyClaim)(sentence);
        if (json) {
            io.out(JSON.stringify(r, null, 2));
        }
        else {
            io.out(r.label);
            io.out((0, claim_1.explainClaim)(r));
            const path = (0, claim_1.pathLine)(r);
            if (path)
                io.out(path);
            if (r.question)
                io.out(`One question: ${r.question} Answer it by checking the sentence again with your answer added.`);
            if (r.scrubbed)
                io.out(claim_1.SCRUBBED_LINE);
        }
        return (0, claim_1.claimExitCode)(r.label);
    }
    catch (e) {
        const msg = e instanceof claim_1.ClaimError ? e.message : `unexpected: ${e?.message ?? String(e)}`;
        if (json)
            io.out(JSON.stringify({ label: 'error', error: msg }, null, 2));
        else {
            io.out('error');
            io.out(`Could not check: ${msg}. Nothing was labelled.`);
        }
        return claim_1.CLAIM_EXIT.error;
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
function isEntryPath(argvPath, selfPath) {
    if (!argvPath)
        return false;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { realpathSync } = require('node:fs');
        return realpathSync(argvPath) === realpathSync(selfPath);
    }
    catch {
        // realpath can throw on an exotic filesystem or a deleted path; fall back to
        // the old shape rather than refusing to boot at all.
        return /[\\/]cli[\\/]index\.js$/.test(argvPath) || /trustshell$/.test(argvPath);
    }
}
const isEntry = (() => {
    try {
        return isEntryPath(process.argv[1], __filename);
    }
    catch {
        return false;
    }
})();
if (isEntry) {
    main().catch((e) => {
        const detail = e instanceof Error ? (e.stack ?? e.message) : String(e);
        process.stderr.write((0, scrub_print_1.scrubPrinted)(`trustshell: fatal: ${detail}\n`));
        process.exit(exports.EXIT.RUNTIME);
    });
}
