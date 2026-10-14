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
  'A number or date check finds the value inside the quote. It needs one number in the quote (one written right before the unit, when a unit is given) and one date; it does not show the value means what the claim says it means.',
  'Dates are read only as ISO (2026-03-04), numeric day/month/year or month/day/year, "March 4, 2026" and "4 March 2026" (English month names). A date written another way is not read, and the value is reported value_not_in_quote. A two-digit year is never VERIFIED.',
  'Matching ignores case, spacing, quote and dash styles, Unicode compatibility forms such as ligatures, zero-width and soft-hyphen characters, and a word hyphenated across a line break. Texts that differ only in those ways count as the same.',
  'No person has confirmed this (observed is null) and nothing was anchored anywhere (anchor_status is none).',
]);

// ---------------------------------------------------------------------------------------------
// Normalization, with an offset map back to the original text
// ---------------------------------------------------------------------------------------------

const ZERO_WIDTH = /[\u00AD\u200B-\u200D\u2060\uFEFF]/g; // soft hyphen, zero-width space/joiners, BOM
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
 * quotes to straight, dash variants to `-`, zero-width and soft-hyphen characters removed, lower
 * case. Then across clusters: a hyphen that is the last glyph before a line break, between two
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
      .toLowerCase();
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

/**
 * First occurrence of `q` in the page that starts and ends on whole words and whole source
 * characters. "30 days" is not found inside "130 days": a quote that cuts a word in half is not
 * what the page says. Returns the span in the ORIGINAL text.
 */
