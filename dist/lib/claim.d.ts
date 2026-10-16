export declare const CLAIM_LABELS: readonly ["pass", "veto", "not-checked"];
export type ClaimLabel = (typeof CLAIM_LABELS)[number];
/** The SDK's default backend origin (`TrustShell` constructor). Kept identical on purpose. */
export declare const DEFAULT_API_URL = "https://repid-engine-production.up.railway.app";
export declare const CLASSIFY_PATH = "/api/v1/classify";
/** Why a check was not sent under OFFLINE=1. The CLI's `verify` and `check <url>` print the same words. */
export declare const OFFLINE_REASON = "OFFLINE=1 is set, so nothing was sent";
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
     * Only with by === 'votes': the two voters whose answers made the label (repid-engine, added with
     * its checker pool on 2026-10-05). When a checker gives no answer and another stands in, `voters`
     * names both and this names the one that answered, so "X and Y both said false" stays true.
     */
    deciders?: string[];
    /**
     * One clarifying question, present ONLY when the endpoint asked one (repid-engine
     * CLASSIFY_QUESTIONS): a not-checked from the votes, where both voters were unsure and one fact
     * would let them decide. It comes from the API or it does not appear; nothing here invents one.
     */
    question?: string;
    /**
     * Only with `deciders`: what each of the two said, in the same order (repid-engine `votes`, added
     * 2026-10-06). Before this, a disagreement read "No agreed answer" and never said who said what.
     * An endpoint that does not send it gets none; nothing here works it out from the label.
     */
    votes?: ClaimVote[];
}
/** One decider's own word, as the endpoint sent it. `family` is the model family, e.g. "qwen". */
export interface ClaimVote {
    voter: string;
    family: string;
    verdict: ClaimVerdict;
}
export declare const CLAIM_VERDICTS: readonly ["TRUE", "FALSE", "UNSURE", "NONE"];
export type ClaimVerdict = (typeof CLAIM_VERDICTS)[number];
/** The question, or undefined when absent, malformed, or attached to anything but a votes not-checked. PURE. */
export declare function questionOf(body: unknown, label: ClaimLabel, by: ClaimPath | undefined): string | undefined;
/** The longest answer a person may give to the one question. */
export declare const ANSWER_MAX_CHARS = 200;
/**
 * The sentence to check again once the person answers: the claim, then their answer as the
 * assumption the checkers lacked. PURE. Throws ClaimError on an empty answer: nothing is sent.
 */
export declare function withAnswer(claim: string, answer: string): string;
/**
 * What the endpoint says produced a label (repid-engine src/routes/classify.ts ClassifyPath).
 * 'arithmetic-approx' (engine 2026-10-12, E-2): the whole text was one equation the engine's exact
 * BigInt-rational evaluator could not hold (a fractional power, a result too large), so both sides
 * were evaluated as doubles and called equal within 1e-9 relative (floor 1e-9). It always decides,
 * pass or veto, and is never an exact calculation. Until this was listed here, its real answer was
 * stamped not-checked. Any other `by` is still out of contract: not-checked, never a pass.
 */
export declare const CLAIM_PATHS: readonly ["arithmetic", "arithmetic-approx", "votes", "skipped", "deadline"];
export type ClaimPath = (typeof CLAIM_PATHS)[number];
/**
 * The path fields of an endpoint answer, or {} when they are missing or out of contract. PURE.
 * All or nothing: a `votes` without a usable voter list, or a `skipped` / `deadline` that claims a
 * pass or veto, reports no path at all rather than half of one.
 */
export declare function pathOf(body: unknown, label: ClaimLabel): {
    by?: ClaimPath;
    voters?: string[];
    deciders?: string[];
};
/** The people-facing names of these voters, joined: "Groq and Cerebras". PURE. */
export declare function voterNames(voters: string[]): string;
/**
 * One line saying what produced the label, or '' when the endpoint did not say. PURE.
 * The same words as extension/classify.js pathLine (tests/claim-path-parity.test.ts).
 */
export declare function pathLine(r: Pick<ClaimResult, 'label' | 'by' | 'voters' | 'deciders'>): string;
/**
 * Each decider's own word, or undefined. PURE. All or nothing, like pathOf: exactly two, one per
 * decider and in the same order, each with a family id and a known verdict, and agreeing with the
 * label: a pass is TRUE and TRUE, a veto is FALSE and FALSE, and a not-checked is anything else.
 * Two of one model family can never pass or veto (repid-engine S47, 2026-10-06: two families or Not
 * checked), so their agreement fits only a not-checked.
 * Votes that contradict the label are the answer saying two things, so neither is shown and the
 * label keeps its old line. The label itself is never changed here.
 */
export declare function votesOf(body: unknown, label: ClaimLabel, deciders: string[] | undefined): ClaimVote[] | undefined;
/**
 * Who said what: "Groq said false. Cerebras said false." PURE. '' when there are no votes, so a
 * caller falls back to {@link pathLine}. When one host ran both checkers, the model family tells
 * them apart. A flat true against a flat false is said out loud, because that is the one case where
 * the two answers cannot both stand. Two of one family that agree are said out loud too: that is one
 * opinion said twice, which is why the stamp is Not checked.
 */
export declare function votesLine(votes: readonly ClaimVote[] | undefined): string;
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
/**
 * Resolve the full classify URL. Throws {@link ClaimError} for a base src/lib/api-url.ts refuses
 * (SEC F10: https only, plain http only for localhost), before anything is sent.
 */
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
