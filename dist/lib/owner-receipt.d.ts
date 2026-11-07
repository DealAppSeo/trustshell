/**
 * owner-receipt — seal a kernel receipt with THIS install's own Ed25519 key, offline, with no engine.
 *
 * The engine (repid-engine) signs kernel-receipt/2 with its production key; this SDK has only ever
 * VERIFIED those. This is the owner's side: an agent's accountable owner can seal a receipt with their
 * own install key (`bundle-signing-key.pem`, src/lib/install-key.ts) so a stranger can reproduce its
 * integrity offline. It emits the SAME wire format the engine does, so {@link verifyReceiptOffline}
 * checks it UNCHANGED — the Ed25519 signature over `KERNEL_RECEIPT_SIGNATURE_DOMAIN + canonical bytes`,
 * the keccak256 receipt_hash, the 0x-hex signer and signature. One format, one verifier.
 *
 * THREE EVIDENCE LEVELS, NOT ONE. An owner-self-signed receipt proves exactly two things and NOTHING
 * more: the bytes are whole, and the owner's own key sealed them (authorship). It does NOT carry the
 * engine's six-claim attestation, so a verifier leaves authenticity/observation/correctness/
 * authorization/containment at NOT_CHECKED — the owner cannot self-certify that the kernel permitted
 * the action or that an outcome was observed. To keep that legible and un-launderable:
 *
 *   - every owner receipt carries `header.provenance = 'owner-self-signed'`, covered by the signature
 *     AND the hash (flip it and both break), so no reader mistakes it for an engine receipt;
 *   - {@link evidenceLevel} never reports INDEPENDENTLY_VERIFIED for one, and never reports a receipt
 *     as RepID-eligible — self-attestation earns authorship, never production reputation. Whether a
 *     receipt earns RepID is the ENGINE's call against its OWN pinned key, never an offline verdict.
 *
 * A missing trust root does NOT silently pass: with no pin the verifier reports the bytes whole but
 * UNSEALED (sealer.trusted=false), which {@link evidenceLevel} surfaces as WHOLE_BUT_UNSEALED, never
 * OWNER_SELF_SIGNED. "I can't check who sealed it" is never "the owner sealed it".
 */
import { type KeyObject } from 'node:crypto';
import { type KernelReceiptSigner, type KernelReceiptV2 } from './kernel-client';
import type { OfflineVerifyResult } from './verify-receipt';
/** The provenance stamp that marks a receipt as sealed by an owner's own install key, not the engine. */
export declare const OWNER_SELF_SIGNED: "owner-self-signed";
/**
 * This install key's public identity in the engine's wire encoding: public_key and fingerprint are
 * lower-case `0x` + hex (the install key's own {@link import('./install-key').signerOf} gives base64url
 * / un-prefixed sha256; kernel-receipt/2 uses 0x-hex, so convert once, here).
 */
export declare function installKeySigner(key: KeyObject): KernelReceiptSigner;
/** The `trustedRoots` pin a verifier passes to confirm THIS key sealed a receipt (0x + 64 hex). */
export declare function installKeyRootHex(key: KeyObject): string;
/** A receipt body to seal: anything with a `header` object, minus the sealing fields this adds. */
export interface SealableReceipt {
    header: Record<string, unknown>;
    [k: string]: unknown;
}
/**
 * Seal `body` as an owner-self-signed kernel-receipt/2. Reproduces the engine's order exactly:
 *   1. header gets schema=kernel-receipt/2, version=2, provenance=owner-self-signed, signer — but NO
 *      receipt_hash and NO signature yet;
 *   2. signature = Ed25519 over `DOMAIN + canonical(receipt-without-receipt_hash-and-signature)`, 0x+128 hex;
 *   3. receipt_hash = keccak256 over the canonical receipt WITH the signature but WITHOUT receipt_hash.
 * The caller supplies the body; any `schema`/`version`/`signer`/`signature`/`receipt_hash` already on the
 * header are overwritten (you cannot pre-stamp the sealing fields). Needs keccak (ethers peer or the
 * @noble path); never makes a network call.
 */
export declare function signOwnerReceipt(body: SealableReceipt, key: KeyObject): Promise<KernelReceiptV2>;
/** The provenance stamp on a receipt, or null when it has none (an engine receipt carries none). */
export declare function ownerReceiptProvenance(receipt: unknown): string | null;
export type EvidenceLevel = 
/** integrity is not VERIFIED: tampered, or the hash could not be recomputed. Trust nothing. */
'NOT_ESTABLISHED'
/** the bytes are whole, but no pinned key was confirmed to have sealed them (no/absent trust root). */
 | 'WHOLE_BUT_UNSEALED'
/** whole AND sealed by the owner's own install key (provenance=owner-self-signed). Authorship only. */
 | 'OWNER_SELF_SIGNED'
/** whole, sealed by a pinned key that is NOT an owner self-signature, AND at least one engine claim VERIFIED. */
 | 'INDEPENDENTLY_VERIFIED';
export interface EvidenceVerdict {
    level: EvidenceLevel;
    /** The SDK never says "yes": self-attestation is 'no'; everything else defers to the engine. */
    repid_eligible: 'no' | 'engine-decides';
    why: string;
}
/**
 * Map an offline verdict (+ the receipt it came from) to one of the three evidence levels D1 preserves.
 * This is the guard that keeps owner-signed from ever reading as independently-verified or RepID-bearing.
 */
export declare function evidenceLevel(verdict: OfflineVerifyResult, receipt: unknown): EvidenceVerdict;
