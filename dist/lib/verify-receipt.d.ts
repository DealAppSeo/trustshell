/**
 * verify-receipt — recompute a kernel receipt's trust verdict OFFLINE, from the receipt alone.
 *
 * This is the TrustLattice verifier: the step that lets a STRANGER reproduce what the engine
 * produced, with no network, no engine, no account. It reuses the SDK's existing primitives
 * (kernelReceiptHash, kernelReceiptAuthenticity, kernelTrustedSigners) and composes them into one
 * reconciled six-claim verdict. It imports nothing from next/react/supabase and makes no request.
 *
 * WHAT IS RE-DERIVED vs WHAT IS READ. Only two things can be established offline by cryptography,
 * and this verifier does BOTH itself rather than trusting the receipt's own word for them:
 *   - the keccak256 receipt_hash, recomputed over the canonical receipt (RFC-8785-style ordering);
 *   - the Ed25519 signature, verified against the CALLER's pinned trusted roots — never the header's
 *     own signer (a receipt that vouches for itself proves nothing).
 * Both land under the `integrity` claim (its own gaps in the engine envelope name exactly these two
 * as "not checked here"). Everything else — authenticity (owner-authorized), observation,
 * correctness, authorization, containment — is the ISSUER's attestation. This verifier reads those
 * from a supplied six-claim envelope but does not re-derive them, and it refuses to surface any of
 * them as VERIFIED unless integrity holds AND a trusted key sealed the bytes. Fail-closed:
 * NOT_CHECKED is never a pass, and there is no single rollup "valid" verdict.
 *
 * The six-claim taxonomy and in-toto shape are the engine's (src/kernel/six-claims.ts); this never
 * redefines a claim's meaning, only recomputes what can be recomputed and downgrades what cannot.
 */
import { type SixClaim, type SixClaimKey, type SixClaimStatus, type SixClaimStatement } from './kernel-client';
/** The verdict spec this verifier implements. Bump when the reconciliation rules change. */
export declare const TRUSTLATTICE_VERDICT_SPEC: "https://hyperdag.dev/trustlattice/verdicts/v0";
export interface OfflineVerifyOptions {
    /** Ed25519 public keys (0x + 64 hex) the caller trusts as sealers. Empty/absent = none pinned. */
    trustedRoots?: readonly string[];
    /** Freshness anchor: RFC3339 string or epoch SECONDS, in 2000..2100 either way (Date.now() is milliseconds and is refused). When set, a policy expired at/before it fails authorization. */
    asOf?: string | number;
    /** The engine's six-claim in-toto Statement, if the caller has it (it travels in the receipt_response). */
    engineEnvelope?: unknown;
    /**
     * Set ONLY when `engineEnvelope` reached the caller over an AUTHENTICATED channel (the API's
     * receipt_response) — never for a document read from a file or handed over by a third party. The
     * envelope is NOT covered by the receipt's Ed25519 signature (the signature seals the receipt bytes;
     * the envelope only names the receipt by id+hash), so its bytes are only as trustworthy as the channel
     * that delivered them. Default false — an envelope claim marked VERIFIED is then surfaced as
     * NOT_CHECKED (read, not re-derived). integrity is the only claim this verifier ever establishes.
     */
    envelopeAuthenticated?: boolean;
}
/** How a given claim's status was decided. */
export type ClaimSource = 'local' | 'engine' | 'fail-closed';
export interface OfflineVerifyResult {
    spec: typeof TRUSTLATTICE_VERDICT_SPEC;
    schema: 'kernel-receipt/1' | 'kernel-receipt/2' | 'MALFORMED';
    receipt_id: string | null;
    /** The locally recomputed hash (null when it could not be computed, e.g. ethers missing). */
    receipt_hash: string | null;
    /** Who sealed the bytes, as recomputed here. trusted=true only under a pinned key. */
    sealer: {
        trusted: boolean;
        fingerprint: string | null;
        note: string;
    };
    /** The reconciled six-claim verdict, in canonical key order. */
    claims: Record<SixClaimKey, SixClaim>;
    /** in-toto wrapper over `claims` (null when the input was malformed). */
    statement: SixClaimStatement | null;
    reconciliation: {
        engine_envelope: 'ABSENT' | 'PRESENT_UNBOUND' | 'BOUND';
        /** Engine claims that were VERIFIED but which this verifier lowered to NOT_CHECKED/FAILED. */
        downgraded: SixClaimKey[];
        source: Record<SixClaimKey, ClaimSource>;
    };
    limitations: string[];
}
/** A parsed freshness anchor: an instant, an explicit "could not read it", or null when none was supplied. */
export type Anchor = {
    epoch: number;
} | {
    unreadable: string;
} | null;
/**
 * Parse a freshness anchor. null = none supplied. {unreadable} = supplied but unparsable — the caller
 * MUST fail closed (never silently skip the freshness check). {epoch} = a usable instant.
 */
export declare function asOfEpoch(asOf: string | number | undefined | null): Anchor;
/**
 * Verify a kernel receipt offline. NEVER THROWS. Returns the reconciled six-claim verdict. Pass the
 * engine's six-claim envelope (from the receipt_response) to carry its authenticity/observation/etc.
 * attestations through; without it, those claims are NOT_CHECKED.
 */
export declare function verifyReceiptOffline(receipt: unknown, opts?: OfflineVerifyOptions): Promise<OfflineVerifyResult>;
export interface OfflineVerifyChainOptions {
    /** Applied to every receipt (see verifyReceiptOffline). */
    trustedRoots?: readonly string[];
    asOf?: string | number;
    /** Optional six-claim envelopes, parallel to `receipts` (index i belongs to receipt i). */
    engineEnvelopes?: readonly unknown[];
}
export type ChainStatus = 'VERIFIED' | 'FAILED' | 'NOT_CHECKED' | 'EMPTY';
export interface ChainLink {
    index: number;
    receipt_id: string | null;
    /** The per-receipt offline verdict (integrity, sealer, the six claims). */
    verdict: OfflineVerifyResult;
    link: {
        /** NOT_APPLICABLE at index 0 (the chain root has no prior receipt here to compare against). */
        status: SixClaimStatus | 'NOT_APPLICABLE';
        /** The recomputed hash of index i-1 that this receipt's prev_hash must equal. */
        expected_prev_hash: string | null;
        /** What this receipt's header actually carries. */
        actual_prev_hash: string | null;
        notes: string[];
    };
}
export interface OfflineVerifyChainResult {
    spec: typeof TRUSTLATTICE_VERDICT_SPEC;
    length: number;
    /** VERIFIED only when every receipt's integrity is VERIFIED AND every i≥1 links to i-1. */
    chain: ChainStatus;
    links: ChainLink[];
    /** First index whose integrity or link hard-failed; null when the chain is whole or empty. */
    broken_at: number | null;
    limitations: string[];
}
/**
 * Verify a sequence of kernel receipts (oldest→newest) offline. NEVER THROWS. Each receipt is run
 * through {@link verifyReceiptOffline}; consecutive receipts are checked for a matching
 * (prev_receipt_id, prev_hash) → (receipt_id, recomputed hash) link. Fail-closed roll-up.
 */
export declare function verifyReceiptChain(receipts: readonly unknown[], opts?: OfflineVerifyChainOptions): Promise<OfflineVerifyChainResult>;
