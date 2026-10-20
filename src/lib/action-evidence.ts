/**
 * `trustshell check <run-url> --claims <file|text>` — map what an agent SAID onto what GitHub REPORTS.
 * ------------------------------------------------------------------
 * GitHub already shows a green check. What it does not show is whether the sentence an agent
 * wrote ("all tests pass, fixed in abc1234, production ready") is the sentence the run supports.
 * This file builds one minimal record that keeps those apart:
 *
 *   observation     what `check` read from api.github.com, field by field (PLATFORM_REPORTED)
 *   claims[]        each claim, the deterministic template that read it, and one of three
 *                   statuses: SUPPORTED, CONTRADICTED, NOT_CHECKED
 *   assurance       what kind of evidence this is, and what it is not
 *   does_not_prove  the sentences a reader must not lose
 *
 * NO LLM, NO NETWORK BEYOND `check`. Claim mapping is regular expressions over the claim text and
 * equality over observation fields. The only egress is `runCheck`'s, which is api.github.com.
 *
 * THE RULES THIS FILE EXISTS TO KEEP, each enforced below and pinned in tests/action-evidence.test.ts:
 *  - Never claim more than the evidence proves. Each claim is atomic, with its own verdict.
 *  - Deny by default. Only plain claim lines (printable ASCII, starting with a letter, no Markdown or
 *    HTML, one sentence) are read; nothing is rendered or normalised before a decision. Any line that
 *    is not plain, or not read end to end, blocks every verdict in the text. See plainLineProblem.
 *  - A claim no template can check is NOT_CHECKED with the reason written next to it. Never SUPPORTED.
 *  - A claim that conflicts with a field is CONTRADICTED, and the reason names both values.
 *  - A successful run supports "this workflow run succeeded" and nothing wider: not "all tests
 *    pass", not "all checks pass", not "the fix works". Those stay NOT_CHECKED.
 *  - An outcome is compared only when its own line ties it to the inspected run by citing its commit or
 *    run id, and cites nothing that does not match.
 *  - A run that has not finished, or whose jobs were not all read, decides no outcome.
 *  - SUPPORTED is narrow. Its `scope` says exactly what matched and what that match does not cover.
 *  - The observation is GitHub reporting on its own run. It is labelled PLATFORM_REPORTED and is
 *    never presented as an independent grade.
 *  - No attestation is read, so cryptographic_integrity is NOT_CHECKED. The type allows nothing else,
 *    so it cannot be set to anything stronger without code that actually verifies one.
 *  - Text from outside (the claims, and names GitHub returns for someone else's repo) is never
 *    spliced into generated sentences. Those sentences interpolate only digits and hex.
 */

import { jcsSha256 } from './jcs';
import { CheckError, DOES_NOT_PROVE as CHECK_DOES_NOT_PROVE, parseRun, plural, runCheck, type CheckJob, type CheckResult, type CheckVerdict } from './check';
import { fetchCommitChecks, type CommitChecks } from './commit-checks';

export const ACTION_EVIDENCE_SCHEMA = 'dev.trustshell.action-evidence/0.1-draft' as const;

/**
 * Claim text larger than this is refused, in UTF-8 bytes: no agent message or PR description is a
 * megabyte. One constant for `--claims-file` and the MCP `inspect_run`, so the two cannot drift.
 */
export const MAX_CLAIMS_FILE_BYTES = 256 * 1024;

export type ClaimStatus = 'SUPPORTED' | 'CONTRADICTED' | 'NOT_CHECKED';

export type TemplateId =
  | 'gha.run_succeeded'
  | 'ci.all_checks_pass'
  | 'ci.tests_pass'
  | 'ci.build_unscoped'
  | 'git.head_sha'
  | 'gha.run_id'
  | 'gha.run_attempt'
  | 'excluded.completion'
  | 'excluded.security'
  | 'excluded.no_bugs'
  | 'excluded.readiness'
  | 'excluded.fix'
  | 'excluded.local_run'
  | 'excluded.test_count'
  | 'excluded.coverage'
  | 'excluded.deployment'
  | 'excluded.performance'
  | 'excluded.review'
  | 'unmapped'
  | 'excluded.markup'
  | 'truncated';

export interface Observation {
  platform: 'github-actions';
  host: 'api.github.com';
  /** Canonical run URL, rebuilt from the parsed parts rather than echoed from input. */
  url: string;
  owner: string;
  repo: string;
  run_id: number;
  run_attempt: number | null;
  workflow: { name: string; path: string };
  head_sha: string;
  status: string;
  conclusion: string | null;
  /** `check`'s own verdict and result rows, unchanged. */
  check: { verdict: CheckVerdict; results: CheckResult['checks'] };
  jobs: { http_status: number; total: number; items: CheckJob[] };
  fetchedAt: string;
  freshness: 'LIVE';
  /**
   * Guided mode only (`--guided`, EXPERIMENTAL): every check GitHub reported for `head_sha`. Its
   * presence is what makes a record guided: claims are then mapped with binding and these checks.
   */
  commit_checks?: CommitChecks;
}

export interface ClaimEntry {
  /** One atomic claim: the exact span a template matched, normalised (see {@link normalizeClaimText}). */
  claim: string;
  /** The sentence the claim came from, normalised. Equal to `claim` for an unmapped sentence. */
  sentence: string;
  template: TemplateId;
  status: ClaimStatus;
  /** JSON Pointers (RFC 6901) into this record: the observation fields the status rests on. */
  evidence_fields: string[];
  /** What the status covers — and, for SUPPORTED, what it does not. */
  scope: string;
  /** The concrete comparison, or why nothing was compared. */
  reason: string;
}

export interface ActionEvidenceRecord {
  schema: typeof ACTION_EVIDENCE_SCHEMA;
  observation: Observation;
  claims: ClaimEntry[];
  assurance: {
    /** No attestation is read in this version, so this is the only value the type permits. */
    cryptographic_integrity: 'NOT_CHECKED';
    /** A GitHub API answer is the platform describing its own run, not an independent grader. */
    observation: 'PLATFORM_REPORTED';
  };
  does_not_prove: string[];
}

export interface RecordDigest {
  algorithm: 'sha-256';
  canonicalization: 'RFC 8785';
  value: string;
}

/** SHA-256 over the RFC 8785 canonical form of the record. Detects later edits; says nothing about authorship. */
export function digestRecord(record: ActionEvidenceRecord): RecordDigest {
  return { algorithm: 'sha-256', canonicalization: 'RFC 8785', value: jcsSha256(record) };
}

export const RECORD_DOES_NOT_PROVE: string[] = [
  ...CHECK_DOES_NOT_PROVE,
  'SUPPORTED means the platform record matches the narrow scope written next to the claim. It is not a finding that the claim is true in any broader sense.',
  'A successful workflow run shows that run succeeded. It does not show which tests ran, that all tests or all checks passed, or that a change works.',
  'Only this one workflow run was read. Other workflows, check suites and status checks on the same commit were not.',
  'Every observed fact is GitHub reporting on its own run (PLATFORM_REPORTED). Nothing was re-run or independently observed.',
  'Broader security: not checked. A CI conclusion is not a security review.',
  'The record is not signed. Its SHA-256 shows whether the record changed after it was made, not who made it.',
];

/**
 * Guided mode (`--guided`, EXPERIMENTAL) reads every check on the commit, so the "only this one run"
 * line no longer holds; what guided mode adds to the list instead.
 */
export const GUIDED_DOES_NOT_PROVE: string[] = [
  ...RECORD_DOES_NOT_PROVE.filter((line) => !line.startsWith('Only this one workflow run was read.')),
  'Guided mode (experimental): a line that cites nothing was read as being about the inspected run, because whoever ran this named that run. That is an interpretation of the text, not something GitHub reports.',
  'Every check on the commit was read as GitHub reported it at the time of reading. A re-run, or a check that reports later, can change the answer.',
  'Checks that do not report to GitHub (a local run, another CI service) are not seen. "All checks pass" means every check GitHub knows about, not every test that exists.',
];

// ── normalisation and splitting ─────────────────────────────────────────────────────────────────

/** A clause longer than this is stored cut, with an ellipsis. Templates still read all of it. */
export const MAX_CLAIM_TEXT = 300;
/** Sentences after this many are not read one by one; a single NOT_CHECKED entry says how many. */
export const MAX_CLAIMS = 200;

/**
 * Code points that display as nothing, or reorder what is displayed: soft hyphen, combining
 * grapheme joiner, the bidi marks, overrides and isolates, zero-width characters, Hangul fillers,
 * variation selectors, the byte-order mark, musical-symbol format controls and the Unicode tag
 * block. Listed as numbers, not regex escapes, so no invisible character has to appear in this
 * file. XC1 (2026-10-19) hid "Not" from the qualifier check with U+200B, U+00AD and U+E0020.
 */
