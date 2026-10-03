/**
 * Honest return contract — pure derivations (LOOP T4, board #63).
 *
 * A return type that carries its own evidence cannot lie, and then the docs cannot drift from it.
 * These are pure functions over the RAW backend responses; the SDK methods wire them into the typed
 * returns. Every value comes from a real source. When a value is not available in the response, the
 * function returns `null` AND records a reason in `reasons` — it NEVER omits the field and NEVER
 * fills a plausible default. See docs/HONEST_RETURN_CONTRACT.md.
 */
/** How a `verifyOutput` verdict is grounded. */
export type Grounding = 'none' | 'hal' | 'payment';
/**
 * Grounding for a HAL verdict: `hal` only when a real quorum actually spoke (≥1 provider of
 * evidence). No evidence → `none` ("could not check"), never silently treated as grounded.
 * (`payment` is the x402-conditioned lane; verifyOutput never returns it.)
 */
export declare function verifyOutputGrounding(evidenceCount: number): Grounding;
/**
 * The REAL provider quorum behind a verdict — the number of non-errored provider verdicts the
 * response actually carried. This is a MEASURED count from `evidence`/`provider_responses`, never a
 * constant. (Live 2026-09-14 this was 2 — groq + cerebras — not the "6" that copy had claimed.)
 */
export declare function countProviders(raw: {
    evidence?: unknown;
    provider_responses?: unknown;
    signals?: {
        providers_used?: unknown;
    } | null;
}): number;
export interface RepIDHonesty {
    /** true = a real on-chain mint; false = keyless/never-minted; null = the endpoint didn't say (see reasons). */
    minted: boolean | null;
    /** The publishing signer address, when the endpoint exposes it; else null (see reasons). */
    signer: string | null;
    /** Which scoring lane produced the number, from a real response field; else null (see reasons). */
    scoreLane: string | null;
    /** For every field returned null: why. Never empty when a field is null. */
    reasons: Record<string, string>;
}
/**
 * Derive mint/signer/lane honesty from a raw `GET /api/v1/repid/:id` body. That endpoint today
 * returns only { agent_id, last_updated, repid_score, source, tier } — so `minted` and `signer` are
 * null-with-reason (the endpoint does not expose them), and `scoreLane` comes from the real `source`
 * field. This is the point: 43% of agents are keyless-never-minted (board #63 item 4) and this call
 * cannot tell you which — so it says so, rather than defaulting to `minted: true`.
 */
export declare function repidHonesty(raw: {
    erc8004_address?: unknown;
    erc8004_token_id?: unknown;
    minted?: unknown;
    signer?: unknown;
    score_lane?: unknown;
    source?: unknown;
}): RepIDHonesty;
export interface ProofHonesty {
    /** The engine's publishing signer, when the proof payload carries it; else null (see reasons). */
    signer: string | null;
    /** A fixed, honest label: a presented proof is an engine-signed postcard, not an aggregate of registry rows. */
    note: 'not a registry aggregate';
    reasons: Record<string, string>;
}
/** Derive signer honesty from a raw `GET /api/v1/repid/:id/proof` body. */
export declare function proofHonesty(raw: {
    signer?: unknown;
    signer_address?: unknown;
    eas?: {
        attester?: unknown;
    } | null;
}): ProofHonesty;
