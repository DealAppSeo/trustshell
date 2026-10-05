export declare const CLAIM_LABELS: readonly ["pass", "veto", "not-checked"];
export type ClaimLabel = (typeof CLAIM_LABELS)[number];
/** The SDK's default backend origin (`TrustShell` constructor). Kept identical on purpose. */
export declare const DEFAULT_API_URL = "https://repid-engine-production.up.railway.app";
export declare const CLASSIFY_PATH = "/api/v1/classify";
/** Stop waiting after this. A later answer is not-checked, never a pass. */
export declare const CLAIM_TIMEOUT_MS = 6000;
export interface ClaimResult {
    label: ClaimLabel;
    latency_ms: number;
    /**
     * Present ONLY when the label was decided locally (the endpoint gave no usable
     * answer) — says why it is not-checked. Absent when the label is the endpoint's own.
     */
    reason?: string;
    /**
     * Present ONLY when the scrubber removed something (a key, an email, a card number…) before
     * sending. The label is then about the text that was sent, not every character that was typed,
     * and the person should be told so.
     */
    scrubbed?: true;
    /**
     * Which path the endpoint says produced the label (repid-engine POST /api/v1/classify, added
     * 2026-10-05). Present only when the endpoint sent a well-formed one; an older endpoint sends
     * none and nothing is invented. Never present on a not-checked this client decided itself.
     */
    by?: ClaimPath;
    /** Only with by === 'votes': the voters the claim was sent to, as the endpoint named them. */
    voters?: string[];
    /**
     * One clarifying question, present ONLY when the endpoint asked one (repid-engine
     * CLASSIFY_QUESTIONS): a not-checked from the votes, where both voters were unsure and one fact
     * would let them decide. It comes from the API or it does not appear; nothing here invents one.
     */
    question?: string;
}
/** The question, or undefined when absent, malformed, or attached to anything but a votes not-checked. PURE. */
export declare function questionOf(body: unknown, label: ClaimLabel, by: ClaimPath | undefined): string | undefined;
/** The longest answer a person may give to the one question. */
export declare const ANSWER_MAX_CHARS = 200;
/**
 * The sentence to check again once the person answers: the claim, then their answer as the
 * assumption the checkers lacked. PURE. Throws ClaimError on an empty answer: nothing is sent.
 */
export declare function withAnswer(claim: string, answer: string): string;
export declare const CLAIM_PATHS: readonly ["arithmetic", "votes", "skipped", "deadline"];
export type ClaimPath = (typeof CLAIM_PATHS)[number];
/**
 * The path fields of an endpoint answer, or {} when they are missing or out of contract. PURE.
 * All or nothing: a `votes` without a usable voter list, or a `skipped` / `deadline` that claims a
 * pass or veto, reports no path at all rather than half of one.
 */
export declare function pathOf(body: unknown, label: ClaimLabel): {
    by?: ClaimPath;
    voters?: string[];
};
/**
 * One line saying what produced the label, or '' when the endpoint did not say. PURE.
 * The same words as extension/classify.js pathLine (tests/claim-path-parity.test.ts).
 */
export declare function pathLine(r: Pick<ClaimResult, 'label' | 'by' | 'voters'>): string;
/** Shown wherever {@link ClaimResult.scrubbed} is set. One sentence, the same on every door. */
export declare const SCRUBBED_LINE = "Removed before sending: text that looked like a key or personal data. The result is about what was sent.";
/** A local fault: the request could not be formed, so nothing was sent. CLI exit 3. */
export declare class ClaimError extends Error {
    constructor(message: string);
}
export interface ClaimOptions {
    /** Backend origin. Defaults to TRUSTSHELL_API_URL, then {@link DEFAULT_API_URL}. */
    apiUrl?: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    now?: () => number;
    env?: Record<string, string | undefined>;
}
/** Resolve the full classify URL. PURE. Throws {@link ClaimError} on a non-http(s) base. */
export declare function resolveClassifyUrl(apiUrl?: string, env?: Record<string, string | undefined>): string;
/** Only the endpoint's own label decides. Anything outside the contract is not-checked. PURE. */
export declare function labelOf(body: unknown): ClaimLabel | null;
/**
 * Ask the classify endpoint for one sentence's label. Never resolves to `pass`
 * unless the endpoint itself said `pass`. Throws only {@link ClaimError}, and only
 * before anything is sent (blank sentence, bad base URL).
 */
export declare function classifyClaim(text: string, opts?: ClaimOptions): Promise<ClaimResult>;
/** Exit code for a label. PURE. NOT_CHECKED never shares a code with success. */
export declare const CLAIM_EXIT: {
    readonly pass: 0;
    readonly veto: 1;
    readonly 'not-checked': 2;
    readonly error: 3;
};
export declare function claimExitCode(label: ClaimLabel): number;
/** One-line human explanation printed under the label. PURE. */
export declare function explainClaim(r: ClaimResult): string;
/**
 * Is a `check` operand a URL (the GitHub run check) rather than a sentence? PURE.
 * Deliberately broad: anything with a scheme, or a bare github.com/www. prefix, goes to
 * the GitHub path — so a mistyped run URL gets the old usage error instead of being
 * sent to the classifier as a "sentence".
 */
export declare function isUrlOperand(operand: string): boolean;