const INVISIBLE_RANGES: [number, number][] = [
  [0x00ad, 0x00ad], [0x034f, 0x034f], [0x061c, 0x061c], [0x115f, 0x1160], [0x17b4, 0x17b5],
  [0x180b, 0x180f], [0x200b, 0x200f], [0x202a, 0x202e], [0x2060, 0x206f], [0x3164, 0x3164],
  [0xfe00, 0xfe0f], [0xfeff, 0xfeff], [0xffa0, 0xffa0], [0x1bca0, 0x1bca3], [0x1d173, 0x1d17a],
  [0xe0000, 0xe0fff],
];

function isInvisible(cp: number): boolean {
  for (const [a, b] of INVISIBLE_RANGES) if (cp >= a && cp <= b) return true;
  return false;
}

const REPLACEMENT = String.fromCharCode(0xfffd);

/**
 * One pass over the code points: an unpaired surrogate becomes U+FFFD (it has no UTF-8 form, and
 * RFC 8785 refuses it), an invisible or reordering character is removed, and a C0/C1 control (a
 * terminal escape starts with one) becomes a space. Newlines survive only when asked for.
 */
export function cleanCodePoints(s: string, keepNewlines = false): string {
  let out = '';
  for (const ch of String(s ?? '')) {
    const cp = ch.codePointAt(0) as number;
    if (cp >= 0xd800 && cp <= 0xdfff) out += REPLACEMENT;
    else if (isInvisible(cp)) continue;
    else if (cp === 0x0a && keepNewlines) out += ch;
    else if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)) out += ' ';
    else out += ch;
  }
  return out;
}

/**
 * Replace unpaired surrogates with U+FFFD and change nothing else. Applied to every string GitHub
 * returns before it enters the record: one unpaired surrogate in a workflow name otherwise made the
 * RFC 8785 digest throw, so any repository could make every --claims check of its runs fail (XC1 L1).
 */
export function wellFormed(s: string): string {
  let out = '';
  for (const ch of String(s ?? '')) {
    const cp = ch.codePointAt(0) as number;
    out += cp >= 0xd800 && cp <= 0xdfff ? REPLACEMENT : ch;
  }
  return out;
}

/**
 * JSON for a terminal, or for a file a terminal may print. JSON.stringify escapes only
 * U+0000-U+001F, so a C1 control (U+009B is CSI), a bidi override or an invisible character from a
 * workflow name reached stdout raw (XC1 N10). Those are written as \uXXXX escapes instead. The
 * parsed value is identical, so the record's digest does not change.
 */
export function terminalSafeJson(value: unknown, space = 2): string {
  let out = '';
  for (const ch of JSON.stringify(value, null, space)) {
    const cp = ch.codePointAt(0) as number;
    if ((cp >= 0x7f && cp <= 0x9f) || cp === 0x2028 || cp === 0x2029 || isInvisible(cp)) {
      for (let k = 0; k < ch.length; k += 1) out += '\\u' + ch.charCodeAt(k).toString(16).padStart(4, '0');
    } else out += ch;
  }
  return out;
}

/**
 * The one form of the text that every template reads and every card displays: invisible characters
 * removed, NFKC applied (fullwidth digits become digits, compatibility forms their plain letters),
 * controls made spaces. Templates and display read the SAME string, so a reader can never see a
 * word the checks did not.
 */
function canonicalText(s: string, keepNewlines: boolean): string {
  return cleanCodePoints(cleanCodePoints(s, keepNewlines).normalize('NFKC'), keepNewlines);
}

/** Normalise one claim for storage: {@link canonicalText}, whitespace collapsed, cut at MAX_CLAIM_TEXT. */
export function normalizeClaimText(s: string): string {
  const cleaned = canonicalText(String(s ?? ''), false).replace(/\s+/g, ' ').trim();
  return cleaned.length > MAX_CLAIM_TEXT ? cleaned.slice(0, MAX_CLAIM_TEXT - 1) + '…' : cleaned;
}

/** A line longer than this is not certifiable: one claim fits in one sentence. */
export const MAX_LINE = 200;

/**
 * Characters a certifiable line may not hold. Markdown and HTML syntax (`< > \` [ ] ( ) | * _ # ~`),
 * the escape, math and entity marks (`\ $ &`), braces, and "?" (a question is not a claim).
 */
const MARKUP = new Set([...'<>`[]()|*_#~\\$&{}?']);

/**
 * Why a line cannot be certified, or null if it is a plain claim line. PURE, linear.
 *
 * DENY BY DEFAULT. Four review rounds (XC1, 2026-10-19) kept finding Markdown that a hand-written
 * reader got wrong: comments, code, link definitions, soft line breaks, normalisation order. The
 * bypass count did not converge, because re-implementing what a reader of rendered Markdown sees
 * has no end of edge cases. So nothing is rendered or normalised here. A line is certifiable only if
 * it is ALREADY plain text:
 *
 *   - printable ASCII only (no control, no tab, nothing that would need normalising);
 *   - it starts with a letter (no list marker, heading, quote, number or indentation);
 *   - no Markdown or HTML character at all (see MARKUP);
 *   - one sentence (no ". ", "! " or "; " followed by more text);
 *   - at most MAX_LINE characters;
 *   - its own paragraph: GitHub joins consecutive lines into one, so adjacent non-blank lines block
 *     the text (mapClaims), and only a line of spaces or tabs counts as blank (readClaims).
 *
 * Anything else is listed, as written, and is NOT_CHECKED. A PR description in Markdown is therefore
 * not certified; write the claims as plain lines to have them checked.
 */
export function plainLineProblem(line: string): string | null {
  if (line.length > MAX_LINE) return `it is longer than ${MAX_LINE} characters`;
  for (const ch of line) {
    const cp = ch.codePointAt(0) as number;
    if (cp < 0x20 || cp > 0x7e) return 'it holds a non-ASCII or control character';
    if (ch === '?') return 'it holds a question mark';
    if (MARKUP.has(ch)) return 'it holds Markdown or HTML syntax';
  }
  if (!/^[A-Za-z]/.test(line)) return 'it does not start with a letter';
  if (/[.!;]\s+\S/.test(line)) return 'it holds more than one sentence';
  return null;
}

/** One non-blank input line: its 1-based number, the text shown, and why it is not certifiable, if it is not. */
interface ReadLine {
  lineNo: number;
  text: string;
  problem: string | null;
}

/**
 * Split input into its non-blank lines (line endings \n, \r\n or \r) and judge each against the
 * plain-line grammar. PURE, linear. A plain line is kept exactly as written; any other line is shown
 * with control and invisible characters removed, which is display only and decides nothing.
 */
export function readClaims(text: string): { lines: ReadLine[]; dropped: number } {
  const all: ReadLine[] = [];
  String(text ?? '')
    .split(/\r\n|\r|\n/)
    .forEach((raw, i) => {
      // Blank as CommonMark defines it: spaces and tabs only. A line of NBSP is not blank, so GitHub
      // would join its neighbours into one paragraph; here it is a non-plain line and blocks (XC1 Y1).
      if (/^[ 	]*$/.test(raw)) return;
      const problem = plainLineProblem(raw);
      all.push({ lineNo: i + 1, text: problem ? normalizeClaimText(raw) || '(invisible characters only)' : raw, problem });
    });
  const kept = all.slice(0, MAX_CLAIMS);
  return { lines: kept, dropped: Math.max(0, all.length - MAX_CLAIMS) };
}

// ── templates ───────────────────────────────────────────────────────────────────────────────────
//
// LINEAR TIME ON UNTRUSTED TEXT. Every pattern here runs over claim text a stranger wrote. CodeQL
// flagged js/polynomial-redos on the HTML-comment pattern this file used to have, and three more of
// one shape were then measured here: `\s*`, an optional token, then `\s*` again lets the engine try
// every split of a run of spaces between the two, so "commit" followed by 80,000 spaces took 130 s.
// No pattern below puts two unbounded quantifiers over the same characters side by side, and
// tests/action-evidence.test.ts times every template against that kind of input.
//
// ATOMIC CLAIMS. A sentence such as "All tests pass and CI is green on 5cd68edc (run 1, attempt 2)"
// is five claims, and each gets its own verdict. `claim` is the exact span a template matched;
// `sentence` is where it came from.
//
// WHAT A GREEN RUN CAN SUPPORT. One successful workflow run supports exactly one outcome claim:
// "this workflow run succeeded". It does not establish that all tests pass (the run record does
// not say which tests ran), that all checks pass (other workflows were not read), or that a change
// works. Those stay NOT_CHECKED. A FAILED run can still CONTRADICT "all checks pass": one failing
// check is a counterexample. And no outcome is compared at all unless the text ties it to this run
// by citing its commit or run id, with nothing cited that does not match.

