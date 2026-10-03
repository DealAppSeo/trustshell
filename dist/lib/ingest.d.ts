/**
 * ingest — consume-side injection quarantine. NOT `verifyOutput`.
 *
 * `verifyOutput` (HAL) asks "is this claim true?" about text the agent is about to EMIT.
 * `ingest` asks "is this fetched content safe to ACT ON?" about untrusted text the agent is about to
 * CONSUME (a web page, a doc, a message, a tool result). Different direction, different threat:
 * verifyOutput guards truth on the way out; ingest guards against prompt-injection / instruction-
 * smuggling on the way in. Spec: docs/living/INGEST.md (CC1, 2026-09-12).
 *
 * The boundary (why PAI1 never sees raw fetched content): PAI2 (a specialist) fetches, runs `ingest()`,
 * and quarantines the raw bytes. Only the structured verdict object crosses to PAI1 (chief of staff) —
 * never the raw source — so PAI1 cannot be steered by instructions hidden in the source.
 *
 * `flag` defaults OFF: the gate is binary `clean` | `veto`, and uncertainty resolves FAIL-CLOSED to
 * `veto` (never silently to `clean`). Turning `flag` on opts into a human-review middle tier. In no
 * case does a `veto` or `flag` proposedAction say "proceed" — `clean` is the ONLY verdict that does.
 *
 * This module is intentionally standalone: not exported from the SDK entry, not called from /create,
 * no Pinchtab, no logged-in Chrome. It is the contract an implementer wires behind the PAI2→PAI1 boundary.
 */
export type IngestVerdict = 'clean' | 'veto' | 'flag';
export interface IngestResult {
    ingest: IngestVerdict;
    /**
     * Sanitized summary that crosses to PAI1. Quotes DATA but strips/neutralizes anything imperative
     * aimed at the reader. On `veto` it describes the REASON — it never reproduces the payload as a
     * live instruction.
     */
    excerpt: string;
    /** PAI2's suggestion; PAI1 is the decider. A `veto`/`flag` proposedAction is never "proceed". */
    proposedAction: string;
}
export interface IngestOptions {
    /** Opt into the borderline middle tier. OFF by default → borderline resolves fail-closed to `veto`. */
    flag?: boolean;
    /** Max excerpt length (chars). Default 160. */
    excerptChars?: number;
}
/**
 * Screen untrusted fetched content before an agent acts on it.
 * - Strong injection marker (raw, de-obfuscated, or decoded payload) → `veto` (excerpt = reason).
 * - Borderline imperative → `flag` if `flag` enabled, else fail-closed to `veto`.
 * - Otherwise → `clean` (excerpt = sanitized data summary).
 */
export declare function ingest(content: string, opts?: IngestOptions): IngestResult;
