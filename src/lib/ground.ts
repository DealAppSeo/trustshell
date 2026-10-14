/**
 * Ground a claim in its source — a deterministic, local quote check.
 * ------------------------------------------------------------------
 * HAL's other check asks disjoint model families over the network. That is
 * right for world facts and blind to document facts ("the manifest says 150 ft
 * of cable"), and two models can be confidently wrong together.
 *
 * A claim that cites its source can be checked with no model at all: is the
 * quoted text really on the cited page, and is the claimed value really in that
 * quote? This module answers exactly that, and nothing more. It is offline, it
 * has no fetch, and it cannot be talked out of its answer.
 *
 * Every step fails closed: anything this module cannot settle is NOT_CHECKED,
 * never VERIFIED. NOT_CHECKED is never a pass.
 */
import { resolvePackageVersion } from './version';

export type GroundStatus = 'VERIFIED' | 'VETO' | 'NOT_CHECKED';
export type GroundReason =
  | 'exact_match'
  | 'quote_not_found'
  | 'page_mismatch'
  | 'quote_too_short'
  | 'value_not_in_quote'
  | 'ambiguous_value'
  | 'no_evidence'
  | 'template_echo';

export interface GroundClaim {
  quote?: string | null;
  page?: number | null;
  value?: string | number | null;
  kind?: 'text' | 'number' | 'date';
  unit?: string;
  noEvidence?: boolean;
}

/** One page of source text. `n` is 1-indexed. */
export interface GroundPage {
  n: number;
  text: string;
}

export interface GroundOptions {
  /** Shortest quote, in non-space characters after normalizing. Default 4. */
  minQuoteChars?: number;
  /**
   * Text the document prints for every reader: a template, a form's own questions, boilerplate,
   * field labels. A quote that only repeats it is NOT_CHECKED `template_echo` — see {@link isEcho}.
   */
  echoes?: string[];
}

export interface GroundResult {
  status: GroundStatus;
  reason: GroundReason;
  /** The page the quote was found on (the cited page when it is there), else null. */
  found_on_page: number | null;
  /** [start, end) into the ORIGINAL text of `found_on_page`, never the normalized text. */
  char_span: [number, number] | null;
  /** Index of that page in the `pages` array passed in (page numbers can repeat), else null. */
  page_index: number | null;
}

export interface GroundReceipt {
  predicted: { value: string | number | null; source: 'model' | 'caller' };
  evidence: { quote: string | null; page: number | null; no_evidence: boolean };
  check: GroundResult;
  /** Set only by a person who looked. Nothing in this module ever sets it. */
  observed: null;
  enforced_by: string;
  limitations: readonly string[];
  anchor_status: 'none';
  created_at: string;
}

/** Default floor, in non-space characters: "PAID" and "100 ft" pass, "x4" does not. */
export const DEFAULT_MIN_QUOTE_CHARS = 4;

/**
 * A quote that contains template text must add at least this many non-space characters of its
 * own, or it is only repeating the template.
 */
export const ECHO_MIN_ADDED_CHARS = 8;

/** What a receipt does NOT establish. Every receipt carries this. */
export const LIMITATIONS: readonly string[] = Object.freeze([
  'VERIFIED means the quoted text is in the source you gave, on the page cited. It does not mean the quote supports the claim: "late fee waived" and "late fee" are different quotes, and a real quote can be about something else.',
  "A quote can be real, on the page, and still only repeat the document's own template; pass the template text as echoes.",
  'It checks the text it was given. It does not show that this text is the real document, the whole document, or a correct extraction from a PDF or a scan.',
  'A number or date check finds the value inside the quote. It needs one number in the quote (one written right before the unit, when a unit is given) and one date; it does not show the value means what the claim says it means. Letters glued to a number (1.5k, 150ft) are read only as the unit given, so a multiplier such as k is never read. Pass integers past 2^53 as strings.',
  'Dates are read only as ISO (2026-03-04), numeric day/month/year or month/day/year, "March 4, 2026" and "4 March 2026" (English month names). A date written another way is not read, and the value is reported value_not_in_quote. A two-digit year is never VERIFIED.',
  'Matching ignores case, spacing, quote and dash styles, Unicode compatibility forms such as ligatures, zero-width, soft-hyphen and bidi format characters, and a word hyphenated across a line break. Texts that differ only in those ways count as the same.',
  'No person has confirmed this (observed is null) and nothing was anchored anywhere (anchor_status is none).',
]);