/** Explicitly about a workflow run: "the workflow passed", "the check workflow run succeeded", "run 123456 passed". */
const RUN_SUCCEEDED: RegExp[] = [
  // "The `check` workflow passed": an optional determiner and workflow NAME, each bounded. The name
  // is captured (group 1) because "the deploy workflow passed" is not evidenced by the check
  // workflow; see namesThisWorkflow.
  // A determiner is never taken as the name ("that the workflow" is not a workflow named "the").
  /\b(?:(?:the|this|that|our|its)\s+)?(?:(?!(?:the|this|that|our|its|a|an)\s)(`[^`\n]{1,64}`|[\w.-]{1,40})\s+)?(?:workflow|pipeline)(?:\s+run)?(?:\s+#?\d{6,})?\s+(?:has\s+|have\s+)?(?:now\s+)?(?:pass(?:es|ed)?|succeed(?:s|ed)?|is\s+green|was\s+green|went\s+green|completed\s+successfully)\b/gi,
  // "The run passed", "run 123456 succeeded": a determiner or a run id directly beside "run", so "the
  // dry run passed" and "the e2e test-run passed" are not this workflow run (XC1 D). Not "the job
  // passed" either: a job is one part of a run, not the run.
  /\b(?:(?:the|this|that|our|its)\s+run|run\s+#?\d{6,})\s+(?:has\s+|have\s+)?(?:now\s+)?(?:pass(?:es|ed)?|succeed(?:s|ed)?|is\s+green|was\s+green|went\s+green|completed\s+successfully)\b/gi,
];

/** Whether a workflow name a claim uses is the inspected run's, by display name or file stem. */
function namesThisWorkflow(name: string, o: Observation): boolean {
  const n = name.replace(/`/g, '').trim().toLowerCase();
  const display = o.workflow.name.trim().toLowerCase();
  const file = (o.workflow.path.split('/').pop() ?? '').toLowerCase();
  const stem = file.endsWith('.yml') ? file.slice(0, -4) : file.endsWith('.yaml') ? file.slice(0, -5) : file;
  return n !== '' && (n === display || (stem !== '' && n === stem));
}

/** About every check on the change: "all checks pass", "CI is green", "everything is green". */
const ALL_CHECKS: RegExp[] = [
  /\ball\s+(?:of\s+the\s+|the\s+)?(?:status\s+|CI\s+)?checks?\s+(?:are\s+|have\s+)?(?:now\s+)?(?:pass(?:es|ed|ing)?|green|succeed(?:s|ed)?)\b/gi,
  /\bevery\s+check\s+(?:has\s+)?(?:pass(?:es|ed)|succeed(?:s|ed)|is\s+green)\b/gi,
  /\bchecks\s+(?:are\s+|have\s+)?(?:all\s+)?(?:now\s+)?(?:pass(?:es|ed|ing)?|green)\b/gi,
  /\bCI\s+(?:is\s+|was\s+|has\s+)?(?:all\s+|now\s+|fully\s+)?(?:green|pass(?:es|ed|ing)?|succeed(?:s|ed)?)\b/gi,
  /\b(?:all|everything)\s+(?:is\s+)?green\b/gi,
  /\bgreen\s+CI\b/gi,
  /\bpass(?:es|ed|ing)?\s+(?:all\s+)?(?:the\s+)?(?:checks|CI)\b/gi,
];

/** About tests: "all tests pass", "the unit tests are green", "passes all tests". */
const TESTS_PASS: RegExp[] = [
  /\b(?:all\s+(?:of\s+)?)?(?:the\s+)?(?:unit\s+|integration\s+|e2e\s+|end-to-end\s+|regression\s+)?(?:tests?|specs?|test\s+suites?)\s+(?:are\s+|is\s+|have\s+)?(?:all\s+)?(?:now\s+|still\s+)?(?:pass(?:es|ed|ing)?|green|succeed(?:s|ed)?)\b/gi,
  /\bpass(?:es|ed|ing)?\s+(?:all\s+)?(?:the\s+)?(?:unit\s+|integration\s+|e2e\s+)?(?:tests|specs|test\s+suites?)\b/gi,
];

/** "The build passes": names no workflow and no check, so it is compared with nothing. */
const BUILD_PASS: RegExp[] = [
  /\b(?:the\s+)?build\s+(?:is\s+|was\s+|has\s+)?(?:now\s+|still\s+)?(?:pass(?:es|ed|ing)?|green|succeed(?:s|ed)?)\b/gi,
  /\bgreen\s+build\b/gi,
];

/**
 * Words that change what a pass claim means: a negation ("tests don't pass"), a failure word, or a
 * partial quantifier ("most tests pass" is not refuted by a red run). A sentence holding one has
 * its pass and success claims NOT_CHECKED: conservative on purpose, since the alternative is
 * reading a claim backwards.
 */
const PASS_QUALIFIER =
  /\b(?:not|no|never|cannot|without|fail\w*|broken|flak\w*|except|but|although|though|unless|some|most|several|few|half|partially|mostly)\b|n't\b/i;

const LOCAL_RUN = /\b(?:locally|on\s+my\s+(?:machine|laptop|box|computer)|in\s+my\s+(?:env|environment|setup))\b/i;

/**
 * A GitHub URL starts at a boundary: `github.com` inside `agithub.com` or `evil.github.com`, or after
 * a path, is another host (XC1 W2). `www.` is still allowed, as GitHub autolinks it.
 */
const GH_HOST = String.raw`(?<![\w.\/@-])(?:https?:\/\/)?(?:www\.)?github\.com\/`;

