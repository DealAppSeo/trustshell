export type GroundStatus = 'VERIFIED' | 'VETO' | 'NOT_CHECKED';
export type GroundReason = 'exact_match' | 'quote_not_found' | 'page_mismatch' | 'quote_too_short' | 'value_not_in_quote' | 'ambiguous_value' | 'no_evidence' | 'template_echo';
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
    predicted: {
        value: string | number | null;
        source: 'model' | 'caller';
    };
    evidence: {
        quote: string | null;
        page: number | null;
        no_evidence: boolean;
    };
    check: GroundResult;
    /** Set only by a person who looked. Nothing in this module ever sets it. */
    observed: null;
    enforced_by: string;
    limitations: readonly string[];
    anchor_status: 'none';
    created_at: string;
}
/** Default floor, in non-space characters: "PAID" and "100 ft" pass, "x4" does not. */
export declare const DEFAULT_MIN_QUOTE_CHARS = 4;
/**
 * A quote that contains template text must add at least this many non-space characters of its
 * own, or it is only repeating the template.
 */
export declare const ECHO_MIN_ADDED_CHARS = 8;
/** What a receipt does NOT establish. Every receipt carries this. */
export declare const LIMITATIONS: readonly string[];
/** The matching form of a string: what the quote, the pages, units and echoes are compared in. */
export declare function normalizeForMatch(text: string): string;
/**
 * The template-echo rule. `q` and `echoes` are already normalized.
 *
 * A quote is an echo when (a) it is a substring of any echo string — it repeats part of the
 * template — or (b) after removing every echo string it contains, longest first, fewer than
 * {@link ECHO_MIN_ADDED_CHARS} non-space characters are left — it adds almost nothing of its own.
 * Empty echoes are ignored (an empty string is inside everything).
 */
export declare function isEcho(q: string, echoes: string[]): boolean;
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
export declare function groundQuote(claim: GroundClaim, pages: GroundPage[], opts?: GroundOptions): GroundResult;
/** Split extracted text into pages on form feed, the `pdftotext` convention. No `\f` -> page 1. */
export declare function splitPages(text: string): GroundPage[];
/**
 * Run {@link groundQuote} on each claim and return one receipt per claim. `observed` is null and
 * stays null: only a person who looked may set it, and nothing here does.
 */
export declare function groundClaims(claims: GroundClaim[], pages: GroundPage[], opts?: GroundOptions & {
    predictedBy?: 'model' | 'caller';
}): GroundReceipt[];