// ---------------------------------------------------------------------------------------------
// Normalization, with an offset map back to the original text
// ---------------------------------------------------------------------------------------------

// Soft hyphen, zero-width space/joiners, word joiner, BOM, and the bidi / format marks (ALM, LRM,
// RLM, embeddings, overrides, isolates): invisible, so they may not pad a quote past a floor.
const ZERO_WIDTH = /[\u00AD\u061C\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g;
const DASHES = /[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g;
const SINGLE_QUOTES = /[\u2018-\u201B]/g;
const DOUBLE_QUOTES = /[\u201C-\u201F]/g;
const SPACE = /\s/;
const LINE_BREAK = /[\n\r\v\f\u0085\u2028\u2029]/;
const LETTER = /\p{L}/u;
const WORD = /[\p{L}\p{N}]/u;

interface Normalized {
  text: string;
  /** For each UTF-16 unit of `text`: where its source starts / ends in the original. */
  start: number[];
  end: number[];
}

/**
 * Normalize for matching, keeping an offset map. Quote and page go through this SAME function.
 *
 * Works per cluster (a code point plus its combining marks) so every output character knows
 * which original characters produced it. Per cluster: NFKC (ligatures, full-width forms), curly
 * quotes to straight, dash variants to `-`, zero-width, soft-hyphen and bidi format characters
 * removed, case folded. Then across clusters: a hyphen that is the last glyph before a line break, between two
 * letters, is joined (`consign-\nment` -> `consignment`; a mid-line `non-compliance` keeps its
 * hyphen), and every whitespace run becomes one space.
 *
 * ponytail: per-cluster NFKC does not compose Hangul conjoining jamo written as separate code
 * points; neither side is composed, so they still match each other, only not a precomposed form.
 */
function normalizeMapped(src: string): Normalized {
  const chars: string[] = [];
  const s: number[] = [];
  const e: number[] = [];
  for (const m of src.matchAll(/\P{M}\p{M}*|\p{M}+/gu)) {
    const a = m.index ?? 0;
    const b = a + m[0].length;
    const out = m[0]
      .normalize('NFKC')
      .replace(ZERO_WIDTH, '')
      .replace(SINGLE_QUOTES, "'")
      .replace(DOUBLE_QUOTES, '"')
      .replace(DASHES, '-')
      // Case folding, not just lower case: toLowerCase turns a dotted capital I into i plus a
      // combining dot, and keeps sharp s and final sigma apart from what a reader treats as equal.
      .replace(/İ/g, 'I')
      .toLowerCase()
      .replace(/ß/g, 'ss')
      .replace(/ς/g, 'σ');
    for (const ch of out) {
      chars.push(ch);
      s.push(a);
      e.push(b);
    }
  }

  let text = '';
  const start: number[] = [];
  const end: number[] = [];
  const push = (ch: string, a: number, b: number) => {
    text += ch;
    for (let k = 0; k < ch.length; k += 1) {
      start.push(a);
      end.push(b);
    }
  };

  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i] as string;
    if (ch === '-' && i > 0 && LETTER.test(chars[i - 1] as string)) {
      // Join only when this hyphen is the last glyph before a line break and a letter follows.
      let j = i + 1;
      while (j < chars.length && SPACE.test(chars[j] as string) && !LINE_BREAK.test(chars[j] as string)) j += 1;
      if (j < chars.length && LINE_BREAK.test(chars[j] as string)) {
        while (j < chars.length && SPACE.test(chars[j] as string)) j += 1;
        if (j < chars.length && LETTER.test(chars[j] as string)) {
          i = j - 1;
          continue;
        }
      }
    }
    if (SPACE.test(ch)) {
      let j = i;
      while (j + 1 < chars.length && SPACE.test(chars[j + 1] as string)) j += 1;
      push(' ', s[i] as number, e[j] as number);
      i = j;
      continue;
    }
    push(ch, s[i] as number, e[i] as number);
  }
  return { text, start, end };
}

/** The matching form of a string: what the quote, the pages, units and echoes are compared in. */
export function normalizeForMatch(text: string): string {
  return normalizeMapped(String(text ?? '')).text.trim();
}

const nonSpaceLength = (s: string) => [...s.replace(/\s/g, '')].length;

