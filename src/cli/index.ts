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
import { TrustShell, type VerifyOutputResult, type ProofPresentation, type Verdict } from '../lib/trustshell';
import { runEnvelopedAction } from '../lib/action-envelope';
import { formatIdentity, type AgentIdentity } from '../lib/identity';
import { renderProofBadge, renderProofBadgeMarkdown, proofBadgeStatus } from '../lib/badge';
import { resolvePackageVersion } from '../lib/version';
import { runCheck, formatCheckCard, checkExitCode, CheckError } from '../lib/check';
import { claimsExitCode, inspectRunClaims } from '../lib/action-evidence';
import { renderCardHtml, renderCardMarkdown } from '../lib/evidence-card';
import { classifyClaim, claimExitCode, explainClaim, isUrlOperand, ClaimError, CLAIM_EXIT, SCRUBBED_LINE, pathLine, OFFLINE_REASON } from '../lib/claim';
import { runInit, formatInitCard, initExitCode, TRUSTSHELL_DIR, PROFILE_FILE, type InitFs } from '../lib/init';
import {
  verifyChain,
  readClaudeCode,
  noLog,
  formatInspectCard,
  inspectExitCode,
} from '../lib/inspect';
import { buildReport, formatReportCard, reportExitCode, type EvidenceDoc } from '../lib/report';
import { buildStatusReport, familyHostVerdictLine, firstPassLines, firstPassObject, honestyRowsLine, honestyRowsValue, loadHonestyBody, postHalReceipt, postHalValue, receiptHumanLine, receiptWrittenValue, statusJsonFromText, trustshellApiUrlSet } from './status';
import { parseProfile, defaultProfile } from '../lib/profile';
import { nodeProfileFs, parseProfileOp, runProfile, terminalAsk, type ProfileOp } from './profile';
import { resolveLayaLane } from './laya-lane';
import { rememberKey, rememberNote, refusedValue } from './remember';
import { recallKey, recallNotes } from './recall';
import { redactKey } from './redact-key';
import {
  explainQuarantine,
  listQuarantined,
  releaseByGround,
  releaseByOperator,
  releaseExitCode,
  rememberUntrusted,
  type QuarantineListItem,
  type QuarantineRecord,
  type ReleaseOutcome,
} from '../memory/quarantine';
import { releaseByHal } from '../memory/quarantine-hal';
import { bindStatusText } from './bind-status';
import { scrubPrinted } from './scrub-print';
import { buildTrapsList, formatTrapsList } from './traps';
import { kernelReceipt, SIX_CLAIM_KEYS, type KernelReceiptRead } from '../lib/kernel-client';
import { groundClaims, splitPages, type GroundPage, type GroundResult, type GroundStatus } from '../lib/ground';
import { join } from 'node:path';
import { runLearn } from '../learn/cli';

/** Exit codes — a small, stable contract so CI scripts can branch on them. */
export const EXIT = {
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
} as const;

export type Command =
  | 'verify'
  | 'evaluate'
  | 'repid'
  | 'proof'
  | 'badge'
  | 'check'
  | 'receipt'
  | 'inspect'
  | 'init'
  | 'report'
  | 'profile'
  | 'status'
  | 'remember'
  | 'recall'
  | 'redact'
  | 'quarantine'
  | 'bind-status'
  | 'traps'
  | 'ground'
  | 'learn'
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
  /** init: run scripts/init-pai.mjs (PAI FACE — live register) instead of the blank profile. */
  pai?: boolean;
  /** init --pai: print NOT_MINTED and do not spawn the register script. No network. */
  dryRun?: boolean;
  /** init --pai: forwarded to scripts/init-pai.mjs */
  name?: string;
  /** init --pai: forwarded to scripts/init-pai.mjs (`job|cost|brain`) */
  answers?: string;
  /** inspect: read a foreign log through an adapter. Adapters always yield UNCHAINED. */
  from?: string;
  /** report: path to the session log. */
  session?: string;
  /** report: path to saved `check --json` output. `report` never fetches. */
  evidence?: string;
  /** remember/recall/redact: a local sqlite key. Absent on the one-argument note path. */
  key?: string;
  /** ground: the source file, the quote, and the optional page / value / kind / unit. */
  source?: string;
  quote?: string;
  page?: string;
  value?: string;
  kind?: string;
  unit?: string;
  /** ground: template / label text the document prints for every reader (repeatable `--echo`). */
  echoes?: string[];
  /** remember: the note is stored untrusted and quarantined (the default); --source labels it. */
  untrusted?: boolean;
  /**
   * remember: the operator vouches the note is theirs (`--trusted`), so it is stored trusted.
   * quarantine release: the operator vouches for a held note (`--trusted`). Never over MCP.
   */
  trusted?: boolean;
  /** remember: the document the untrusted note came from; its sha256 is recorded for a ground release. */
  sourceFile?: string;
  /** recall: also print quarantined notes, each marked [QUARANTINED: reason]. */
  includeQuarantined?: boolean;
  /** quarantine: list | explain | release, and the note id. */
  sub?: string;
  id?: string;
  /** quarantine release: `hal` runs the classify check (network); otherwise --source grounds it locally. */
  check?: string;
  /** check <runUrl>: the claim text to map onto the run. Always text, never a path. */
  claims?: string;
  /** check <runUrl>: a file holding the claim text. The only way a file is read. */
  claimsFile?: string;
  /** check <runUrl> --claims: also write record.json, card.md and card.html to this directory. */
  out?: string;
  /** check <runUrl> --claims: mark the cards DEMO. */
  demo?: boolean;
  /** learn: everything after `learn`, parsed by src/learn/cli.ts (its own verbs and options). */
  learnArgv?: string[];
  /** profile: the parsed subcommand (show / add / set / remove / interview). */
  profileOp?: ProfileOp;
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

/** Repo-relative path the published CLI must be able to spawn. */
export const INIT_PAI_SCRIPT = 'scripts/init-pai.mjs';
/** The path a stranger can run from a clone when the script is not in this install. */
export const INIT_PAI_DOC = 'node scripts/init-pai.mjs --name <n>';

/** `cliDir` is src/cli or dist/cli — both sit two levels below the package root. */
export function resolveInitPai(cliDir: string): string {
  return join(cliDir, '..', '..', INIT_PAI_SCRIPT);
}

export interface InitPaiFs {
  exists(p: string): boolean;
  spawn(cmd: string, args: string[]): { status: number | null };
}