/** Commit citations. `needLetter` is for the weak contexts, so a run id or a count is not read as a SHA. */
const SHA_PATTERNS: { re: RegExp; needLetter: boolean }[] = [
  { re: /\b(?:commit|sha|rev(?:ision)?)\s*(?:[:#]\s*)?[`'"(\[]?([0-9a-f]{7,40})(?![0-9a-z])/gi, needLetter: false },
  { re: new RegExp(GH_HOST + String.raw`[\w.-]+\/[\w.-]+\/commit\/([0-9a-f]{7,40})(?![0-9a-z])`, 'gi'), needLetter: false },
  { re: /\b(?:in|on|at|of)\s+[`'"(\[]?([0-9a-f]{7,40})(?![0-9a-z])/gi, needLetter: true },
  { re: /`([0-9a-f]{7,40})`/gi, needLetter: true },
];

const RUN_URL = new RegExp(GH_HOST + String.raw`([\w.-]+)\/([\w.-]+)\/actions\/runs\/(\d+)(\/attempts\/(\d+))?`, 'gi');
const RUN_ID = /\brun\s*(?:id\s*)?(?:(?:#|no\.?)\s*)?(\d{6,})\b/gi;
const ATTEMPT = /\battempt\s*(?:#\s*)?(\d{1,3})\b/gi;

interface Exclusion {
  id: TemplateId;
  pattern: RegExp;
  reason: string;
}

/** Claims this tool will name and refuse to grade. Each yields its own NOT_CHECKED entry. */
const EXCLUSIONS: Exclusion[] = [
  {
    id: 'excluded.completion',
    pattern: /\b(?:done|finished|all\s+set|implemented|completed?\s+(?:the|this|it|all|everything))\b/i,
    reason: '"Done" is not a fact a workflow run records. Only the narrower claims mapped from the same text are compared.',
  },
  {
    id: 'excluded.security',
    pattern: /\b(?:(?:fully|completely|totally|very|now)\s+)?(?:secure(?:d|ly)?|security|vulnerab\w*|exploit\w*|CVE-\d+|hardened|pen-?test\w*)\b/i,
    reason: 'A CI run conclusion is not a security review, and no security result is mapped.',
  },
  {
    id: 'excluded.no_bugs',
    pattern: /\b(?:all|every|any)\s+(?:of\s+the\s+|the\s+|known\s+|remaining\s+|other\s+)?bugs?\b|\bbug[- ]?free\b|\bno\s+(?:more\s+|known\s+|remaining\s+)?bugs?\b/i,
    reason: 'No run result can show that bugs are absent.',
  },
  {
    id: 'excluded.readiness',
    pattern: /\bprod(?:uction)?[- ]ready\b|\bready\s+(?:for|to)\s+(?:production|prod|ship|merge|deploy|release|go)\b|\bsafe\s+to\s+(?:merge|ship|deploy|release)\b/i,
    reason: 'Readiness is a judgement, not something a workflow run reports.',
  },
  {
    id: 'excluded.fix',
    pattern: /\b(?:fix(?:es|ed)?|resolv(?:es|ed)|solv(?:es|ed))\b/i,
    reason: 'A run shows what its jobs concluded, not whether a change fixes what it set out to fix.',
  },
  {
    id: 'excluded.local_run',
    pattern: LOCAL_RUN,
    reason: 'A local or private run cannot be observed through this workflow run.',
  },
  {
    id: 'excluded.test_count',
    // Bounded: `\d[\d,]*` re-scanned a run like "1,1,1,…" from every digit, ~2 minutes at the
    // 256 KiB file limit (XC1 S3).
    pattern: /\b\d{1,9}(?:,\d{3}){0,4}\s+(?:\w+\s+)?(?:tests?|specs?|cases?|suites?)\b/i,
    reason: 'The Actions API reports jobs, not individual tests or how many there are.',
  },
  {
    id: 'excluded.coverage',
    pattern: /\bcoverage(?:\s+(?:is|was|of|at))?(?:\s+\d+(?:\.\d+)?\s?%)?|\b\d+(?:\.\d+)?\s?%(?:\s+coverage)?/i,
    reason: 'Coverage figures are not read.',
  },
  {
    id: 'excluded.deployment',
    pattern: /\b(?:deployed|in\s+production|live\s+(?:in|on)\s+prod\w*|released|published|shipped)\b/i,
    reason: 'Deployment state is not part of a workflow run record.',
  },
  {
    id: 'excluded.performance',
    pattern: /\b(?:faster|slower|performance|perf|latency|throughput|optimi[sz]ed|speed(?:s|ed)?\s+up)\b/i,
    reason: 'Performance is not measured here.',
  },
  {
    id: 'excluded.review',
    pattern: /\b(?:reviewed|approved|LGTM|signed[- ]off)\b/i,
    reason: 'Reviews and approvals are not read.',
  },
];

const HEX40 = /^[0-9a-f]{40}$/;
/** The shortest cited SHA that can SUPPORT a commit match: 12 hex characters, 48 bits (XC1 Z2). */
export const MIN_SUPPORTING_SHA = 12;
const FAILED_CONCLUSIONS = new Set(['failure', 'timed_out', 'startup_failure']);

/** First 12 hex characters of a SHA GitHub returned, or a placeholder. Never splices a non-hex string. */
function shortSha(sha: string): string {
  return HEX40.test(sha) ? sha.slice(0, 12) : '(unrecognised sha)';
}

/** A GitHub enum value such as `success` or `in_progress`, or a placeholder — never free text. */
function word(s: string | null): string {
  return s && /^[a-z_]{1,32}$/.test(s) ? s : 'unrecognised';
}

function runRef(o: Observation): string {
  return `run ${o.run_id} (attempt ${o.run_attempt ?? 'unknown'}, commit ${shortSha(o.head_sha)})`;
}

/** One template match: the verbatim span, where it starts in the sentence, and what it reads. */
interface Hit {
  template: TemplateId;
  span: string;
  at: number;
  /** For citations: the value the claim names. */
  sha?: string;
  runId?: number;
  attempt?: number;
  sameRepo?: boolean | null;
  /** For gha.run_succeeded: the workflow name the claim uses, if it uses one. */
  name?: string;
  /**
   * A citation already made in this sentence ("[run 123](…/runs/123)"). It gets no second entry,
   * but its text still counts as read, or the sentence would be gated for repeating itself.
   */
  dup?: true;
}

/** All matches of every pattern, as hits. Overlapping hits of one template keep the earliest, then longest. */
function hitsFor(template: TemplateId, patterns: RegExp[], text: string): Hit[] {
  const all: Hit[] = [];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) all.push({ template, span: m[0], at: m.index ?? 0, ...(m[1] !== undefined ? { name: m[1] } : {}) });
  }
  all.sort((a, b) => a.at - b.at || b.span.length - a.span.length);
  const kept: Hit[] = [];
  for (const h of all) {
    const last = kept[kept.length - 1];
    if (last && h.at < last.at + last.span.length) continue;
    kept.push(h);
  }
  return kept;
}

/** Commit, run and attempt citations in one sentence. URLs are blanked (same length) before the prose patterns run. */
function citationHits(text: string, o: Observation): Hit[] {
  const hits: Hit[] = [];
  const seenSha = new Set<string>();
  for (const { re, needLetter } of SHA_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const sha = String(m[1]).toLowerCase();
      if (needLetter && !/[a-f]/.test(sha)) continue;
      hits.push({ template: 'git.head_sha', span: m[0], at: m.index ?? 0, sha, ...(seenSha.has(sha) ? { dup: true as const } : {}) });
      seenSha.add(sha);
    }
  }
  // A duplicate is the same run id cited for the same repository. A same id in ANOTHER repository
  // is not a duplicate: it is a different (bogus) citation and must keep its own verdict (XC1 X9).
  const seenRun = new Set<string>();
  const seenAttempt = new Set<number>();
  for (const m of text.matchAll(RUN_URL)) {
    const runId = Number(m[3]);
    const sameRepo = String(m[1]).toLowerCase() === o.owner.toLowerCase() && String(m[2]).toLowerCase() === o.repo.toLowerCase();
    const at = m.index ?? 0;
    const key = `${runId}:${sameRepo}`;
    hits.push({ template: 'gha.run_id', span: m[0].slice(0, m[0].length - (m[4] ?? '').length), at, runId, sameRepo, ...(seenRun.has(key) ? { dup: true as const } : {}) });
    seenRun.add(key);
    if (m[5]) {
      hits.push({ template: 'gha.run_attempt', span: String(m[4]), at: at + m[0].length - String(m[4]).length, attempt: Number(m[5]), ...(seenAttempt.has(Number(m[5])) ? { dup: true as const } : {}) });
      seenAttempt.add(Number(m[5]));
    }
  }
  const prose = text.replace(/https?:\/\/\S+/g, (u) => ' '.repeat(u.length));
  for (const m of prose.matchAll(RUN_ID)) {
    const runId = Number(m[1]);
    // Prose names no repository: it repeats a link to this repository's run, or earlier prose.
    const dup = seenRun.has(`${runId}:true`) || seenRun.has(`${runId}:null`);
    hits.push({ template: 'gha.run_id', span: m[0], at: m.index ?? 0, runId, sameRepo: null, ...(dup ? { dup: true as const } : {}) });
    seenRun.add(`${runId}:null`);
  }
  for (const m of prose.matchAll(ATTEMPT)) {
    const attempt = Number(m[1]);
    hits.push({ template: 'gha.run_attempt', span: m[0], at: m.index ?? 0, attempt, ...(seenAttempt.has(attempt) ? { dup: true as const } : {}) });
    seenAttempt.add(attempt);
  }
  return hits;
}

/** A citation's verdict. Only a SUPPORTED citation ties a sentence to this run. */
function citationEntry(h: Hit, sentence: string, o: Observation): ClaimEntry {
  const base = { claim: normalizeClaimText(h.span), sentence, template: h.template };
  if (h.template === 'git.head_sha') {
    const t = h.sha as string;
    const scope = `Commit identity only: whether the commit this claim cites is the one the inspected run ran on. A SHA is matched as a prefix, and a match supports only at ${MIN_SUPPORTING_SHA} or more hex characters. Not what the commit changes or fixes.`;
    const fields = ['/observation/head_sha'];
    if (!HEX40.test(o.head_sha)) return { ...base, status: 'NOT_CHECKED', evidence_fields: [], scope, reason: 'GitHub returned no recognisable head_sha for this run.' };
    if (o.head_sha.startsWith(t)) {
      // A 7-character prefix is 28 bits: someone can grind a commit that shares it (XC1 Z2). A match
      // that short is not evidence of WHICH commit was meant, so it supports nothing. A mismatch of
      // any length still contradicts: no prefix of this run's SHA looks like that.
      if (t.length < MIN_SUPPORTING_SHA) {
        return { ...base, status: 'NOT_CHECKED', evidence_fields: [], scope, reason: `The cited ${t.length}-character SHA matches the inspected run's head_sha, but fewer than ${MIN_SUPPORTING_SHA} characters do not identify one commit. Cite at least ${MIN_SUPPORTING_SHA}.` };
      }
      return { ...base, status: 'SUPPORTED', evidence_fields: fields, scope, reason: `The inspected run's head_sha ${shortSha(o.head_sha)} begins with ${t}.` };
    }
    return { ...base, status: 'CONTRADICTED', evidence_fields: fields, scope, reason: `The claim cites commit ${t}; the inspected run is on ${shortSha(o.head_sha)}.` };
  }
  if (h.template === 'gha.run_id') {
    const scope = 'Run identity only: whether the run this claim cites is the inspected run. Not what the run shows.';
    const fields = ['/observation/owner', '/observation/repo', '/observation/run_id'];
    if (h.sameRepo === false) return { ...base, status: 'CONTRADICTED', evidence_fields: fields, scope, reason: 'The claim links a run in a different repository from the inspected one.' };
    if (h.runId !== o.run_id) return { ...base, status: 'CONTRADICTED', evidence_fields: fields, scope, reason: `The claim cites run ${h.runId}; the inspected run is ${o.run_id}.` };
    return { ...base, status: 'SUPPORTED', evidence_fields: fields, scope, reason: `The cited run is the inspected run, ${o.run_id}.` };
  }
  // gha.run_attempt
  const scope = "Attempt identity only: whether the attempt this claim cites is the one GitHub's record describes. Not what that attempt shows.";
  const fields = ['/observation/run_attempt'];
  if (o.run_attempt === null) return { ...base, status: 'NOT_CHECKED', evidence_fields: [], scope, reason: 'GitHub returned no run_attempt, so an attempt number cannot be compared.' };
  if (h.attempt !== o.run_attempt) {
    return { ...base, status: 'CONTRADICTED', evidence_fields: fields, scope, reason: `The claim cites attempt ${h.attempt}; GitHub's record for run ${o.run_id} is attempt ${o.run_attempt}, its latest.` };
  }
  return { ...base, status: 'SUPPORTED', evidence_fields: fields, scope, reason: `The cited attempt is ${o.run_attempt}, the one GitHub's record describes.` };
}

/**
 * What one sentence establishes about which run it is about, from its OWN citations only. There is
 * no text-level fallback: a citation in one sentence says nothing about the next (XC1 D1, F2-F5).
 *
 *   gate      set when the sentence decides nothing at all (a question, a quote, or words no
 *             template read), with the reason
 *   mismatch  it cites a commit, run or attempt that is not, or could not be matched to, this run
 *   commit    it cites this run's commit or run id (a run id fixes the commit too)
 *   run       it cites this run's id or URL
 *
 * An attempt number never anchors anything: "attempt 1" matches most runs on GitHub (XC1 F1). It
 * can only break an anchor, when it does not match.
 */
interface Anchor {
  gate: string | null;
  mismatch: boolean;
  commit: boolean;
  run: boolean;
  /** Guided mode: the line cites nothing and is taken to be about the inspected run. */
  bound?: boolean;
}

function outcomeEntry(h: Hit, sentence: string, o: Observation, anchor: Anchor, qualifier: string | null, checks?: CommitChecks): ClaimEntry {
  const base = { claim: normalizeClaimText(h.span), sentence, template: h.template };
  const nc = (scope: string, reason: string): ClaimEntry => ({ ...base, status: 'NOT_CHECKED', evidence_fields: [], scope, reason });
  const run = runRef(o);
  const jobs = o.jobs.items;
  const finished = o.status === 'completed';

  if (h.template === 'ci.build_unscoped') {
    return nc('Not compared: "the build" names no workflow and no check.', `"The build" could be any workflow or check, so it is not compared with ${run}.`);
  }
  if (anchor.gate) return nc('Not compared: this sentence is not read as a plain statement.', anchor.gate);
  if (qualifier) {
    return nc('Not compared: a negated, failing or partial claim is not read automatically.', `The sentence contains "${qualifier}", which changes what the claim means, so it was not compared with the run.`);
  }
  const namesThis = h.name !== undefined && namesThisWorkflow(h.name, o);
  if (h.template === 'gha.run_succeeded' && h.name !== undefined && !namesThis) {
    // The name is the claimant's text, so it is never spliced into this sentence.
    return nc(
      'Not compared: the claim names a different workflow.',
      `The claim names a workflow other than the inspected one (see /observation/workflow), so ${run} is not evidence for it.`,
    );
  }
  if (anchor.mismatch) {
    return nc(
      'Not compared: nothing ties this claim to the inspected run.',
      'This sentence cites a commit, run or attempt that is not, or could not be matched to, the inspected run, so its outcome claims are not compared with this run.',
    );
  }
  if (!anchor.commit) {
    return nc('Not compared: nothing ties this claim to the inspected run.', `This sentence cites neither this run's commit nor its run id, so nothing ties the claim to ${run}.`);
  }
  // Only the run id identifies a workflow run. A commit has many runs ("the workflow passed on <sha>"
  // could be an always-green labeler next to a red CI, XC1 F7), and a workflow's display name is not
  // unique in a repository (XC1 Z1), so neither ties "this run succeeded" to this run.
  if (h.template === 'gha.run_succeeded' && !anchor.run) {
    return nc(
      'Not compared: the claim does not cite this run.',
      `A commit has many workflow runs, and a workflow name can be shared, so only the run id identifies one. This line does not cite run ${o.run_id}, so it is not compared.`,
    );
  }
  const how = anchor.bound
    ? 'The line cites nothing; in guided mode it is taken to be about the inspected run.'
    : anchor.run
      ? 'The line cites this run.'
      : 'The line cites this commit.';

  if (h.template === 'ci.tests_pass') {
    const scope = 'Not decided by a run record: it says how jobs concluded, not which tests ran or how each one ended.';
    if (!finished) return nc(scope, `${run} has not finished (status: ${word(o.status)}).`);
    if (o.conclusion === 'success') {
      return nc(scope, `${run} concluded "success". That is consistent with this claim but does not establish it: the run record does not say which tests ran or whether all of them passed.`);
    }
    return nc(scope, `${run} concluded "${word(o.conclusion)}". That does not establish that a test failed: the run record does not say which step failed or why.`);
  }

  // A job that names another commit or attempt cannot be counted as part of this run's evidence.
  // Strict: a job with no head_sha cannot be tied to this commit either (XC1 L4).
  const offSha = jobs.filter((j) => j.head_sha !== o.head_sha).length;
  const offAttempt = jobs.filter((j) => j.run_attempt !== null && o.run_attempt !== null && j.run_attempt !== o.run_attempt).length;
  const jobsUnread =
    o.jobs.http_status < 200 || o.jobs.http_status >= 300
      ? `the jobs endpoint answered HTTP ${o.jobs.http_status}, so no job result was read`
      : o.jobs.total > jobs.length
        ? `GitHub reports ${o.jobs.total} jobs and returned ${jobs.length}, so not every job was read`
        : jobs.length === 0
          ? 'the run reports no jobs'
          : offSha
            ? `${offSha} of ${jobs.length} jobs report a head_sha other than the run's`
            : offAttempt
              ? `${offAttempt} of ${jobs.length} jobs report a different run attempt`
              : null;
  const failedJobs = jobs.filter((j) => j.conclusion !== null && FAILED_CONCLUSIONS.has(j.conclusion)).length;
  const notSucceeded = jobs.filter((j) => j.conclusion !== 'success' && j.conclusion !== 'skipped').length;
  const ran = jobs.filter((j) => j.conclusion === 'success').length;
  const skipped = jobs.filter((j) => j.conclusion === 'skipped').length;

  if (h.template === 'gha.run_succeeded') {
    const fields = ['/observation/status', '/observation/conclusion', '/observation/check/verdict', '/observation/jobs'];
    const scope = `Whether workflow ${run} concluded success with every job read. Not which tests it ran, not any other workflow or check on the commit, and not whether the change works.`;
    if (!finished) return nc(scope, `${run} has not finished (status: ${word(o.status)}).`);
    // A finished run with no readable conclusion is a malformed record, not a failed run.
    if (word(o.conclusion) === 'unrecognised') return nc(scope, `${run} is reported finished but with no recognisable conclusion.`);
    if (o.conclusion !== 'success') {
      return { ...base, status: 'CONTRADICTED', evidence_fields: fields, scope, reason: `${run} finished with conclusion "${word(o.conclusion)}", not "success".` };
    }
    if (jobsUnread) return nc(scope, `GitHub reports conclusion "success", but ${jobsUnread}.`);
    if (notSucceeded) return nc(scope, `GitHub reports conclusion "success" for the run, but ${notSucceeded} of ${jobs.length} jobs concluded something else: the record disagrees with itself.`);
    if (ran === 0) return nc(scope, 'Every job was skipped. A run in which no job ran is not a run that succeeded at anything.');
    return {
      ...base,
      status: 'SUPPORTED',
      evidence_fields: fields,
      scope,
      reason: `GitHub reports conclusion "success" for ${run}; ${ran} of ${plural(jobs.length, 'job')} concluded success${skipped ? ` and ${skipped} skipped` : ''}. ${how}`,
    };
  }

  // Guided mode: with every check on the commit read, "all checks pass" is decided across all of them.
  if (checks && checks.head_sha === o.head_sha) return allChecksEntry(base, o, checks, how);

  // ci.all_checks_pass: one run can refute it, never establish it.
  const fields = ['/observation/status', '/observation/conclusion', '/observation/jobs'];
  const scope = 'A claim about every check on the commit. One workflow run can contradict it (a failing check is a counterexample) but cannot establish it: the other checks were not read.';
  if (!finished) return nc(scope, `${run} has not finished (status: ${word(o.status)}).`);
  if (o.conclusion !== null && FAILED_CONCLUSIONS.has(o.conclusion)) {
    return { ...base, status: 'CONTRADICTED', evidence_fields: fields, scope, reason: `${run}, a check on this commit, concluded "${word(o.conclusion)}". ${how}` };
  }
  if (!jobsUnread && failedJobs) {
    return { ...base, status: 'CONTRADICTED', evidence_fields: fields, scope, reason: `${failedJobs} of ${jobs.length} jobs in ${run}, each a check run on this commit, concluded failure. ${how}` };
  }
  if (o.conclusion === 'success') return nc(scope, `${run} concluded "success", but it is one workflow; the other checks on this commit were not read.`);
  return nc(scope, `${run} concluded "${word(o.conclusion)}", which is not a failure, and the other checks on this commit were not read.`);
}

/** The citation and outcome hits of one sentence, before verdicts. */
interface SentenceHits {
  sentence: string;
  full: string;
  citations: ClaimEntry[];
  citationAt: number[];
  outcomes: Hit[];
  exclusions: Hit[];
  qualifier: string | null;
  /** What no template matched, if any of it says something. */
  remainder: string | null;
  /** A "?" outside every matched span: the sentence asks rather than states. */
  question: boolean;
}

/**
 * Words that carry no claim on their own: articles, plain prepositions, and the copulas that
 * templates already read around ("CI is green"). Deliberately short. Possessives ("my checks" is not
 * "all checks", XC1 N7) and words like "or", "now" and "we" are NOT here: they change what a
 * sentence says, so they count as unread words.
 */
// "that" is not filler: "That the check workflow passed …" is a clause, not an assertion (XC1 Y3).
const FILLER = new Set('a an and also as at be been by for from has have in is it of on the this to was were with'.split(' '));

/**
 * The only characters a leftover may hold and still say nothing: whitespace and plain ASCII
 * punctuation, emphasis and code marks. An ALLOW-list on purpose. Everything else counts as unread
 * meaning: `~` (strikethrough is a retraction, XC1 N1), any symbol or emoji (a cross mark negates,
 * XC1 N2), non-ASCII punctuation (an interrobang or an Arabic question mark asks, XC1 N3).
 */
const IGNORABLE = new Set([...' \t.,;:()[]\'"`*_!-']);

/** Question marks NFKC does not fold to "?": interrobang, Arabic question mark, reversed question mark. */
const QUESTION_MARKS = ['?', String.fromCharCode(0x203d), String.fromCharCode(0x061f), String.fromCharCode(0x2e2e)];

/** A sentence that opens with an auxiliary verb asks, even without a question mark (XC1 N5: "Has the check workflow passed …."). */
const AUXILIARIES = new Set('is are was were has have had do does did can could will would should shall may might must'.split(' '));
/** Words that may come before an inverted auxiliary without making the sentence a statement: "And has …". */
const LEADING_CONNECTIVES = new Set('and but or so then also yet plus now well ok okay'.split(' '));

/**
 * Whether a sentence opens with an auxiliary verb, so it asks even without a question mark. Leading
 * emphasis, punctuation and connectives are skipped first: "*Has* the …", "And is CI green …" (XC1
 * re-check 2). Bounded look-ahead, so linear.
 */
function opensWithAuxiliary(s: string): boolean {
  let i = 0;
  for (let words = 0; words < 8; words += 1) {
    while (i < s.length && IGNORABLE.has(s[i] as string)) i += 1;
    const m = /^\p{L}+/u.exec(s.slice(i, i + 40));
    if (!m) return false;
    const w = m[0].toLowerCase();
    if (AUXILIARIES.has(w)) return true;
    if (!LEADING_CONNECTIVES.has(w)) return false;
    i += m[0].length;
  }
  return false;
}

const EDGE = new Set([...' \t.,;:!?()[]\'"`-']);

/** Trim spaces and punctuation from both ends, for display. A loop, not `/[…]+$/`, which is quadratic on a long run of them. */
function trimPunctuation(s: string): string {
  let a = 0;
  let b = s.length;
  while (a < b && EDGE.has(s[a] as string)) a += 1;
  while (b > a && EDGE.has(s[b - 1] as string)) b -= 1;
  return s.slice(a, b);
}

/** A word in any script: a remainder in Chinese or Cyrillic says something too. */
const WORD = /[\p{L}\p{N}][\p{L}\p{N}\p{M}'._-]*/gu;

/** Whether a leftover fragment says anything: a non-filler word, or any character outside {@link IGNORABLE}. */
function saysSomething(fragment: string): boolean {
  const withoutFiller = fragment.replace(WORD, (w) => (FILLER.has(w.toLowerCase()) ? ' ' : w));
  for (const ch of withoutFiller) if (!IGNORABLE.has(ch)) return true;
  return false;
}

/**
 * The parts of a sentence no template matched, joined with an ellipsis, or null if they say
 * nothing; and whether a question mark sits outside every match. Without the remainder, "CI is not
 * green on b8a17cfb" would show one SUPPORTED commit citation and nothing else.
 */
function remainderOf(full: string, covered: [number, number][]): { remainder: string | null; question: boolean } {
  const sorted = [...covered].sort((a, b) => a[0] - b[0]);
  const parts: string[] = [];
  let i = 0;
  for (const [start, end] of sorted) {
    if (start > i) parts.push(full.slice(i, start));
    i = Math.max(i, end);
  }
  parts.push(full.slice(i));
  const question = parts.some((p) => QUESTION_MARKS.some((q) => p.includes(q)));
  const kept = parts.filter(saysSomething).map((p) => trimPunctuation(p) || p.trim());
  return { remainder: kept.length ? normalizeClaimText(kept.join(' … ')) : null, question };
}

function scanSentence(sentence: string, full: string, o: Observation): SentenceHits {
  const local = LOCAL_RUN.test(full);
  const cites = citationHits(full, o);
  // A local run is not this run: its pass and success claims are left to excluded.local_run.
  const outcomes = local
    ? []
    : [
        ...hitsFor('gha.run_succeeded', RUN_SUCCEEDED, full),
        ...hitsFor('ci.all_checks_pass', ALL_CHECKS, full),
        ...hitsFor('ci.tests_pass', TESTS_PASS, full),
        ...hitsFor('ci.build_unscoped', BUILD_PASS, full),
      ];
  const exclusions: Hit[] = [];
  for (const x of EXCLUSIONS) {
    const m = full.match(x.pattern);
    if (m) exclusions.push({ template: x.id, span: m[0], at: m.index ?? 0 });
  }
  const q = full.match(PASS_QUALIFIER);
  const covered = [...cites, ...outcomes, ...exclusions].map((h): [number, number] => [h.at, h.at + h.span.length]);
  // A sentence no template matched is, all of it, unread: it gates its paragraph like any remainder.
  const rest = covered.length
    ? remainderOf(full, covered)
    : { remainder: saysSomething(full) ? normalizeClaimText(full) : null, question: QUESTION_MARKS.some((q) => full.includes(q)) };
  if (opensWithAuxiliary(full)) rest.question = true;
  return {
    sentence,
    full,
    citations: cites.filter((h) => !h.dup).map((h) => citationEntry(h, sentence, o)),
    citationAt: cites.filter((h) => !h.dup).map((h) => h.at),
    outcomes,
    exclusions,
    remainder: rest.remainder,
    question: rest.question,
    qualifier: q ? q[0].toLowerCase().replace(/[^a-z']/g, '') : null,
  };
}

/**
 * Why a plain line is not read end to end, or null. A verdict, SUPPORTED or CONTRADICTED, is given
 * only for lines the templates understood END TO END: "If the workflow passed on 5cd68edc, merge",
 * "The lint checks pass", "The workflow passed on a branch rebased on 5cd68edc" each have words no
 * template read, and those words change what the line says. A line that opens with an auxiliary
 * verb asks.
 */
function lineGate(s: SentenceHits): string | null {
  if (s.question) return 'it asks rather than states';
  if (s.remainder) return 'it has words no template reads (listed as their own claim)';
  return null;
}

/**
 * Options for {@link mapClaims}. Both are guided mode (`--guided`, EXPERIMENTAL); {@link buildRecord}
 * sets them from the observation, so a record can always be re-derived from its own contents.
 */
export interface MapOptions {
  /** A line that cites nothing is about the inspected run, when nothing in the text points elsewhere. */
  bindToRun?: boolean;
  /** Every check on the run's head commit, for ci.all_checks_pass. */
  commitChecks?: CommitChecks;
}

/**
 * "All checks pass" against every check on the commit. SUPPORTED only when every one of these holds:
 *   the whole list was returned, and every check run finished with `success` and every status is
 *   `success` (skipped and neutral did not pass, XC1 C1/C2); at least one check run exists;
 *   no GitHub Actions suite, and no suite that has runs, is still pending; every required check
 *   reported and passed; the inspected run itself concluded success and each of its jobs is in the
 *   list with that conclusion (XC1 C7); no check failed on an earlier attempt; and the PR does not
 *   edit its own workflows. CONTRADICTED when any latest check run or status failed. Otherwise
 *   NOT_CHECKED. Check names are third-party text, so only counts reach the reason.
 */
function allChecksEntry(base: Pick<ClaimEntry, 'claim' | 'sentence' | 'template'>, o: Observation, c: CommitChecks, how: string): ClaimEntry {
  const sha = shortSha(o.head_sha);
  const runs = c.check_runs.items;
  const sts = c.statuses.items;
  const n = runs.length + sts.length;
  const fields = ['/observation/commit_checks'];
  const scope =
    `Every check GitHub reported for commit ${sha} at ${c.retrieved_at}: the latest run of each check run, each commit status, and the base branch's required checks. ` +
    `Not which tests ran, not checks that do not report to GitHub, and not whether the change works.` +
    (c.workflows_changed === null ? ' Whether the change edited its own workflows was not checked.' : '');
  const failed = runs.filter((r) => r.conclusion !== null && FAILED_CONCLUSIONS.has(r.conclusion)).length + sts.filter((x) => x.state === 'failure' || x.state === 'error').length;
  if (failed) {
    return { ...base, status: 'CONTRADICTED', evidence_fields: fields, scope, reason: `${failed} of ${n} checks on commit ${sha} failed. ${how}` };
  }
  const nc = (reason: string): ClaimEntry => ({ ...base, status: 'NOT_CHECKED', evidence_fields: [], scope, reason });
  if (runs.length < c.check_runs.total_count || sts.length < c.statuses.total_count) return nc(`GitHub reports more checks on commit ${sha} than it returned, so not every check was read.`);
  if (runs.length === 0) return nc(`GitHub reports no check run on commit ${sha}.`);
  const unfinished = runs.filter((r) => r.status !== 'completed').length + sts.filter((x) => x.state === 'pending').length;
  if (unfinished) return nc(`${unfinished} of ${n} checks on commit ${sha} had not finished.`);
  if (c.suites === null || c.suites.items.length < c.suites.total_count) return nc(`The check suites on commit ${sha} were not all read, so a workflow that had not started could be missing.`);
  const pending = c.suites.items.filter((x) => x.status !== 'completed' && (x.runs > 0 || x.app === 'github-actions')).length;
  if (pending) return nc(`${pending} check suites on commit ${sha} had not completed, so not every check has reported.`);
  const notPassed = runs.filter((r) => r.conclusion !== 'success').length + sts.filter((x) => x.state !== 'success').length;
  if (notPassed) return nc(`${notPassed} of ${n} checks on commit ${sha} were skipped, neutral or cancelled. A check that did not run did not pass.`);
  if (c.required === null) return nc(`The base branch's required checks could not be read.`);
  const reported = new Set([...runs.map((r) => r.name), ...sts.map((x) => x.context)]);
  const missing = c.required.filter((name) => !reported.has(name)).length;
  if (missing) return nc(`${missing} of ${c.required.length} checks the base branch requires never reported on commit ${sha}, so not all checks have passed.`);
  const jobs = o.jobs.items;
  const absent = jobs.filter((j) => !runs.some((r) => r.name === j.name && r.conclusion === j.conclusion)).length;
  if (o.conclusion !== 'success' || absent) return nc(`The inspected run (${runRef(o)}) does not agree with the recorded checks, so the evidence is inconsistent.`);
  if (c.superseded_failures === null) return nc(`Earlier attempts of the checks on commit ${sha} were not read.`);
  if (c.superseded_failures) return nc(`${plural(c.superseded_failures, 'check')} on commit ${sha} failed on an earlier attempt and passed when re-run.`);
  if (c.workflows_changed) return nc(`The change edits its own workflows (.github/workflows), so these checks ran the claimant's code.`);
  return { ...base, status: 'SUPPORTED', evidence_fields: fields, scope, reason: `All ${n} checks GitHub reported on commit ${sha} passed, including every required check. ${how}` };
}

/**
 * Map free claim text onto an observation. PURE: same text and observation, same entries, same order.
 *
 * DENY BY DEFAULT, over the WHOLE input. A verdict is given only when every line is a plain claim
 * line (see {@link plainLineProblem}) that the templates read end to end. One line that is not (a
 * Markdown line, a cross mark, "is false.", a question) blocks every verdict in the text, because
 * nothing here can tell what that line does to the others. Everything is still listed. Within a
 * readable text, each line's own citations decide which run it is about (see {@link Anchor}).
 */
export function mapClaims(text: string, o: Observation, opts: MapOptions = {}): ClaimEntry[] {
  const { lines, dropped } = readClaims(text);
  const scanned = lines.map((l) => (l.problem ? null : scanSentence(l.text, l.text, o)));
  const blockers: string[] = [];
  lines.forEach((l, i) => {
    const s = scanned[i];
    const why = l.problem ?? (s ? lineGate(s) : null);
    if (why) blockers.push(`line ${l.lineNo}: ${why}`);
  });
  // Two non-blank lines with no blank line between them render as ONE paragraph on GitHub: "Locally"
  // above a claim, or "locally." below it, changes what the claim says (XC1 Y1). Each claim must be
  // its own paragraph, so adjacent lines block every verdict.
  lines.forEach((l, i) => {
    const prev = lines[i - 1];
    if (prev && l.lineNo === prev.lineNo + 1) blockers.push(`lines ${prev.lineNo} and ${l.lineNo} are not separated by a blank line, so they render as one paragraph`);
  });
  if (dropped > 0) blockers.push(`${dropped} lines after the first ${MAX_CLAIMS} were not read`);
  // Guided mode binds a line that cites nothing to the inspected run, but only when nothing in the
  // text points elsewhere: every citation anywhere is SUPPORTED, no line names something a run cannot
  // show (a local run, a deployment), and every line was read (XC1 stage 2, B1-B6: "On commit
  // deadbeef…" above "All checks pass." moved the claim to another commit).
  const bindable =
    !!opts.bindToRun &&
    lines.every((l, i) => !l.problem && scanned[i] !== null) &&
    scanned.every((sc) => !sc || (sc.exclusions.length === 0 && sc.citations.every((c) => c.status === 'SUPPORTED')));
  const block = blockers.length
    ? `Not every line of this text is a plain claim the templates read in full (${blockers[0]}${blockers.length > 1 ? `, and ${blockers.length - 1} more` : ''}), so nothing in the text is decided.`
    : null;

  const out: ClaimEntry[] = [];
  lines.forEach((l, idx) => {
    if (l.problem) {
      out.push({
        claim: l.text,
        sentence: l.text,
        template: 'excluded.markup',
        status: 'NOT_CHECKED',
        evidence_fields: [],
        scope: 'Only plain-text claim lines are read: printable ASCII, starting with a letter, one sentence, no Markdown or HTML.',
        reason: `Line ${l.lineNo} is not certifiable: ${l.problem}. Markup and non-ASCII text are listed, never read.`,
      });
      return;
    }
    const s = scanned[idx] as SentenceHits;
    const gate = block;
    const citations = gate
      ? s.citations.map((c): ClaimEntry => ({ ...c, status: 'NOT_CHECKED', evidence_fields: [], reason: gate }))
      : s.citations;
    const mismatch = citations.some((c) => c.status !== 'SUPPORTED');
    const anchor: Anchor = {
      gate,
      mismatch,
      commit: !mismatch && citations.some((c) => c.status === 'SUPPORTED' && (c.template === 'git.head_sha' || c.template === 'gha.run_id')),
      run: !mismatch && citations.some((c) => c.status === 'SUPPORTED' && c.template === 'gha.run_id'),
    };
    if (bindable && citations.length === 0) {
      anchor.commit = true;
      anchor.run = true;
      anchor.bound = true;
    }

    const entries: { at: number; order: number; e: ClaimEntry }[] = [];
    citations.forEach((e, i) => entries.push({ at: s.citationAt[i] as number, order: 0, e }));
    s.outcomes.forEach((h) => entries.push({ at: h.at, order: 1, e: outcomeEntry(h, s.sentence, o, anchor, s.qualifier, opts.commitChecks) }));
    s.exclusions.forEach((h, i) =>
      entries.push({
        at: h.at,
        order: 2 + i,
        e: {
          claim: normalizeClaimText(h.span),
          sentence: s.sentence,
          template: h.template,
          status: 'NOT_CHECKED',
          evidence_fields: [],
          scope: 'Outside what a workflow run record can show.',
          reason: (EXCLUSIONS.find((x) => x.id === h.template) as Exclusion).reason,
        },
      }),
    );
    if (entries.length === 0) {
      out.push({
        claim: s.sentence,
        sentence: s.sentence,
        template: 'unmapped',
        status: 'NOT_CHECKED',
        evidence_fields: [],
        scope: 'No deterministic template matches this line.',
        reason: 'Not compared with anything, so it is neither supported nor contradicted. Because of it, nothing in the text is decided.',
      });
      return;
    }
    entries.sort((a, b) => a.at - b.at || a.order - b.order);
    out.push(...entries.map((x) => x.e));
    if (s.remainder) {
      out.push({
        claim: s.remainder,
        sentence: s.sentence,
        template: 'unmapped',
        status: 'NOT_CHECKED',
        evidence_fields: [],
        scope: 'The part of this line no template matched.',
        reason: 'Not compared with anything, so it is neither supported nor contradicted. Because of it, nothing in the text is decided.',
      });
    }
  });
  if (dropped > 0) {
    const note = `(${dropped} further lines)`;
    out.push({
      claim: note,
      sentence: note,
      template: 'truncated',
      status: 'NOT_CHECKED',
      evidence_fields: [],
      scope: `Only the first ${MAX_CLAIMS} lines are read.`,
      reason: `${dropped} lines after the first ${MAX_CLAIMS} were not read at all, so nothing in the text is decided.`,
    });
  }
  return out;
}

// ── the record ──────────────────────────────────────────────────────────────────────────────────

/** Build the observation from `check`'s result. PURE. */
export function observationFromCheck(r: CheckResult, fetchedAt: string): Observation {
  const parsed = parseRun(r.source);
  if (!parsed) throw new CheckError('need https://github.com/owner/repo/actions/runs/123', true);
  const runId = Number(parsed.runId);
  // The record is about the run that was asked for. GitHub answering for another id is not a
  // detail to note on the card; it means the record would describe the wrong thing.
  if (r.run.id !== null && r.run.id !== runId) throw new CheckError(`GitHub answered for run ${r.run.id}, but run ${runId} was asked for`);
  // Every string GitHub sent is kept as sent, except that an unpaired surrogate becomes U+FFFD
  // (see wellFormed). Control characters stay in the record, where JSON escapes them; the card
  // strips them before display.
  const wf = wellFormed;
  const orNull = (s: string | null) => (s === null ? null : wf(s));
  return {
    platform: 'github-actions',
    host: 'api.github.com',
    url: `https://github.com/${parsed.owner}/${parsed.repo}/actions/runs/${parsed.runId}`,
    owner: parsed.owner,
    repo: parsed.repo,
    run_id: runId,
    run_attempt: r.run.attempt,
    workflow: { name: wf(r.run.workflow), path: wf(r.run.workflow_path) },
    head_sha: wf(r.sha),
    status: wf(r.run.status),
    conclusion: orNull(r.run.conclusion),
    check: { verdict: r.verdict, results: r.checks.map((c) => ({ ok: c.ok, label: wf(c.label), detail: wf(c.detail) })) },
    jobs: {
      http_status: r.jobs.http_status,
      total: r.jobs.total,
      items: r.jobs.items.map((j) => ({ name: wf(j.name), status: wf(j.status), conclusion: orNull(j.conclusion), head_sha: wf(j.head_sha), run_attempt: j.run_attempt })),
    },
    fetchedAt,
    freshness: 'LIVE',
  };
}

/** Assemble the record. PURE. */
export function buildRecord(observation: Observation, claimText: string): ActionEvidenceRecord {
  // A record is guided exactly when its observation holds the commit's checks, so the claims can
  // always be re-derived from the record itself.
  const guided = observation.commit_checks !== undefined;
  return {
    schema: ACTION_EVIDENCE_SCHEMA,
    observation,
    claims: mapClaims(claimText, observation, guided ? { bindToRun: true, commitChecks: observation.commit_checks } : {}),
    assurance: { cryptographic_integrity: 'NOT_CHECKED', observation: 'PLATFORM_REPORTED' },
    does_not_prove: guided ? GUIDED_DOES_NOT_PROVE : RECORD_DOES_NOT_PROVE,
  };
}

/**
 * The attempt a run URL names (`…/actions/runs/123/attempts/2`), if any. `parseRun` accepts such a
 * URL but the run endpoint always answers for the LATEST attempt, so a record built from it would
 * silently describe a different attempt from the one asked for.
 */
export function urlAttempt(url: string): number | null {
  const m = String(url || '').match(/\/actions\/runs\/\d+\/attempts\/(\d+)(?:[/?#]|$)/);
  return m ? Number(m[1]) : null;
}

/**
 * Fetch the run through `check` (api.github.com only) and build the record.
 * Throws {@link CheckError} for a usage problem, an unreachable API, or a record that would
 * describe a different run or attempt from the one the URL names.
 */
export async function inspectRunClaims(
  url: string,
  claimText: string,
  opts: { env?: Record<string, string | undefined>; now?: () => Date; guided?: boolean } = {},
): Promise<{ record: ActionEvidenceRecord; digest: RecordDigest }> {
  const env = opts.env ?? process.env;
  const now = opts.now ?? (() => new Date());
  const result = await runCheck(url, env);
  const fetchedAt = now().toISOString();
  const asked = urlAttempt(url);
  if (asked !== null && asked !== result.run.attempt) {
    throw new CheckError(
      `the URL names attempt ${asked}, but GitHub's run endpoint answered for attempt ${result.run.attempt ?? 'unknown'} (the latest). ` +
        'Reading a specific earlier attempt is not supported yet; nothing was recorded.',
    );
  }
  const observation = observationFromCheck(result, fetchedAt);
  // Guided mode reads every check on the run's commit. Only a full SHA is asked about: a run whose
  // head_sha is malformed has no commit to read, and stays an ordinary (unguided) record.
  if (opts.guided && /^[0-9a-f]{40}$/.test(observation.head_sha)) {
    observation.commit_checks = await fetchCommitChecks(observation.owner, observation.repo, observation.head_sha, env, now);
  }
  const record = buildRecord(observation, claimText);
  return { record, digest: digestRecord(record) };
}

export interface ClaimTally {
  SUPPORTED: number;
  CONTRADICTED: number;
  NOT_CHECKED: number;
}

export function tallyClaims(claims: ClaimEntry[]): ClaimTally {
  const t: ClaimTally = { SUPPORTED: 0, CONTRADICTED: 0, NOT_CHECKED: 0 };
  for (const c of claims) t[c.status] += 1;
  return t;
}

/**
 * Record → process exit code. PURE. Same codes as `check <runUrl>`:
 *   1  a claim is CONTRADICTED, or the run itself FAILED / is INCONSISTENT
 *   3  anything NOT_CHECKED (including an INCONCLUSIVE run) — never 0
 *   0  every claim SUPPORTED on a COMPLETE run
 * A text with nothing checkable in it is therefore 3, not 0: "we compared nothing" is not a pass.
 */
export function claimsExitCode(record: ActionEvidenceRecord): number {
  const t = tallyClaims(record.claims);
  const v = record.observation.check.verdict;
  if (t.CONTRADICTED > 0 || v === 'FAILED' || v === 'INCONSISTENT') return 1;
  if (t.NOT_CHECKED > 0 || v !== 'COMPLETE' || record.claims.length === 0) return 3;
  return 0;
}
