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
 *  - A claim no template can check is NOT_CHECKED with the reason written next to it. Never SUPPORTED.
 *  - A claim that conflicts with a field is CONTRADICTED, and the reason names both values.
 *  - A successful run supports "this workflow run succeeded" and nothing wider: not "all tests
 *    pass", not "all checks pass", not "the fix works". Those stay NOT_CHECKED.
 *  - An outcome is compared only when the text ties it to the inspected run by citing its commit or
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

export const ACTION_EVIDENCE_SCHEMA = 'dev.trustshell.action-evidence/0.1-draft' as const;

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

/** Any letter or digit, in any script. A sentence without one is punctuation, not a claim. */
const HAS_WORD = /[\p{L}\p{N}]/u;

/**
 * Where a line sits in the rendered text. Only a `statement` can decide anything. Every other
 * context is LISTED, so a reader of the card sees it, but decides nothing: a heading labels, code
 * is an example, a quote is someone else's words, an unticked box is a to-do.
 */
export type LineContext = 'statement' | 'quote' | 'code' | 'heading' | 'todo';

/** Columns of leading whitespace, a tab counted as 4. */
function indentColumns(ws: string): number {
  let n = 0;
  for (const ch of ws) n += ch === '\t' ? 4 - (n % 4) : 1;
  return n;
}

/**
 * The code spans of one line, as [start, end) ranges, per CommonMark: a run of N backticks opens a
 * span that the next run of exactly N closes; a run with no such partner is literal. Linear: the
 * partner of every run is found in one backward pass.
 */
function codeSpanRanges(line: string): [number, number][] {
  const runs: { pos: number; len: number }[] = [];
  for (let i = 0; i < line.length; ) {
    if (line[i] !== '`') {
      i += 1;
      continue;
    }
    let j = i;
    while (j < line.length && line[j] === '`') j += 1;
    runs.push({ pos: i, len: j - i });
    i = j;
  }
  const partner: number[] = new Array(runs.length).fill(-1);
  const nextOfLen = new Map<number, number>();
  for (let k = runs.length - 1; k >= 0; k -= 1) {
    partner[k] = nextOfLen.get((runs[k] as { len: number }).len) ?? -1;
    nextOfLen.set((runs[k] as { len: number }).len, k);
  }
  const out: [number, number][] = [];
  for (let k = 0; k < runs.length; ) {
    const p = partner[k] as number;
    if (p < 0) {
      k += 1;
      continue;
    }
    const close = runs[p] as { pos: number; len: number };
    out.push([(runs[k] as { pos: number }).pos, close.pos + close.len]);
    k = p + 1;
  }
  return out;
}

/**
 * Remove inline `<!-- … -->` comments that sit outside code spans: GitHub does not show them, so a
 * claim inside one was made by nobody a reader can see (XC1 N9). A `<!--` inside a code span is
 * shown, so it is text (XC1 H2). An opener whose `-->` is on a later line starts a comment that
 * runs to it; one with no `-->` anywhere is text.
 */
function stripInlineComments(line: string, closesLater: boolean): { text: string; opensComment: boolean } {
  const spans = codeSpanRanges(line);
  let si = 0;
  const inSpan = (p: number) => {
    while (si < spans.length && (spans[si] as [number, number])[1] <= p) si += 1;
    return si < spans.length && (spans[si] as [number, number])[0] <= p;
  };
  let out = '';
  let i = 0;
  for (;;) {
    let open = line.indexOf('<!--', i);
    while (open >= 0 && inSpan(open)) open = line.indexOf('<!--', open + 1);
    if (open < 0) break;
    const close = line.indexOf('-->', open + 4);
    if (close < 0) {
      if (closesLater) return { text: out + line.slice(i, open), opensComment: true };
      break;
    }
    out += line.slice(i, open) + ' ';
    i = close + 3;
  }
  return { text: out + line.slice(i), opensComment: false };
}