function findSpan(page: Normalized, q: string): [number, number] | null {
  const t = page.text;
  for (let i = t.indexOf(q); i !== -1; i = t.indexOf(q, i + 1)) {
    const j = i + q.length;
    const wholeSource = (i === 0 || page.start[i] !== page.start[i - 1]) && (j === t.length || page.end[j] !== page.end[j - 1]);
    const cutsWordBefore = i > 0 && WORD.test(t[i - 1] as string) && WORD.test(q[0] as string);
    const cutsWordAfter = j < t.length && WORD.test(t[j] as string) && WORD.test(q[q.length - 1] as string);
    if (wholeSource && !cutsWordBefore && !cutsWordAfter) return [page.start[i] as number, page.end[j - 1] as number];
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

function parseNumberValue(v: string | number | null | undefined): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string' || !NUMBER_VALUE.test(v.trim())) return null;
  return Number(v.trim().replace(/,/g, ''));
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
 */
function checkNumber(q: string, value: GroundClaim['value'], unit: string | undefined): GroundReason | 'ok' {
  const v = parseNumberValue(value);
  if (v === null) return 'ambiguous_value';
  const found = [...q.matchAll(NUMBER)].map((m) => ({
    n: Number(m[0].replace(/,/g, '')),
    end: (m.index ?? 0) + m[0].length,
  }));
  if (!found.some((f) => f.n === v)) return 'value_not_in_quote';
  const u = unit === undefined ? '' : normalizeForMatch(unit);
  if (!u) return new Set(found.map((f) => f.n)).size === 1 ? 'ok' : 'ambiguous_value';
  const unitWordEnd = WORD.test(u[u.length - 1] as string);
  const bound = found.filter((f) => {
    const after = q.slice(f.end).replace(/^ /, '');
    return after.startsWith(u) && !(unitWordEnd && WORD.test(after.charAt(u.length)));
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

/** Every calendar date the quote could be read as. One written date can give several readings. */
function dateReadings(q: string): Set<string> {
  const out = new Set<string>();
  const add = (y: number, m: number, d: number) => {
    const r = iso(y, m, d);
    if (r) out.add(r);
  };
  for (const m of q.matchAll(ISO_DATE)) add(+m[1]!, +m[2]!, +m[3]!);
  for (const m of q.matchAll(NUMERIC_DATE)) {
    const a = +m[1]!;
    const b = +m[3]!;
    const yy = m[4]!;
    // A two-digit year has two centuries; both readings are kept, so it can never be VERIFIED.
    const years = yy.length === 4 ? [+yy] : [1900 + +yy, 2000 + +yy];
    for (const y of years) {
      add(y, a, b); // month/day/year
      add(y, b, a); // day/month/year
    }
  }
  for (const m of q.matchAll(MONTH_DAY_YEAR)) add(+m[3]!, monthIndex(m[1]!), +m[2]!);
  for (const m of q.matchAll(DAY_MONTH_YEAR)) add(+m[3]!, monthIndex(m[2]!), +m[1]!);
  return out;
}

/**
 * The date rule: the quote must hold exactly one possible date, and it must be the value.
 * `03/04/1970` reads as March 4 or April 3 -> ambiguous unless both readings are the value
 * (`04/04/1970`); `25/04/1970` has one reading. Two different dates in one quote are ambiguous
 * the same way two numbers are. No reading equals the value -> VETO value_not_in_quote, which
 * includes a date written in a form this does not read.
 */
function checkDate(q: string, value: GroundClaim['value']): GroundReason | 'ok' {
  const v = typeof value === 'string' ? value.trim() : '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m || iso(+m[1]!, +m[2]!, +m[3]!) !== v) return 'ambiguous_value';
  const readings = dateReadings(q);
  if (!readings.has(v)) return 'value_not_in_quote';
  return readings.size === 1 ? 'ok' : 'ambiguous_value';
}

// ---------------------------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------------------------

const result = (
  status: GroundStatus,
  reason: GroundReason,
  found_on_page: number | null = null,
  char_span: [number, number] | null = null,
): GroundResult => ({ status, reason, found_on_page, char_span });

/**
 * Is the quote on the cited page, and (kind number|date) is the value in the quote?
 *
 * Order, failing closed at every step:
 *  1. `noEvidence`, or a quote that is empty after normalizing        -> NOT_CHECKED no_evidence
 *  2. fewer than `minQuoteChars` (default 4) non-space characters     -> VETO quote_too_short
 *  3. a source with no text on any page (e.g. a scan with no text layer) -> NOT_CHECKED no_evidence
 *  4. on the cited page -> go on. Only on other pages -> VETO page_mismatch (found_on_page set).
 *     Nowhere -> VETO quote_not_found. No page cited -> the first page that has it.
 *     A cited page that is missing, zero, negative or fractional is never the page it is on.
 *  5. the quote only repeats `echoes` (template text)                 -> NOT_CHECKED template_echo
 *  6. kind number / date: see checkNumber / checkDate. An unknown kind, or a value that cannot
 *     be read as a number / ISO date                                  -> NOT_CHECKED ambiguous_value
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
    .filter((p) => p && typeof p.text === 'string' && Number.isInteger(p.n) && p.n >= 1)
    .map((p) => ({ n: p.n, norm: normalizeMapped(p.text) }));
  if (!usable.some((p) => p.norm.text.trim())) return result('NOT_CHECKED', 'no_evidence');

  const cited = c.page;
  const hasCite = cited !== null && cited !== undefined;
  let hit: { n: number; span: [number, number] } | null = null;
  let elsewhere: { n: number; span: [number, number] } | null = null;
  for (const p of usable) {
    const span = findSpan(p.norm, q);
    if (!span) continue;
    if (!hasCite || p.n === cited) {
      hit = { n: p.n, span };
      break;
    }
    elsewhere ??= { n: p.n, span };
  }
  if (!hit) {
    return elsewhere
      ? result('VETO', 'page_mismatch', elsewhere.n, elsewhere.span)
      : result('VETO', 'quote_not_found');
  }
  const found = hit;
  const at = (status: GroundStatus, reason: GroundReason) => result(status, reason, found.n, found.span);

  if (Array.isArray(opts.echoes) && isEcho(q, opts.echoes.map((e) => normalizeForMatch(String(e ?? ''))))) {
    return at('NOT_CHECKED', 'template_echo');
  }

  const kind = c.kind ?? 'text';
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