/** The code point ending at UTF-16 index `i` (exclusive), or '' at the start. */
function cpBefore(s: string, i: number): string {
  return [...s.slice(Math.max(0, i - 2), Math.max(0, i))].pop() ?? '';
}

/** The code point starting at UTF-16 index `i`, or '' at the end. */
function cpAt(s: string, i: number): string {
  const c = s.codePointAt(i);
  return c === undefined ? '' : String.fromCodePoint(c);
}

const DIGIT = /^\d$/;
const DECIMAL_MARK = /^[.,]$/;
const SIGN_GLUE = /[\p{L}\p{N}.]/u;

/**
 * Would a quote edge between `outside` (page side) and `inside` (quote side) cut one token in two?
 * `out2` / `in2` are the next code points further out / further in. A token is a word, or a number
 * as NUMBER reads it: `1,250.50` is one token. The boundary check and the number reader must agree
 * on what one token is, or a quote can keep `1,250` of `1,250.50` and still verify 1250 (XC1, #548).
 * Whole code points, not UTF-16 units: a letter outside the BMP is still a letter.
 */
function cutsToken(out2: string, outside: string, inside: string, in2: string): boolean {
  if (WORD.test(outside) && WORD.test(inside)) return true;
  if (DIGIT.test(inside) && DECIMAL_MARK.test(outside) && DIGIT.test(out2)) return true; // 1,|250
  if (DECIMAL_MARK.test(inside) && DIGIT.test(in2) && DIGIT.test(outside)) return true; // 1|,250
  return false;
}

/**
 * First occurrence of `q` in the page that starts and ends on whole tokens and whole source
 * characters. "30 days" is not found inside "130 days", "1,250" not inside "1,250.50", and "250"
 * not inside "-250": a quote that cuts a word or a number in two is not what the page says.
 * Returns the span in the ORIGINAL text.
 */
function findSpan(page: Normalized, q: string): [number, number] | null {
  const t = page.text;
  const q1 = cpAt(q, 0);
  const q2 = cpAt(q, q1.length);
  const l1 = cpBefore(q, q.length);
  const l2 = cpBefore(q, q.length - l1.length);
  for (let i = t.indexOf(q); i !== -1; i = t.indexOf(q, i + 1)) {
    const j = i + q.length;
    const wholeSource = (i === 0 || page.start[i] !== page.start[i - 1]) && (j === t.length || page.end[j] !== page.end[j - 1]);
    const o1 = cpBefore(t, i);
    const o2 = cpBefore(t, i - o1.length);
    const a1 = cpAt(t, j);
    const a2 = cpAt(t, j + a1.length);
    // A '-' right before the digits, not itself glued to a word, a number or a dot, is their sign.
    const cutsSign = DIGIT.test(q1) && o1 === '-' && !SIGN_GLUE.test(o2);
    if (wholeSource && !cutsSign && !cutsToken(o2, o1, q1, q2) && !cutsToken(a2, a1, l1, l2)) {
      return [page.start[i] as number, page.end[j - 1] as number];
    }
  }
  return null;
}

/**
 * The template-echo rule. `q` and `echoes` are already normalized.
 *
 * A quote is an echo when (a) it is a substring of any echo string — it repeats part of the
 * template — or (b) after removing every echo string it contains, longest first, fewer than
 * {@link ECHO_MIN_ADDED_CHARS} non-space characters are left — it adds almost nothing of its own.
 * Empty echoes are ignored (an empty string is inside everything).
 */
export function isEcho(q: string, echoes: string[]): boolean {
  let rest = q;
  let contained = false;
  for (const e of [...echoes].filter(Boolean).sort((a, b) => b.length - a.length)) {
    if (e.includes(q)) return true;
    if (rest.includes(e)) {
      rest = rest.split(e).join(' ');
      contained = true;
    }
  }
  return contained && nonSpaceLength(rest) < ECHO_MIN_ADDED_CHARS;
}

// ---------------------------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------------------------

/** A number not glued to a letter, digit or dot before it. `1,250.00` is 1250; `INV-2041` is 2041. */
const NUMBER = /(?<![\p{L}\p{N}.])-?\d+(?:,\d{3})*(?:\.\d+)?/gu;
const NUMBER_VALUE = /^-?\d+(?:,\d{3})*(?:\.\d+)?$/;
/** Letters (then letters or digits) written right after a number, with no space: `1.5k`, `150ft`. */
const GLUED = /^\p{L}[\p{L}\p{N}]*/u;