/**
 * Spawn scripts/init-pai.mjs. Missing script → USAGE, never silent 0
 * (the unpublished-bin failure class).
 */
export function runInitPai(
  impl: InitPaiFs,
  opts: { cliDir: string; name?: string; answers?: string; force?: boolean },
): { code: number; missing: boolean; script: string } {
  const script = resolveInitPai(opts.cliDir);
  if (!impl.exists(script)) {
    return { code: EXIT.USAGE, missing: true, script };
  }
  const args = [script];
  if (opts.name) args.push('--name', opts.name);
  if (opts.answers) args.push('--answers', opts.answers);
  if (opts.force) args.push('--force');
  const r = impl.spawn(process.execPath, args);
  return { code: r.status === null ? EXIT.RUNTIME : r.status, missing: false, script };
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
  check <runUrl> --claims "<text>"
  check <runUrl> --claims-file <path>
                             Map what an agent said (a "done" message, a PR description) onto
                             what that run reports. Each claim is SUPPORTED, CONTRADICTED or
                             NOT_CHECKED by a fixed template: no model, no backend, api.github.com
                             only. --claims is always text; only --claims-file reads a file.
                             Prints a Markdown card; --json prints the record
                             (dev.trustshell.action-evidence/0.1-draft) and its RFC 8785 SHA-256.
      [--out <dir>]          Also write record.json, card.md and card.html into <dir>.
      [--demo]               Mark both cards DEMO.
                             EXIT 0 every claim SUPPORTED on a COMPLETE run, 1 a claim CONTRADICTED
                             or the run FAILED/INCONSISTENT, 3 anything NOT_CHECKED.
  check "<sentence>"         Label one sentence pass / veto / not-checked — the same label the
                             Chrome extension shows (POST <backend>/api/v1/classify). Any
                             operand that is not a URL is a sentence. Prints the label, then
                             one line of explanation; --json prints the response object.
                             EXIT 0 pass, 1 veto, 2 not-checked, 3 error. A timeout (6 s),
                             network failure, non-200 or off-contract body is not-checked.
  receipt <receiptId>        Read a policy-kernel receipt back (GET /api/v1/kernel/receipt/:id),
                             recompute its hash here, and print its SIX claims separately —
                             never one verdict. Needs REPID_API_KEY. EXIT 0 read and the hash
                             matches, 1 the hash does NOT match (treat as tampered), 3 not read.

  inspect [<path>]          Verify an append-only tool-call log. Reads a local file and
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
  profile [show]             Print .trustshell/profile.md. No network. Values, people you help,
                             style, constraints and model priorities are yours: nothing fills
                             them in, and report leaves them out unless share_personal is true.
  profile add value "<text>"           Add a value, ranked last (edit the file to re-rank).
  profile add person "<who>" [--why "<why>"]
  profile add constraint "<text>"      A line that must hold, e.g. "never leaves my device".
  profile set style <key> <value>      key: tone, detail, risk or hours.
  profile set priorities cost,quality,speed
                             Rank all three, most important first. Or --preset balanced,
                             cost-first, speed-first or quality-first. Stored only: nothing
                             sends it to a model yet.
  profile remove <section> <n>         values, people or constraints by number; style by key;
                             priorities with no number.
  profile interview          Three questions, each skippable. Who you help and what must never
      [--answers <a|b|c>]    happen go into the profile; this week's job is printed as a
                             trustshell learn job add hint, never stored here.
  status                     Print the after-create table, one Honesty A line, and counted first_pass fields. A NOT_CHECKED body or a missing column is NOT_CHECKED, never 0. post-HAL is printed only when post_hal_verdict is in the JSON. can_bind is true only when GET /readiness exact_true.HUMAN_AGENT_BIND_ENABLED is true. can_stake stays shadow — not live unless SAYS_STAKE_LIVE is the exact string 'true'.
  remember "<text>"          Write a note into the local sqlite memory, UNTRUSTED and QUARANTINED:
                             recall leaves it out until a check releases it. No network.
  remember --trusted "<text>"
                             You vouch you wrote it: stored trusted, and recall prints it.
  remember KEY VALUE         Save one value under KEY. Refuses a credential in EITHER position —
                             sb_secret_, db URIs, JWTs, PEM private keys, sk-/ghp_/AKIA/xoxb tokens,
                             labelled password=… . Publishable keys and emails are kept: not secrets.
                             Encoded secrets are NOT detected. No network.
  remember [--untrusted] [--source <label>] [--source-file <file>] "<text>"
                             Label where untrusted text came from. --source-file records the
                             document's sha256, which a ground release needs. Injection-looking
                             text is held for good. No network.
  recall                     Print saved notes. do_not_send rows print as a count only.
                             Quarantined notes are left out and counted on the last line.
      [--include-quarantined]
                             Also print them, each marked [QUARANTINED: reason].
  recall KEY                 Print the value for KEY. Missing is NOT_CHECKED, never empty.
  redact KEY                 Delete the KEY row. Missing is NOT_CHECKED. No network.
  quarantine list            Notes held in quarantine: id, source, reason. Never the text. No network.
  quarantine explain <id>    One note's taint record and text: provenance, source, reason, and which
                             check released it. Injection-looking text is described, never printed.
  quarantine release <id> --source <file> [--page N]
                             Release only if <file> is the document recorded with --source-file
                             (same sha256) AND the WHOLE note is found in it (ground VERIFIED).
                             No recorded document: NOT_CHECKED. Local, no network.
  quarantine release <id> --check hal
                             Release only if the DEFAULT classify endpoint says pass by votes, two
                             named deciders of different families both TRUE. NETWORK: POST
                             <backend>/api/v1/classify, after the same scrub as check.
  quarantine release <id> --trusted
                             You vouch for it (not a check): stored trusted, released_by says so.
                             release EXIT 0 released, 1 held (check failed), 2 not checked / no such note.
  learn <verb>               The learning loop, local: jobs you create, checks you register, your
                             corrections as lessons you accept, injected verbatim (max 5 / 400
                             tokens), unaided probes, spaced review, rulers. trustshell learn for
                             the verbs. No network.
  bind-status                Read after-create. Print can_bind. can_stake true stays shadow — not live. No send.
  traps                      List the ten local fixture HAL claims. Each row is NOT_CHECKED until a receipt id exists. No scoreboard. No HAL wins.
  ground --source <file> --quote "<text>"
                             Is the quote really in the source file? No model, no network.
                             Pages split on form feed (pdftotext); no form feed is page 1.
                             Prints the status, the reason and the matched line.
                             EXIT 0 VERIFIED, 1 VETO, 2 NOT_CHECKED (never a pass) or usage.
      [--page N]             The page the quote cites. Found only on another page is a VETO.
      [--kind number|date --value V]
                             Also check the value is in the quote (date: YYYY-MM-DD).
      [--unit <u>]           With --kind number: the value must be the number written right
                             before this unit (150 ft).
      [--echo "<text>"]      Template or label text the document prints for every reader.
                             Repeatable. A quote that only repeats it is NOT_CHECKED.
  report                     State what your log and your saved GitHub evidence TOGETHER
                             support, and where they disagree. NO NETWORK — evidence is a
                             file you produced. CONFIRMED (0) / INCONSISTENT (1) /
                             UNSUPPORTED (3).
      [--session <path>]     Session log (default .trustshell/session.jsonl).
      [--evidence <path>]    Saved output of \`trustshell check --json\`.

OPTIONS
  --                         End of options. What follows is text, even if it starts with a dash:
                             trustshell check -- "-5 is less than 3."
  --json                     Emit machine-readable JSON instead of human text.
  -h, --help                 Show this help.
  -v, --version              Show the version.

EXIT CODES
  0  HAL PASS (or soft FLAG) — safe to proceed        · check: COMPLETE
  1  HAL VETO — the claim did not pass                · check: FAILED / INCONSISTENT
  2  usage / bad arguments                            · verify: HAL did not decide (NOT_CHECKED)
                                                      · check "<sentence>": not-checked
  3  runtime error (network / backend / timeout)      · check: INCONCLUSIVE (NOT CHECKED)
  4  ASK — only when TRUSTSHELL_LAYA is set; HAL was not called

NETWORK EGRESS (what each command dials, and nothing else)
  verify · repid · proof · badge · status · bind-status   the HyperDAG backend (TRUSTSHELL_API_URL)
  receipt                          the HyperDAG backend (TRUSTSHELL_API_URL), /api/v1/kernel/receipt only
  check <runUrl>                   api.github.com only — no backend, no account
  check "<sentence>"               the HyperDAG backend (TRUSTSHELL_API_URL), /api/v1/classify only
  inspect                          NOTHING. Reads a local file.
  ground                           NOTHING. Reads the --source file.
  init                             NOTHING (default). --pai runs scripts/init-pai.mjs (live register).
  remember · recall · redact       NOTHING. Local sqlite only.
  learn                            NOTHING. Local sqlite only; check run executes your registered command.
  quarantine                       NOTHING, except release --check hal: the DEFAULT backend's /api/v1/classify
                                   only. A TRUSTSHELL_API_URL pointing elsewhere is not asked.
  profile                          NOTHING. Reads and writes .trustshell/profile.md.
  report                           NOTHING. It has no fetch and no URL parameter;
                                   external evidence arrives as a file you supply.

ENV
  REPID_API_KEY        optional API key (verify/repid/proof are keyless; receipt needs it)
  TRUSTSHELL_API_URL   override backend origin (default: live HyperDAG backend)

CI GATE EXAMPLE
  # fail the build if HAL vetoes a claim in your changelog
  trustshell verify "$(cat CHANGELOG_CLAIM.txt)" || exit 1
`;

/**
 * Is this argument shaped like an option (`-x`, `--long-name`, `--name=value`)? A claim that merely STARTS
 * with a dash, like `-5 is less than 3.` or `-1 is negative`, is text, not an option: it has a space, or a
 * digit right after the dash, which no flag of ours has. Anything option-shaped that we do not know stays a
 * usage error, so a typo such as `--jsno` still fails loudly instead of being sent as a claim.
 */
function looksLikeOption(a: string): boolean {
  return /^--?[A-Za-z][A-Za-z0-9-]*(=\S*)?$/.test(a);
}

/**
 * Parse CLI arguments into a {@link ParsedArgs}. PURE — no I/O, no network — so the
 * command routing + option handling can be unit-tested directly.
 *
 * `argv` is the slice AFTER the node binary + script path (i.e. `process.argv.slice(2)`).
 */
export function parseArgs(argv: string[]): ParsedArgs {
  // `learn` has its own verbs and options (src/learn/cli.ts); they never reach the flag loop below.
  if (argv[0] === 'learn') return { command: 'learn', learnArgv: argv.slice(1), json: false, verify: false };
  const flags = new Set<string>();
  const positionals: string[] = [];
  // Options that consume the NEXT argument. Indexed rather than for-of because a
  // value-taking flag has to be able to look ahead.
  const values: Record<string, string | undefined> = {};
  const VALUE_OPTS = new Set(['--from', '--session', '--evidence', '--name', '--answers', '--source', '--source-file', '--quote', '--page', '--value', '--kind', '--unit', '--check', '--why', '--preset', '--claims', '--claims-file', '--out']);
  // Their value is free text that may start with a dash (`--value -250.00`, a quoted list item), so
  // only something shaped like an option is refused there.
  const TEXT_VALUE_OPTS = new Set(['--quote', '--value', '--echo', '--why', '--claims']);
  // `--echo` may be given more than once; every value is kept, in order.
  const echoes: string[] = [];
  // After a bare `--` every argument is text, even one that starts with a dash: that is the standard way
  // to say "no more options", and the only way to pass a claim like `-5 is less than 3.` unambiguously.
  let optionsEnded = false;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i] as string;
    if (optionsEnded) positionals.push(a);
    else if (a === '--') optionsEnded = true;
    else if (a === '--json') flags.add('json');
    else if (a === '--verify') flags.add('verify');
    else if (a === '--markdown' || a === '--md') flags.add('markdown');
    else if (a === '--force') flags.add('force');
    else if (a === '--pai') flags.add('pai');
    else if (a === '--dry-run') flags.add('dry-run');
    else if (a === '--untrusted') flags.add('untrusted');
    else if (a === '--trusted') flags.add('trusted');
    else if (a === '--include-quarantined') flags.add('include-quarantined');
    else if (a === '--demo') flags.add('demo');
    else if (a === '-h' || a === '--help') flags.add('help');
    else if (a === '-v' || a === '--version') flags.add('version');
    else if (VALUE_OPTS.has(a) || a === '--echo') {
      const v = argv[i + 1];
      // A value-taking flag with nothing after it, or followed by another flag,
      // is a usage error rather than a silent undefined — otherwise
      // `--evidence` alone would quietly become "no evidence supplied" and
      // report UNSUPPORTED, which reads as a finding instead of a typo.
      if (v === undefined || (TEXT_VALUE_OPTS.has(a) ? looksLikeOption(v) : v.startsWith('-'))) {
        return { command: 'help', json: false, verify: false, error: `${a} requires a value` };
      }
      if (a === '--echo') echoes.push(v);
      else values[a.slice(2)] = v;
      i += 1;
    } else if (looksLikeOption(a)) {
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
    case 'evaluate':
    case 'repid':
    case 'proof':
    case 'badge':
    case 'check':
    case 'receipt': {
      const operand = rest[0];
      if (!operand) {
        const what =
          cmd === 'verify' || cmd === 'evaluate'
            ? '"<text>"'
            : cmd === 'check'
              ? '<github-actions-run-url> or "<sentence>"'
              : cmd === 'receipt'
                ? '<receiptId>'
                : '<agentIdOrSlug>';
        return {
          command: cmd,
          json,
          verify,
          markdown: flags.has('markdown'),
          error: `\`trustshell ${cmd}\` requires ${what}`,
        };
      }
      // `check` with a non-URL operand is a sentence, and `verify`/`evaluate` take free text: join the
      // words so an unquoted sentence is checked whole rather than as its first word.
      // (`trustshell verify The capital of France is Paris.` used to send only "The" to HAL.)
      const isFreeText = cmd === 'verify' || cmd === 'evaluate' || (cmd === 'check' && !isUrlOperand(operand));
      const full = isFreeText ? rest.join(' ') : operand;
      const claimsText = values['claims'];
      const claimsFile = values['claims-file'];
      if (cmd === 'check' && (claimsText !== undefined || claimsFile !== undefined || values['out'] !== undefined || flags.has('demo'))) {
        // Refused rather than ignored: `check "<sentence>" --claims x` would otherwise send the
        // sentence to the classify endpoint and quietly drop the claims the caller meant to map.
        if (isFreeText) {
          return { command: 'check', json, verify, error: '--claims and --claims-file need a GitHub Actions run URL: trustshell check <runUrl> --claims "<text>"' };
        }
        if (claimsText !== undefined && claimsFile !== undefined) {
          return { command: 'check', json, verify, error: 'give --claims "<text>" or --claims-file <path>, not both' };
        }
        if (claimsText === undefined && claimsFile === undefined) {
          return { command: 'check', json, verify, error: '--out and --demo apply only with --claims or --claims-file' };
        }
        return { command: 'check', operand: full, json, verify, claims: claimsText, claimsFile, out: values['out'], demo: flags.has('demo') };
      }
      return { command: cmd, operand: full, json, verify, markdown: flags.has('markdown') };
    }
    case 'status':
      return { command: 'status', json, verify };
    case 'remember': {
      const text = rest.join(' ').trim();
      const labelled = values['source'] !== undefined || values['source-file'] !== undefined;
      if (flags.has('trusted') && flags.has('untrusted')) {
        return { command: 'remember', json, verify, error: '--trusted and --untrusted cannot both be set' };
      }
      if (flags.has('trusted') && labelled) {
        return { command: 'remember', json, verify, error: '--source and --source-file label untrusted text; a --trusted note is yours' };
      }
      if (flags.has('untrusted') || labelled) {
        // Explicit untrusted note. Always ONE note: every word after the flags is the text. There is
        // no KEY VALUE form here; keyed values carry no taint label in v0.
        if (!text) return { command: 'remember', json, verify, error: '`trustshell remember --untrusted` requires "<text>"' };
        return { command: 'remember', operand: text, untrusted: true, source: values['source'], sourceFile: values['source-file'], json, verify };
      }
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
      // One note. UNTRUSTED unless the operator says --trusted: a shell command can be run by an
      // agent piping a web page as easily as by a person typing, and nothing here can tell which.
      return flags.has('trusted')
        ? { command: 'remember', operand: text, trusted: true, json, verify }
        : { command: 'remember', operand: text, untrusted: true, json, verify };
    }
    case 'recall': {
      const key = rest.join(' ').trim();
      if (flags.has('include-quarantined')) {
        if (key) return { command: 'recall', json, verify, error: '--include-quarantined goes with `recall` alone (notes), not `recall KEY`' };
        return { command: 'recall', includeQuarantined: true, json, verify };
      }
      return key ? { command: 'recall', key, json, verify } : { command: 'recall', json, verify };
    }
    case 'quarantine': {
      const [sub, id, ...extra] = rest;
      const usage = (error: string): ParsedArgs => ({ command: 'quarantine', json, verify, error });
      if (sub === 'list') {
        if (id !== undefined) return usage(`unexpected argument: ${id}`);
        return { command: 'quarantine', sub, json, verify };
      }
      if (sub !== 'explain' && sub !== 'release') return usage('`trustshell quarantine` takes list, explain <id> or release <id>');
      if (!id || !/^[1-9]\d*$/.test(id)) return usage(`\`quarantine ${sub}\` requires a note id (a whole number; see quarantine list)`);
      if (extra.length) return usage(`unexpected argument: ${extra[0]}`);
      if (sub === 'explain') return { command: 'quarantine', sub, id, json, verify };
      const check = values['check'];
      const source = values['source'];
      const trusted = flags.has('trusted');
      if (check !== undefined && check !== 'hal') return usage('--check takes hal (or use --source <file> to ground it locally)');
      if ([check === 'hal', source !== undefined, trusted].filter(Boolean).length !== 1) {
        return usage(
          '`quarantine release` takes exactly one of: --source <file> (local ground check), --check hal (network), --trusted (you vouch for it)',
        );
      }
      if (values['page'] !== undefined && (source === undefined || !/^[1-9]\d*$/.test(values['page']))) {
        return usage('--page goes with --source and must be a whole number, 1 or more');
      }
      return { command: 'quarantine', sub, id, check, source, trusted, page: values['page'], json, verify };
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
    case 'ground': {
      const g = {
        source: values['source'],
        quote: values['quote'],
        page: values['page'],
        value: values['value'],
        kind: values['kind'],
        unit: values['unit'],
      };
      const usage = (error: string): ParsedArgs => ({ command: 'ground', json, verify, error });
      if (!g.source || g.quote === undefined) return usage('`trustshell ground` requires --source <file> and --quote "<text>"');
      // A stray word is almost always an unquoted quote (`--quote walked 50 ft`): refuse it rather
      // than ground the first word alone.
      if (rest.length) return usage(`unexpected argument: ${rest[0]} (quote the --quote text)`);
      if (g.page !== undefined && !/^[1-9]\d*$/.test(g.page)) return usage('--page must be a whole number, 1 or more');
      if (g.kind !== undefined && !['text', 'number', 'date'].includes(g.kind)) return usage('--kind must be text, number or date');
      // A value with no kind to read it as would be silently ignored, so the two travel together.
      if ((g.kind === 'number' || g.kind === 'date') !== (g.value !== undefined)) return usage('--value goes with --kind number or --kind date');
      if (g.unit !== undefined && g.kind !== 'number') return usage('--unit goes with --kind number');
      return { command: 'ground', json, verify, ...g, ...(echoes.length ? { echoes } : {}) };
    }
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
    case 'profile': {
      const op = parseProfileOp(rest, { why: values['why'], preset: values['preset'], answers: values['answers'] });
      return 'error' in op ? { command: 'profile', json, verify, error: op.error } : { command: 'profile', json, verify, profileOp: op };
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
export function verdictExitCode(verdict: Verdict): number {
  if (verdict === 'VETO') return EXIT.VETO;
  if (verdict === 'PASS' || verdict === 'FLAG') return EXIT.OK;
  return EXIT.NOT_CHECKED;
}

/** Human-readable one-line verdict banner (no color deps — plain, CI-log-safe). */
export function formatVerdictLine(r: Pick<VerifyOutputResult, 'verdict' | 'trustScore'>): string {
  // NOT_CHECKED gets no check mark and no trust number: nothing was earned.
  if (r.verdict === 'NOT_CHECKED') return '○ NOT_CHECKED  HAL did not decide. This is not a pass.';
  const mark = r.verdict === 'VETO' ? '✗' : r.verdict === 'FLAG' ? '⚠' : '✓';
  return `${mark} ${r.verdict}  trust ${r.trustScore}/100`;
}

/**
 * Format a full verify result for human terminal output. "You have a receipt." is printed only
 * when a receipt was actually written: it used to print on every PASS, including runs whose
 * receipt line said NOT_CHECKED.
 */
export function formatVerify(r: VerifyOutputResult, opts: { receiptWritten?: boolean } = {}): string {
  const lines: string[] = [formatVerdictLine(r)];
  if (r.decisionReason) lines.push(`  ${r.decisionReason}`);
  if (r.evidence && r.evidence.length) {
    lines.push('  evidence:');
    for (const e of r.evidence) lines.push(`    - ${e}`);
  }
  if (r.verdict === 'PASS' && opts.receiptWritten === true) lines.push('You have a receipt. Paste another claim when you want.');
  return lines.join('\n');
}

/** `trustshell ground` exit code: the same pass / veto / not-checked codes as `verify`. PURE. */
export function groundExitCode(status: GroundStatus): number {
  if (status === 'VERIFIED') return EXIT.OK;
  if (status === 'VETO') return EXIT.VETO;
  return EXIT.NOT_CHECKED;
}

/** The original line(s) of the page that hold the span, whitespace collapsed for one display line. */
export function matchedLine(pages: GroundPage[], r: Pick<GroundResult, 'page_index' | 'char_span'>): string | null {
  // By index, not by page number: page numbers can repeat, and the span belongs to one page.
  const page = r.page_index === null ? undefined : pages[r.page_index];
  if (!page || !r.char_span) return null;
  const [s, e] = r.char_span;
  const from = page.text.lastIndexOf('\n', s - 1) + 1;
  const to = page.text.indexOf('\n', e);
  return page.text.slice(from, to === -1 ? undefined : to).replace(/\s+/g, ' ').trim();
}

/** Human card for `trustshell ground`: status and reason, the matched line, what it does not establish. */
export function formatGround(r: GroundResult, pages: GroundPage[], limitations: readonly string[]): string {
  const lines = [`${r.status}  ${r.reason}`];
  const line = matchedLine(pages, r);
  if (line !== null) lines.push(`${r.reason === 'page_mismatch' ? 'found on page' : 'page'} ${r.found_on_page}: ${line}`);
  if (r.status === 'NOT_CHECKED') lines.push('Not checked. This is not a pass.');
  lines.push('', 'What this does not establish', ...limitations.map((l) => `* ${l}`));
  return lines.join('\n');
}

/** Format a RepID result for human terminal output. */
export function formatRepid(agentId: string, repid: number, tier: string, identity?: AgentIdentity): string {
  // Two fields on two lines: the score (how it has behaved) and the ID (which agent it is).
  return `${agentId}\n  RepID ${repid}  (${tier})\n${formatIdentity(identity)}`;
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

const CLAIM_LABEL: Record<(typeof SIX_CLAIM_KEYS)[number], string> = {
  integrity: 'Integrity',
  authenticity: 'Authenticity',
  observation: 'Observation',
  correctness: 'Correctness',
  authorization: 'Authorization',
  containment: 'Containment',
};

/** `trustshell receipt`: the hash check, then the six claims one by one. Deliberately no rollup line. */
export function formatKernelReceipt(r: KernelReceiptRead): string {
  if (!r.ok) return `receipt NOT read: ${r.detail} (${r.reason})`;
  const lines = [`kernel receipt ${r.receipt_id}`, `  hash  ✓ recomputed here, matches ${r.receipt.header.receipt_hash}`, ''];
  if (!r.six_claims) return [...lines, `  six claims not shown: ${r.six_claims_note}`].join('\n');
  lines.push('  There is no single verdict. Six separate claims, each with its own gaps:');
  for (const k of SIX_CLAIM_KEYS) {
    const c = r.six_claims.predicate.claims[k];
    lines.push(`  ${CLAIM_LABEL[k].padEnd(14)} ${c.status.padEnd(14)} ${c.statement}`);
    if (c.gaps.length) lines.push(`  ${''.padEnd(29)} does not establish: ${c.gaps.join(' · ')}`);
  }
  lines.push('', '  What this receipt does not establish:', ...r.six_claims.predicate.what_this_does_not_establish.map((g) => `    - ${g}`));
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
  out: (s) => process.stdout.write(scrubPrinted(s) + '\n'),
  err: (s) => process.stderr.write(scrubPrinted(s) + '\n'),
};

/**
 * Execute a parsed command against a client and return the process exit code.
 * The client is injected so tests can pass a mock (no live network).
 */
/** `quarantine list`: one line per held note: id, source, reason. Never the text (use explain). */
export function formatQuarantineList(rows: readonly QuarantineListItem[]): string {
  if (rows.length === 0) return 'quarantined COUNT 0';
  const lines = rows.map((r) => `${r.id}  source=${r.source}  reason=${r.reason ?? 'untrusted, not yet checked'}`);
  return [...lines, `quarantined COUNT ${rows.length}`].join('\n');
}

/** `quarantine explain <id>`: the whole taint record, one field per line. */
export function formatQuarantineRecord(r: QuarantineRecord): string {
  return [
    `note ${r.id}`,
    `provenance  ${r.provenance}`,
    `source      ${r.source}`,
    `quarantined ${r.quarantined ? 'yes' : 'no'}`,
    `reason      ${r.reason ?? '-'}`,
    `released_by ${r.released_by ?? '-'}`,
    `released_at ${r.released_at ?? '-'}`,
    `source_doc  ${r.source_recorded ? 'recorded (sha256): a ground release must present this document' : 'none recorded: a ground release is NOT_CHECKED'}`,
    `created_at  ${r.created_at}`,
    `text        ${r.body === null ? '[withheld: injection-looking text is described, never printed]' : r.body}`,
  ].join('\n');
}

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

    case 'status': {
      const text = await buildStatusReport({ env: process.env, fetchImpl: fetch });
      io.out(args.json ? JSON.stringify(statusJsonFromText(text), null, 2) : text);
      return EXIT.OK;
    }

    case 'remember': {
      if (args.untrusted) {
        try {
          let sourceText: string | null = null;
          if (args.sourceFile !== undefined) {
            // Local file only. Opens no socket. Only its sha256 is stored.
            const fs = require('node:fs') as typeof import('node:fs');
            try {
              sourceText = fs.readFileSync(args.sourceFile, 'utf8');
            } catch {
              io.err(`remember: cannot read the source file: ${args.sourceFile}`);
              return EXIT.USAGE;
            }
          }
          const rec = rememberUntrusted(String(args.operand ?? ''), {
            source: args.source ?? (args.sourceFile !== undefined ? `file:${args.sourceFile}` : 'cli:remember'),
            sourceText,
          });
          if (args.json) io.out(JSON.stringify(rec, null, 2));
          else {
            io.out(`quarantined ${rec.id} (${rec.reason})`);
            io.err(`untrusted by default. If you wrote it yourself: trustshell quarantine release ${rec.id} --trusted (or remember --trusted next time)`);
          }
          return EXIT.OK;
        } catch (e: any) {
          if (e?.message === 'remember refused') {
            io.err('remember refused');
            return EXIT.USAGE;
          }
          io.err(`remember failed: ${e?.message ?? String(e)}`);
          return EXIT.RUNTIME;
        }
      }
      try {
        const value = String(args.operand ?? '');
        if (refusedValue(value)) {
          io.err('remember refused');
          return EXIT.USAGE;
        }
        if (args.key) {
          // MESSAGE ONLY — rememberKey below is the enforcement point, and it checks the key
          // itself. This branch exists so the refusal can name WHICH argument was the problem.
          // `remember` takes two positionals, so the common failure is reversing them; a bare
          // "remember refused" then sends the user hunting through a value that was fine.
          // The offending text is never echoed: naming the position is enough to fix the call.
          if (refusedValue(args.key)) {
            io.err('remember refused — the KEY looks like a credential. Arguments reversed? Usage: remember KEY VALUE');
            return EXIT.USAGE;
          }
          const stored = rememberKey(args.key, value);
          if (!stored) {
            io.err('remember refused');
            return EXIT.USAGE;
          }
        } else {
          const held = rememberNote(value);
          if (held) {
            io.out(`quarantined ${held.id} (${held.reason})`);
            io.err('--trusted vouches for who wrote it, not for what it says: injection-looking text is held anyway.');
            return EXIT.OK;
          }
        }
        io.out('remembered');
        return EXIT.OK;
      } catch (e: any) {
        io.err(`remember failed: ${e?.message ?? String(e)}`);
        return EXIT.RUNTIME;
      }
    }

    case 'learn':
      return runLearn(args.learnArgv ?? [], io);

    case 'recall': {
      try {
        io.out(args.key ? recallKey(args.key) : recallNotes(process.env, { includeQuarantined: args.includeQuarantined }));
        return EXIT.OK;
      } catch (e: any) {
        io.err(`recall failed: ${e?.message ?? String(e)}`);
        return EXIT.RUNTIME;
      }
    }

    case 'redact': {
      try {
        io.out(redactKey(args.key as string));
        return EXIT.OK;
      } catch (e: any) {
        io.err(`redact failed: ${e?.message ?? String(e)}`);
        return EXIT.RUNTIME;
      }
    }

    case 'quarantine': {
      try {
        if (args.sub === 'list') {
          const rows = listQuarantined();
          if (args.json) io.out(JSON.stringify(rows, null, 2));
          else io.out(formatQuarantineList(rows));
          return EXIT.OK;
        }
        const id = Number(args.id);
        if (args.sub === 'explain') {
          const rec = explainQuarantine(id);
          if (!rec) {
            io.err(`NOT_CHECKED no note with id ${id}`);
            return EXIT.NOT_CHECKED;
          }
          io.out(args.json ? JSON.stringify(rec, null, 2) : formatQuarantineRecord(rec));
          return EXIT.OK;
        }
        // release
        let outcome: ReleaseOutcome;
        if (args.trusted) {
          outcome = releaseByOperator(id);
        } else if (args.check === 'hal') {
          outcome = await releaseByHal(id);
        } else {
          // Local file only. Opens no socket.
          const fs = require('node:fs') as typeof import('node:fs');
          let text: string;
          try {
            text = fs.readFileSync(args.source as string, 'utf8');
          } catch {
            io.err(`quarantine release: cannot read the source file: ${args.source}`);
            return EXIT.USAGE;
          }
          outcome = releaseByGround(id, text, {
            page: args.page === undefined ? null : Number(args.page),
            sourceLabel: `source ${args.source}`,
          });
        }
        const { ground: _g, claim: _c, ...plain } = outcome as ReleaseOutcome & { ground?: unknown; claim?: unknown };
        if (args.json) io.out(JSON.stringify(plain, null, 2));
        else if (outcome.released) io.out(`released ${outcome.id} by ${outcome.released_by}`);
        else io.out(`${outcome.status === 'HELD' ? 'held' : outcome.status} ${outcome.id}: ${outcome.reason}`);
        return releaseExitCode(outcome);
      } catch (e: any) {
        io.err(`quarantine failed: ${e?.message ?? String(e)}`);
        return EXIT.RUNTIME;
      }
    }

    case 'bind-status': {
      const text = await bindStatusText({ env: process.env, fetchImpl: fetch });
      io.out(text);
      return EXIT.OK;
    }

    case 'traps': {
      const rows = buildTrapsList(process.cwd());
      io.out(formatTrapsList(rows, args.json));
      return EXIT.OK;
    }

    case 'ground': {
      // Local file only. Opens no socket.
      const fs = require('node:fs') as typeof import('node:fs');
      let text: string;
      try {
        text = fs.readFileSync(args.source as string, 'utf8');
      } catch {
        io.err(`ground: cannot read the source file: ${args.source}`);
        return EXIT.USAGE;
      }
      const pages = splitPages(text);
      const [receipt] = groundClaims(
        [
          {
            quote: args.quote,
            page: args.page === undefined ? null : Number(args.page),
            value: args.value ?? null,
            kind: (args.kind ?? 'text') as 'text' | 'number' | 'date',
            unit: args.unit,
          },
        ],
        pages,
        { predictedBy: 'caller', echoes: args.echoes },
      );
      const r = receipt as NonNullable<typeof receipt>;
      if (args.json) io.out(JSON.stringify(r, null, 2));
      else io.out(formatGround(r.check, pages, r.limitations));
      return groundExitCode(r.check.status);
    }

    case 'verify':
    case 'evaluate': {
      // SEC F3: OFFLINE=1 sends nothing. This used to print NOT_CHECKED AFTER the claim had gone to HAL.
      if (process.env.OFFLINE === '1') {
        if (args.json) {
          io.out(JSON.stringify({
            receipt_written: 'NOT_CHECKED',
            family_host_verdict: 'NOT_CHECKED',
            firstPass: 'first-pass NOT_CHECKED',
            receipt_id: 'NOT_CHECKED',
            reason: OFFLINE_REASON,
          }, null, 2));
        } else {
          io.out(`NOT_CHECKED: ${OFFLINE_REASON}. This is not a pass.`);
        }
        return EXIT.NOT_CHECKED;
      }
      const claim = String(args.operand ?? '');
      const lane = await resolveLayaLane(claim, process.env, fetch);
      if (lane === 'ask') {
        io.out('ASK');
        return EXIT.ASK;
      }
      if (lane === 'cheap') {
        const verdictLine = 'laya cheap NOT_CHECKED';
        if (args.json) {
          io.out(JSON.stringify({
            receipt_written: false,
            family_host_verdict: verdictLine,
          }, null, 2));
        } else {
          io.out(verdictLine);
        }
        // Laya's cheap lane sends nothing to HAL, so nothing was checked: exit 2, never the PASS code.
        return EXIT.NOT_CHECKED;
      }
      const honestyPromise = loadHonestyBody({ env: process.env, fetchImpl: fetch });
      const passFrom = (body: unknown | null): string =>
        (body == null ? ['first-pass NOT_CHECKED'] : firstPassLines(body)).join('\n');
      try {
        const r = await runEnvelopedAction(
          { origin: 'Cli', actionClass: 'verify', policyId: 'hal' },
          () => client.verifyOutput(args.operand as string),
        );
        const body = await honestyPromise;
        const pass = passFrom(body);
        const posted = await postHalReceipt({
          env: process.env,
          fetchImpl: fetch,
          body,
          verdict: r.verdict,
        });
        const receipt = posted.status;
        if (args.json) {
          const payload: Record<string, unknown> = {
            receipt_written: receiptWrittenValue(receipt),
            family_host_verdict: familyHostVerdictLine(body, r.verdict),
            ...r,
            firstPass: pass,
          };
          payload.receipt_id = posted.receiptId;
          const counted = firstPassObject(body);
          if (counted) payload.first_pass = counted;
          const postHal = postHalValue(body);
          if (postHal) payload.post_hal = postHal;
          const honestyRows = honestyRowsValue(body);
          if (honestyRows !== undefined) payload.honesty_rows = honestyRows;
          io.out(JSON.stringify(payload, null, 2));
        } else {
          io.out(formatVerify(r, { receiptWritten: receiptWrittenValue(receipt) === true }));
          io.out(pass);
          if (trustshellApiUrlSet(process.env)) io.out(honestyRowsLine(body));
          io.out(`receipt-id ${posted.receiptId}`);
          const receiptLine = receiptHumanLine(receipt);
          if (receiptLine) io.out(receiptLine);
          io.out(familyHostVerdictLine(body, r.verdict));
        }
        return verdictExitCode(r.verdict);
      } catch (e: any) {
        io.err(`verify failed: ${e?.message ?? String(e)}`);
        const body = await honestyPromise;
        io.out(passFrom(body));
        if (trustshellApiUrlSet(process.env)) io.out(honestyRowsLine(body));
        return EXIT.RUNTIME;
      }
    }

    case 'repid': {
      try {
        const r = await client.getRepID(args.operand as string);
        if (args.json) io.out(JSON.stringify(r, null, 2));
        else io.out(formatRepid(r.agentId, r.repid, r.tier, r.identity));
        return EXIT.OK;
      } catch (e: any) {
        io.err(`repid failed: ${e?.message ?? String(e)}`);
        return EXIT.RUNTIME;
      }
    }

    case 'receipt': {
      // kernelReceipt never throws; every failure comes back as { ok: false }.
      const r = await kernelReceipt(args.operand as string, {
        apiKey: process.env.REPID_API_KEY?.trim() || undefined,
        apiUrl: process.env.TRUSTSHELL_API_URL?.trim() || undefined,
      });
      if (args.json) io.out(JSON.stringify(r, null, 2));
      else (r.ok ? io.out : io.err)(formatKernelReceipt(r));
      if (r.ok) return EXIT.OK;
      return r.reason === 'receipt_hash_mismatch' ? EXIT.VETO : EXIT.RUNTIME;
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
      if (!isUrlOperand(String(args.operand ?? ''))) {
        return runClaimCheck(String(args.operand ?? ''), args.json, io);
      }
      // SEC F3: OFFLINE=1 does not ask GitHub either. (The sentence form stops inside classifyClaim.)
      if (process.env.OFFLINE === '1') {
        if (args.json) io.out(JSON.stringify({ verdict: 'NOT_CHECKED', reason: OFFLINE_REASON }, null, 2));
        else io.out(`NOT_CHECKED: ${OFFLINE_REASON}. This is not a pass.`);
        return EXIT.NOT_CHECKED;
      }
      if (args.claims !== undefined || args.claimsFile !== undefined) return runClaimsAgainstRun(args, io);
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
      if (args.pai && args.dryRun) {
        io.out('NOT_MINTED');
        return EXIT.OK;
      }
      if (args.pai) {
        const fs = require('node:fs') as typeof import('node:fs');
        const { spawnSync } = require('node:child_process') as typeof import('node:child_process');
        const r = runInitPai(
          {
            exists: (p) => fs.existsSync(p),
            spawn: (cmd, argv) => spawnSync(cmd, argv, { stdio: 'inherit' }),
          },
          { cliDir: __dirname, name: args.name, answers: args.answers, force: args.force },
        );
        if (r.missing) {
          io.err(`init --pai: ${INIT_PAI_SCRIPT} is not in this install.`);
          io.err(`equivalent path: ${INIT_PAI_DOC}`);
          return r.code;
        }
        return r.code;
      }
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

    case 'profile':
      // Local file only. Opens no socket.
      return runProfile(args.profileOp ?? { op: 'show' }, { ...io, ask: terminalAsk() }, nodeProfileFs(), args.json);

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

/** A claims file larger than this is refused: no agent message or PR description is a megabyte. */
export const MAX_CLAIMS_FILE_BYTES = 256 * 1024;

/**
 * `--claims-file <path>`: the only way claim text comes from a file.
 *
 * WHY TWO FLAGS. This was `--claims <file|text>`: an existing file was read, anything else was text.
 * Automation passing untrusted text through it (`--claims "$PR_BODY"`) then let the author name a
 * path instead (`../../.env`, `~/.npmrc`), and the file's sentences landed on a card meant to be
 * posted (XC1 S2). A file is now read only when the caller says so; `--claims` is always text.
 */
export function readClaimsFile(
  path: string,
  fs: Pick<typeof import('node:fs'), 'statSync' | 'readFileSync'> = require('node:fs'),
): string {
  let st: import('node:fs').Stats | undefined;
  try {
    st = fs.statSync(path);
  } catch {
    st = undefined;
  }
  if (!st?.isFile()) throw new Error(`--claims-file: no such file: ${path}`);
  if (st.size > MAX_CLAIMS_FILE_BYTES) throw new Error(`--claims-file is ${st.size} bytes; the limit is ${MAX_CLAIMS_FILE_BYTES}`);
  return String(fs.readFileSync(path, 'utf8'));
}

/**
 * `trustshell check <runUrl> --claims "<text>"` (or `--claims-file <path>`). GitHub only, exactly like the URL form: the
 * record is built from `runCheck`, whose one host is api.github.com. Writes files only when
 * `--out` names a directory.
 */
async function runClaimsAgainstRun(args: ParsedArgs, io: CliIO): Promise<number> {
  let claimText: string;
  try {
    claimText = args.claimsFile !== undefined ? readClaimsFile(args.claimsFile) : (args.claims as string);
  } catch (e: any) {
    io.err(`check failed: ${e?.message ?? String(e)}`);
    return EXIT.USAGE;
  }
  if (!claimText.trim()) {
    io.err('check failed: the claim text is empty');
    return EXIT.USAGE;
  }
  try {
    const { record, digest } = await inspectRunClaims(args.operand as string, claimText);
    const card = renderCardMarkdown(record, { demo: args.demo });
    if (args.out) {
      const fs = require('node:fs') as typeof import('node:fs');
      fs.mkdirSync(args.out, { recursive: true });
      fs.writeFileSync(join(args.out, 'record.json'), JSON.stringify({ record, digest }, null, 2) + '\n');
      fs.writeFileSync(join(args.out, 'card.md'), card);
      fs.writeFileSync(join(args.out, 'card.html'), renderCardHtml(record, { demo: args.demo }));
      io.err(`wrote record.json, card.md and card.html to ${args.out}`);
    }
    io.out(args.json ? JSON.stringify({ record, digest }, null, 2) : card);
    return claimsExitCode(record);
  } catch (e: any) {
    if (e instanceof CheckError) {
      io.err(`check failed: ${e.message}`);
      return e.usage ? EXIT.USAGE : EXIT.RUNTIME;
    }
    io.err(`check failed: ${e?.message ?? String(e)}`);
    return EXIT.RUNTIME;
  }
}

/**
 * `trustshell check "<sentence>"` — the sentence form. Calls {@link classifyClaim}, the
 * SAME function the MCP `check_claim` tool calls, so the two cannot drift.
 * Exit codes: pass 0, veto 1, not-checked 2, error 3 (nothing was sent).
 */
export async function runClaimCheck(
  sentence: string,
  json: boolean,
  io: CliIO,
): Promise<number> {
  try {
    const r = await classifyClaim(sentence);
    if (json) {
      io.out(JSON.stringify(r, null, 2));
    } else {
      io.out(r.label);
      io.out(explainClaim(r));
      const path = pathLine(r);
      if (path) io.out(path);
      if (r.question) io.out(`One question: ${r.question} Answer it by checking the sentence again with your answer added.`);
      if (r.scrubbed) io.out(SCRUBBED_LINE);
    }
    return claimExitCode(r.label);
  } catch (e: any) {
    const msg = e instanceof ClaimError ? e.message : `unexpected: ${e?.message ?? String(e)}`;
    if (json) io.out(JSON.stringify({ label: 'error', error: msg }, null, 2));
    else {
      io.out('error');
      io.out(`Could not check: ${msg}. Nothing was labelled.`);
    }
    return CLAIM_EXIT.error;
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
    const detail = e instanceof Error ? (e.stack ?? e.message) : String(e);
    process.stderr.write(scrubPrinted(`trustshell: fatal: ${detail}\n`));
    process.exit(EXIT.RUNTIME);
  });
}