/**
 * Split free text into claim sentences, each with the context it sits in. PURE, one pass, linear.
 *
 * THE RULE: drop only what a reader cannot see; decide only plain statements. HTML comments (block
 * and inline, outside code spans) are the only thing removed, because GitHub does not show them.
 * Everything else a reader sees is listed: headings, fenced and indented code, blockquotes (with
 * lazy continuation lines), and unticked task items are kept with their context, and decide
 * nothing. So a parsing mistake here can only make something NOT_CHECKED; it can never hide visible
 * text or certify a code example (XC1 H1, N4, N6, N8).
 *
 * Fences follow CommonMark, including inside containers (`- ```` opens a fence in a list item,
 * XC1 N4): 3+ backticks or tildes, a backtick fence's info string holds no backtick, and the fence
 * closes on the same character, at least as long, indented no more than 3 columns past the opener.
 */
export function splitClaims(text: string): { clauses: string[]; full: string[]; context: LineContext[]; dropped: number } {
  const lines = canonicalText(String(text ?? ''), true).split('\n');
  // closesFrom[i]: whether line i or any later line holds "-->". One backward pass keeps this linear.
  const closesFrom: boolean[] = new Array(lines.length + 1).fill(false);
  for (let i = lines.length - 1; i >= 0; i -= 1) closesFrom[i] = closesFrom[i + 1] || (lines[i] as string).includes('-->');

  const out: { text: string; context: LineContext }[] = [];
  const push = (body: string, context: LineContext) => {
    for (const part of body.split(/(?<=[.!?;])\s+/)) {
      const whole = part.replace(/\s+/g, ' ').trim();
      if (HAS_WORD.test(whole)) out.push({ text: whole, context });
    }
  };
  let fence: { ch: string; len: number; col: number } | null = null;
  let inComment = false;
  /** The context of the previous non-blank line, for paragraph and quote continuation. */
  let prev: LineContext | 'blank' = 'blank';

  for (let i = 0; i < lines.length; i += 1) {
    let line = lines[i] as string;

    if (fence) {
      // One character class for the whole prefix: two adjacent `[ \t]*` would be quadratic on a long line of spaces.
      const close = line.match(/^([ \t>]*)(`{3,}|~{3,})[ \t]*$/);
      const marks = close ? (close[2] as string) : '';
      if (close && marks[0] === fence.ch && marks.length >= fence.len && indentColumns(close[1] as string) <= fence.col + 3) {
        fence = null;
        prev = 'blank';
        continue;
      }
      push(line, 'code');
      continue;
    }

    if (inComment) {
      const end = line.indexOf('-->');
      if (end < 0) continue;
      inComment = false;
      line = line.slice(end + 3);
    } else if (/^ {0,3}<!--/.test(line)) {
      const open = line.indexOf('<!--');
      const sameLine = line.indexOf('-->', open + 4);
      if (sameLine >= 0) line = line.slice(sameLine + 3);
      else if (closesFrom[i + 1]) {
        inComment = true;
        continue;
      }
    }
    const stripped = stripInlineComments(line, closesFrom[i + 1] === true);
    line = stripped.text;
    if (stripped.opensComment) inComment = true;

    if (!line.trim()) {
      prev = 'blank';
      continue;
    }

    // Containers: indentation, blockquote markers, a list marker, then the line's own content.
    const m = line.match(/^([ \t]*)((?:>[ \t]?)*)((?:[-*+]|\d{1,9}[.)])(?:[ \t]+|$))?/) as RegExpMatchArray;
    const indent = indentColumns(m[1] as string);
    const quoteMarks = (m[2] as string) !== '';
    const listMarker = m[3] !== undefined;
    let rest = line.slice(m[0].length);
    const fenceCol = indentColumns((m[1] as string) + (m[2] as string) + (m[3] ?? ''));

    // Indented code: 4+ columns with no container, not continuing a paragraph (which it cannot interrupt).
    if (indent >= 4 && !quoteMarks && !listMarker) {
      const continues: boolean = prev === 'statement' || prev === 'quote' || prev === 'todo';
      const ctx: LineContext = continues ? (prev as LineContext) : 'code';
      push(rest, ctx);
      prev = ctx;
      continue;
    }

    const opener = rest.match(/^(`{3,}|~{3,})(.*)$/);
    if (opener && !((opener[1] as string)[0] === '`' && (opener[2] as string).includes('`'))) {
      fence = { ch: (opener[1] as string)[0] as string, len: (opener[1] as string).length, col: fenceCol };
      prev = 'code';
      continue;
    }

    let ctx: LineContext;
    if (quoteMarks) ctx = 'quote';
    else if (prev === 'quote' && !listMarker && !/^#{1,6}(?:\s|$)/.test(rest)) ctx = 'quote'; // lazy continuation (XC1 N6)
    else ctx = 'statement';

    if (/^#{1,6}(?:\s|$)/.test(rest)) {
      rest = rest.replace(/^#{1,6}\s*/, '');
      if (ctx === 'statement') ctx = 'heading';
    } else if (/^\[ \](?:\s|$)/.test(rest)) {
      rest = rest.slice(3);
      if (ctx === 'statement') ctx = 'todo';
    } else {
      rest = rest.replace(/^\[[xX]\]\s+/, '');
    }
    push(rest, ctx);
    prev = ctx;
  }

  const kept = out.slice(0, MAX_CLAIMS);
  return {
    clauses: kept.map((s) => normalizeClaimText(s.text)),
    full: kept.map((s) => s.text),
    context: kept.map((s) => s.context),
    dropped: Math.max(0, out.length - MAX_CLAIMS),
  };
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

/** Commit citations. `needLetter` is for the weak contexts, so a run id or a count is not read as a SHA. */
const SHA_PATTERNS: { re: RegExp; needLetter: boolean }[] = [
  { re: /\b(?:commit|sha|rev(?:ision)?)\s*(?:[:#]\s*)?[`'"(\[]?([0-9a-f]{7,40})(?![0-9a-z])/gi, needLetter: false },
  { re: /(?:https?:\/\/)?(?:www\.)?github\.com\/[\w.-]+\/[\w.-]+\/commit\/([0-9a-f]{7,40})(?![0-9a-z])/gi, needLetter: false },
  { re: /\b(?:in|on|at|of)\s+[`'"(\[]?([0-9a-f]{7,40})(?![0-9a-z])/gi, needLetter: true },
  { re: /`([0-9a-f]{7,40})`/gi, needLetter: true },
];

const RUN_URL = /(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/actions\/runs\/(\d+)(\/attempts\/(\d+))?/gi;
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
      if ((needLetter && !/[a-f]/.test(sha)) || seenSha.has(sha)) continue;
      seenSha.add(sha);
      hits.push({ template: 'git.head_sha', span: m[0], at: m.index ?? 0, sha });
    }
  }
  const seenRun = new Set<number>();
  const seenAttempt = new Set<number>();
  for (const m of text.matchAll(RUN_URL)) {
    const runId = Number(m[3]);
    const sameRepo = String(m[1]).toLowerCase() === o.owner.toLowerCase() && String(m[2]).toLowerCase() === o.repo.toLowerCase();
    const at = m.index ?? 0;
    if (!seenRun.has(runId)) {
      seenRun.add(runId);
      hits.push({ template: 'gha.run_id', span: m[0].slice(0, m[0].length - (m[4] ?? '').length), at, runId, sameRepo });
    }
    if (m[5] && !seenAttempt.has(Number(m[5]))) {
      seenAttempt.add(Number(m[5]));
      hits.push({ template: 'gha.run_attempt', span: String(m[4]), at: at + m[0].length - String(m[4]).length, attempt: Number(m[5]) });
    }
  }
  const prose = text.replace(/https?:\/\/\S+/g, (u) => ' '.repeat(u.length));
  for (const m of prose.matchAll(RUN_ID)) {
    const runId = Number(m[1]);
    if (seenRun.has(runId)) continue;
    seenRun.add(runId);
    hits.push({ template: 'gha.run_id', span: m[0], at: m.index ?? 0, runId, sameRepo: null });
  }
  for (const m of prose.matchAll(ATTEMPT)) {
    const attempt = Number(m[1]);
    if (seenAttempt.has(attempt)) continue;
    seenAttempt.add(attempt);
    hits.push({ template: 'gha.run_attempt', span: m[0], at: m.index ?? 0, attempt });
  }
  return hits;
}

/** A citation's verdict. Only a SUPPORTED citation ties a sentence to this run. */
function citationEntry(h: Hit, sentence: string, o: Observation): ClaimEntry {
  const base = { claim: normalizeClaimText(h.span), sentence, template: h.template };
  if (h.template === 'git.head_sha') {
    const t = h.sha as string;
    const scope = 'Commit identity only: whether the commit this claim cites is the one the inspected run ran on. A short SHA is matched as a prefix. Not what the commit changes or fixes.';
    const fields = ['/observation/head_sha'];
    if (!HEX40.test(o.head_sha)) return { ...base, status: 'NOT_CHECKED', evidence_fields: [], scope, reason: 'GitHub returned no recognisable head_sha for this run.' };
    if (o.head_sha.startsWith(t)) return { ...base, status: 'SUPPORTED', evidence_fields: fields, scope, reason: `The inspected run's head_sha ${shortSha(o.head_sha)} begins with ${t}.` };
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
}

function outcomeEntry(h: Hit, sentence: string, o: Observation, anchor: Anchor, qualifier: string | null): ClaimEntry {
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
  // A commit has many workflow runs. Citing the commit identifies the commit, not the workflow:
  // "the workflow passed on <sha>" could be an always-green labeler next to a red CI (XC1 F7).
  if (h.template === 'gha.run_succeeded' && !anchor.run && !namesThis) {
    return nc(
      'Not compared: the claim does not say which workflow.',
      `A commit has many workflow runs. This sentence cites the commit but neither names this workflow nor cites run ${o.run_id}, so it is not compared.`,
    );
  }
  const how = anchor.run ? 'The sentence cites this run.' : h.template === 'gha.run_succeeded' ? 'The sentence names this workflow and cites this commit.' : 'The sentence cites this commit.';

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
const FILLER = new Set('a an and also as at be been by for from has have in is it of on that the this to was were with'.split(' '));

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
const INVERTED_QUESTION = /^(?:is|are|was|were|has|have|had|do|does|did|can|could|will|would|should|shall|may|might|must)\s/i;

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
  const rest = covered.length ? remainderOf(full, covered) : { remainder: null, question: QUESTION_MARKS.some((q) => full.includes(q)) };
  if (INVERTED_QUESTION.test(full)) rest.question = true;
  return {
    sentence,
    full,
    citations: cites.map((h) => citationEntry(h, sentence, o)),
    citationAt: cites.map((h) => h.at),
    outcomes,
    exclusions,
    remainder: rest.remainder,
    question: rest.question,
    qualifier: q ? q[0].toLowerCase().replace(/[^a-z']/g, '') : null,
  };
}

/**
 * Why a sentence decides nothing, or null when it is a plain statement the templates read in full.
 *
 * This is the rule that closes most of what XC1 found (R1): a verdict, SUPPORTED or CONTRADICTED,
 * is given only for a sentence the templates understood END TO END. "If the workflow passed (run N),
 * we can merge", "Unclear whether …", "The workflow passed on a branch rebased on <sha>", "The dry
 * run passed", "The lint checks pass": each has words no template read, and those words change what
 * the sentence says. A question asks; a blockquote is someone else's words. Everything in such a
 * sentence is NOT_CHECKED, and the unread words are listed as their own claim.
 */
const CONTEXT_GATE: Record<Exclude<LineContext, 'statement'>, string> = {
  quote: "This line is quoted, so it is not taken as the author's own claim.",
  code: 'This line is code (a fenced or indented code block), so it is shown but not taken as a claim.',
  heading: 'This line is a heading, so it is shown but not taken as a claim.',
  todo: 'This is an unticked task-list item: a to-do, not a claim.',
};

function gateOf(s: SentenceHits, context: LineContext): string | null {
  if (context !== 'statement') return CONTEXT_GATE[context];
  if (s.question) return 'This sentence asks rather than states, so none of its parts is taken as a claim.';
  if (s.remainder) return 'This sentence says more than the templates read (see its unmapped part), so none of its parts is decided on its own.';
  return null;
}

/**
 * Map free claim text onto an observation. PURE: same text and observation, same entries, same order.
 *
 * Each sentence is judged on its own: its citations decide which run it is about (see
 * {@link Anchor}), and a sentence the templates did not read end to end decides nothing (see
 * {@link gateOf}). A green run is never evidence for a sentence about another commit, another
 * workflow, or nothing in particular.
 */
export function mapClaims(text: string, o: Observation): ClaimEntry[] {
  const { clauses, full, context, dropped } = splitClaims(text);
  const out: ClaimEntry[] = [];
  clauses.forEach((sentence, idx) => {
    const s = scanSentence(sentence, full[idx] as string, o);
    const ctx = (context[idx] ?? 'statement') as LineContext;
    const gate = gateOf(s, ctx);
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

    const entries: { at: number; order: number; e: ClaimEntry }[] = [];
    citations.forEach((e, i) => entries.push({ at: s.citationAt[i] as number, order: 0, e }));
    s.outcomes.forEach((h) => entries.push({ at: h.at, order: 1, e: outcomeEntry(h, s.sentence, o, anchor, s.qualifier) }));
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
        scope: 'No deterministic template matches this sentence.',
        reason: ctx !== 'statement' ? CONTEXT_GATE[ctx] : 'Not compared with anything, so it is neither supported nor contradicted.',
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
        scope: 'The part of this sentence no template matched.',
        reason:
          ctx !== 'statement'
            ? CONTEXT_GATE[ctx]
            : 'Not compared with anything, so it is neither supported nor contradicted. Because of it, no other part of this sentence is decided either.',
      });
    }
  });
  if (dropped > 0) {
    const note = `(${dropped} further sentences)`;
    out.push({
      claim: note,
      sentence: note,
      template: 'truncated',
      status: 'NOT_CHECKED',
      evidence_fields: [],
      scope: `Only the first ${MAX_CLAIMS} sentences are read.`,
      reason: `${dropped} sentences after the first ${MAX_CLAIMS} were not read at all.`,
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
  return {
    schema: ACTION_EVIDENCE_SCHEMA,
    observation,
    claims: mapClaims(claimText, observation),
    assurance: { cryptographic_integrity: 'NOT_CHECKED', observation: 'PLATFORM_REPORTED' },
    does_not_prove: RECORD_DOES_NOT_PROVE,
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
  opts: { env?: Record<string, string | undefined>; now?: () => Date } = {},
): Promise<{ record: ActionEvidenceRecord; digest: RecordDigest }> {
  const result = await runCheck(url, opts.env ?? process.env);
  const fetchedAt = (opts.now ?? (() => new Date()))().toISOString();
  const asked = urlAttempt(url);
  if (asked !== null && asked !== result.run.attempt) {
    throw new CheckError(
      `the URL names attempt ${asked}, but GitHub's run endpoint answered for attempt ${result.run.attempt ?? 'unknown'} (the latest). ` +
        'Reading a specific earlier attempt is not supported yet; nothing was recorded.',
    );
  }
  const record = buildRecord(observationFromCheck(result, fetchedAt), claimText);
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