/**
 * A number as text: sign, integer digits without leading zeros, fraction without trailing zeros.
 * Numbers are compared as written, never as floats: 9007199254740993 and 9007199254740992 are the
 * same double and different numbers (XC1, #548).
 */
function canonicalNumber(raw: string): string {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(raw.replace(/,/g, '')) as RegExpExecArray;
  const int = (m[2] as string).replace(/^0+(?=\d)/, '');
  // Trailing zeros trimmed by a loop: an unanchored /0+$/ is quadratic on "000...01" (CodeQL).
  const fracDigits = m[3] ?? '';
  let k = fracDigits.length;
  while (k > 0 && fracDigits[k - 1] === '0') k -= 1;
  const frac = fracDigits.slice(0, k);
  const body = frac ? `${int}.${frac}` : int;
  return body === '0' ? '0' : `${m[1]}${body}`;
}

/** The claimed value as canonical number text, or null when it cannot be read exactly. */
function parseNumberValue(v: string | number | null | undefined): string | null {
  if (typeof v === 'number') {
    // An integer past 2^53 has already lost digits before it got here; 1e21 prints as an exponent.
    if (!Number.isFinite(v) || (Number.isInteger(v) && !Number.isSafeInteger(v))) return null;
    const text = String(v);
    return NUMBER_VALUE.test(text) ? canonicalNumber(text) : null;
  }
  if (typeof v !== 'string' || !NUMBER_VALUE.test(v.trim())) return null;
  return canonicalNumber(v.trim());
}

/**
 * The multi-number rule.
 *
 * - The value is not among the quote's numbers -> VETO value_not_in_quote.
 * - No unit: the quote must hold exactly one distinct number. Two ("loaded 50 ft, ordered 150
 *   ft") -> NOT_CHECKED ambiguous_value: the quote alone cannot say which one the claim means.
 * - With a unit: look only at the numbers written immediately before that unit (`150 ft`,
 *   `150ft`). Exactly one distinct such number, and it is the value -> VERIFIED. The value
 *   present but not before the unit, or two different numbers before the same unit
 *   ("50 ft ... 150 ft") -> NOT_CHECKED ambiguous_value. One unit somewhere in the quote is not
 *   enough, and neither is the value sitting before one of two units.
 * - Letters glued to the value's number that are not exactly the unit (`1.5k`, or `150ft` with no
 *   unit given) -> NOT_CHECKED ambiguous_value: that token is not the bare number.
 * - Numbers compare as written (canonical text), so integers past 2^53 cannot collide. An unsafe
 *   integer passed as a JS number -> NOT_CHECKED ambiguous_value.
 */
function checkNumber(q: string, value: GroundClaim['value'], unit: string | undefined): GroundReason | 'ok' {
  const v = parseNumberValue(value);
  if (v === null) return 'ambiguous_value';
  const found = [...q.matchAll(NUMBER)].map((m) => {
    const end = (m.index ?? 0) + m[0].length;
    return { n: canonicalNumber(m[0]), end, glued: GLUED.exec(q.slice(end))?.[0] ?? '' };
  });
  if (!found.some((f) => f.n === v)) return 'value_not_in_quote';
  const u = unit === undefined ? '' : normalizeForMatch(unit);
  if (found.some((f) => f.n === v && f.glued && f.glued !== u)) return 'ambiguous_value';
  if (!u) return new Set(found.map((f) => f.n)).size === 1 ? 'ok' : 'ambiguous_value';
  const unitWordEnd = WORD.test(cpBefore(u, u.length));
  const bound = found.filter((f) => {
    const after = q.slice(f.end).replace(/^ /, '');
    return after.startsWith(u) && !(unitWordEnd && WORD.test(cpAt(after, u.length)));
  });
  const boundValues = new Set(bound.map((f) => f.n));
  return boundValues.size === 1 && boundValues.has(v) ? 'ok' : 'ambiguous_value';
}

const MONTH = '(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)(?![a-z])\\.?';
const ISO_DATE = /(?<!\d)(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/g;
const NUMERIC_DATE = /(?<!\d)(\d{1,2})([-/.])(\d{1,2})\2(\d{4}|\d{2})(?!\d)/g;
const MONTH_DAY_YEAR = new RegExp(`(?<![a-z])${MONTH} ?(\\d{1,2})(?:st|nd|rd|th)?,? ?(\\d{4})(?!\\d)`, 'g');
const DAY_MONTH_YEAR = new RegExp(`(?<!\\d)(\\d{1,2})(?:st|nd|rd|th)? (?:of )?${MONTH},? ?(\\d{4})(?!\\d)`, 'g');

function iso(y: number, m: number, d: number): string | null {
  const t = new Date(Date.UTC(2000, m - 1, d));
  t.setUTCFullYear(y);
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const monthIndex = (name: string) => ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(name.slice(0, 3)) + 1;

/**
 * Every calendar date the quote could be read as (one written date can give several readings), and
 * whether any numeric date in it has a two-digit year.
 */
function dateReadings(q: string): { readings: Set<string>; twoDigitYear: boolean } {
  const out = new Set<string>();
  let twoDigitYear = false;
  const add = (y: number, m: number, d: number) => {
    const r = iso(y, m, d);
    if (r) out.add(r);
  };
  for (const m of q.matchAll(ISO_DATE)) add(+m[1]!, +m[2]!, +m[3]!);
  for (const m of q.matchAll(NUMERIC_DATE)) {
    const a = +m[1]!;
    const b = +m[3]!;
    const yy = m[4]!;
    // A two-digit year has two centuries. Keeping both readings is not enough on its own: iso()
    // drops one that is not a real day (29/02/00 is a date only in 2000), so the flag decides.
    if (yy.length === 2) twoDigitYear = true;
    const years = yy.length === 4 ? [+yy] : [1900 + +yy, 2000 + +yy];
    for (const y of years) {
      add(y, a, b); // month/day/year
      add(y, b, a); // day/month/year
    }
  }
  for (const m of q.matchAll(MONTH_DAY_YEAR)) add(+m[3]!, monthIndex(m[1]!), +m[2]!);
  for (const m of q.matchAll(DAY_MONTH_YEAR)) add(+m[3]!, monthIndex(m[2]!), +m[1]!);
  return { readings: out, twoDigitYear };
}

/**
 * The date rule: the quote must hold exactly one possible date, and it must be the value.
 * `03/04/1970` reads as March 4 or April 3 -> ambiguous unless both readings are the value
 * (`04/04/1970`); `25/04/1970` has one reading. Two different dates in one quote are ambiguous
 * the same way two numbers are. A quote with a two-digit year is never VERIFIED. No reading equals
 * the value -> VETO value_not_in_quote, which includes a date written in a form this does not read.
 */
function checkDate(q: string, value: GroundClaim['value']): GroundReason | 'ok' {
  const v = typeof value === 'string' ? value.trim() : '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m || iso(+m[1]!, +m[2]!, +m[3]!) !== v) return 'ambiguous_value';
  const { readings, twoDigitYear } = dateReadings(q);
  if (!readings.has(v)) return 'value_not_in_quote';
  return readings.size === 1 && !twoDigitYear ? 'ok' : 'ambiguous_value';
}

// ---------------------------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------------------------

type Hit = { n: number; span: [number, number]; index: number };

const result = (status: GroundStatus, reason: GroundReason, hit: Hit | null = null): GroundResult => ({
  status,
  reason,
  found_on_page: hit ? hit.n : null,
  char_span: hit ? hit.span : null,
  page_index: hit ? hit.index : null,
});

/**
 * Is the quote on the cited page, and (kind number|date) is the value in the quote?
 *
 * Order, failing closed at every step:
 *  1. `noEvidence`, or a quote that is empty after normalizing        -> NOT_CHECKED no_evidence
 *  2. fewer than `minQuoteChars` (default 4) non-space characters     -> VETO quote_too_short
 *  3. a source with no text on any page (e.g. a scan with no text layer) -> NOT_CHECKED no_evidence
 *  4. on the cited page, on whole words and whole numbers -> go on. Only on other pages -> VETO
 *     page_mismatch (found_on_page set).
 *     Nowhere -> VETO quote_not_found. No page cited -> the first page that has it.
 *     A cited page that is missing, zero, negative or fractional is never the page it is on.
 *  5. the quote only repeats `echoes` (template text)                 -> NOT_CHECKED template_echo
 *  6. kind number / date: see checkNumber / checkDate. An unknown kind, a value with no kind, or
 *     a value that cannot be read as a number / ISO date             -> NOT_CHECKED ambiguous_value
 *  7. otherwise                                                       -> VERIFIED exact_match
 *
 * kind 'text' (the default) checks the quote only. It does not check meaning: see LIMITATIONS.
 */
export function groundQuote(claim: GroundClaim, pages: GroundPage[], opts: GroundOptions = {}): GroundResult {
  const c: GroundClaim = claim ?? {};
  const q = typeof c.quote === 'string' ? normalizeForMatch(c.quote) : '';
  if (c.noEvidence === true || !q) return result('NOT_CHECKED', 'no_evidence');

  const min = typeof opts.minQuoteChars === 'number' && Number.isFinite(opts.minQuoteChars) ? Math.max(1, opts.minQuoteChars) : DEFAULT_MIN_QUOTE_CHARS;
  if (nonSpaceLength(q) < min) return result('VETO', 'quote_too_short');

  const usable = (Array.isArray(pages) ? pages : [])
    .map((p, index) => ({ p, index }))
    .filter(({ p }) => p && typeof p.text === 'string' && Number.isInteger(p.n) && p.n >= 1)
    .map(({ p, index }) => ({ n: p.n, index, norm: normalizeMapped(p.text) }));
  if (!usable.some((p) => p.norm.text.trim())) return result('NOT_CHECKED', 'no_evidence');

  const cited = c.page;
  const hasCite = cited !== null && cited !== undefined;
  let hit: Hit | null = null;
  let elsewhere: Hit | null = null;
  for (const p of usable) {
    const span = findSpan(p.norm, q);
    if (!span) continue;
    if (!hasCite || p.n === cited) {
      hit = { n: p.n, span, index: p.index };
      break;
    }
    elsewhere ??= { n: p.n, span, index: p.index };
  }
  if (!hit) return elsewhere ? result('VETO', 'page_mismatch', elsewhere) : result('VETO', 'quote_not_found');
  const found = hit;
  const at = (status: GroundStatus, reason: GroundReason) => result(status, reason, found);

  if (Array.isArray(opts.echoes) && isEcho(q, opts.echoes.map((e) => normalizeForMatch(String(e ?? ''))))) {
    return at('NOT_CHECKED', 'template_echo');
  }

  // A value with no kind to read it as would be skipped, and the receipt would show it next to
  // VERIFIED. So no kind + a value is NOT_CHECKED; an explicit kind 'text' still checks the quote only.
  const kind = c.kind ?? (c.value === null || c.value === undefined ? 'text' : null);
  if (kind !== 'text') {
    const verdict =
      kind === 'number' ? checkNumber(q, c.value, c.unit) : kind === 'date' ? checkDate(q, c.value) : 'ambiguous_value';
    if (verdict === 'value_not_in_quote') return at('VETO', verdict);
    if (verdict !== 'ok') return at('NOT_CHECKED', verdict);
  }
  return at('VERIFIED', 'exact_match');
}

/** Split extracted text into pages on form feed, the `pdftotext` convention. No `\f` -> page 1. */
export function splitPages(text: string): GroundPage[] {
  return String(text ?? '').split('\f').map((t, i) => ({ n: i + 1, text: t }));
}

let version: string | undefined;

/**
 * Run {@link groundQuote} on each claim and return one receipt per claim. `observed` is null and
 * stays null: only a person who looked may set it, and nothing here does.
 */
export function groundClaims(
  claims: GroundClaim[],
  pages: GroundPage[],
  opts: GroundOptions & { predictedBy?: 'model' | 'caller' } = {},
): GroundReceipt[] {
  // Read lazily, so importing this module touches no file.
  version ??= resolvePackageVersion(__dirname);
  const created_at = new Date().toISOString();
  return (Array.isArray(claims) ? claims : []).map((claim) => {
    const c: GroundClaim = claim ?? {};
    const check = groundQuote(c, pages, opts);
    return {
      predicted: { value: c.value ?? null, source: opts.predictedBy === 'caller' ? 'caller' : 'model' },
      evidence: {
        quote: typeof c.quote === 'string' ? c.quote : null,
        page: c.page ?? null,
        no_evidence: c.noEvidence === true || !(typeof c.quote === 'string' && normalizeForMatch(c.quote)),
      },
      check,
      observed: null,
      enforced_by: `trustshell/ground@${version}`,
      limitations: LIMITATIONS,
      anchor_status: 'none',
      created_at,
    };
  });
}
