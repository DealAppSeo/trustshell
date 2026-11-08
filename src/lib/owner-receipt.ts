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
 *   - {@link evidenceLevel} never reports ISSUER_ATTESTED for one, and never reports a receipt as
 *     RepID-eligible — self-attestation earns authorship, never production reputation. An owner receipt
 *     that is whole and sealed stays OWNER_SELF_SIGNED. ISSUER_ATTESTED is the most an offline verdict
 *     ever reaches for a non-owner key, and it does NOT assert the issuer is independent of the owner
 *     (the SDK has no controller graph). Independence and RepID are the ENGINE's call against its OWN key.
 *
 * A missing trust root does NOT silently pass: with no pin the verifier reports the bytes whole but
 * UNSEALED (sealer.trusted=false), which {@link evidenceLevel} surfaces as WHOLE_BUT_UNSEALED, never
 * OWNER_SELF_SIGNED. "I can't check who sealed it" is never "the owner sealed it".
 */
import { createHash, createPublicKey, sign, type KeyObject } from 'node:crypto';
import {
  KERNEL_RECEIPT_SCHEMA_SIGNED,
  KERNEL_RECEIPT_SIGNATURE_DOMAIN,
  SIX_CLAIM_KEYS,
  kernelCanonicalJson,
  kernelReceiptHash,
  type KernelReceiptSigner,
  type KernelReceiptV2,
} from './kernel-client';
import type { OfflineVerifyResult } from './verify-receipt';

/** The provenance stamp that marks a receipt as sealed by an owner's own install key, not the engine. */
export const OWNER_SELF_SIGNED = 'owner-self-signed' as const;

const HEX32 = /^0x[0-9a-f]{64}$/;

/**
 * This install key's public identity in the engine's wire encoding: public_key and fingerprint are
 * lower-case `0x` + hex (the install key's own {@link import('./install-key').signerOf} gives base64url
 * / un-prefixed sha256; kernel-receipt/2 uses 0x-hex, so convert once, here).
 */
export function installKeySigner(key: KeyObject): KernelReceiptSigner {
  const x = String((createPublicKey(key).export({ format: 'jwk' }) as { x?: string }).x);
  const raw = Buffer.from(x, 'base64url');
  if (raw.length !== 32) throw new Error('not an Ed25519 public key (expected 32 bytes)');
  return {
    alg: 'ed25519',
    public_key: `0x${raw.toString('hex')}`,
    fingerprint: `0x${createHash('sha256').update(raw).digest('hex')}`,
  };
}

/** The `trustedRoots` pin a verifier passes to confirm THIS key sealed a receipt (0x + 64 hex). */
export function installKeyRootHex(key: KeyObject): string {
  return installKeySigner(key).public_key;
}

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
 * header are overwritten (you cannot pre-stamp the sealing fields). Keccak comes from @noble/hashes, so
 * this works without the optional ethers peer. Never makes a network call.
 */
export async function signOwnerReceipt(body: SealableReceipt, key: KeyObject): Promise<KernelReceiptV2> {
  if (!body || typeof body !== 'object' || typeof body.header !== 'object' || body.header === null) {
    throw new Error('signOwnerReceipt: body must be an object with a header object');
  }
  const signer = installKeySigner(key);
  const { receipt_hash: _h, signature: _s, ...rest } = body.header as Record<string, unknown>;
  const header = { ...rest, schema: KERNEL_RECEIPT_SCHEMA_SIGNED, version: 2 as const, provenance: OWNER_SELF_SIGNED, signer };
  const unsigned = { ...body, header };
  const signature = `0x${sign(null, Buffer.from(KERNEL_RECEIPT_SIGNATURE_DOMAIN + kernelCanonicalJson(unsigned), 'utf8'), key).toString('hex')}`;
  const signed = { ...body, header: { ...header, signature } };
  const receipt_hash = await kernelReceiptHash(signed as unknown as Parameters<typeof kernelReceiptHash>[0]);
  return { ...body, header: { ...header, signature, receipt_hash } } as unknown as KernelReceiptV2;
}

/** The provenance stamp on a receipt, or null when it has none (an engine receipt carries none). */
export function ownerReceiptProvenance(receipt: unknown): string | null {
  if (!receipt || typeof receipt !== 'object') return null;
  const header = (receipt as { header?: unknown }).header;
  if (!header || typeof header !== 'object') return null;
  const p = (header as { provenance?: unknown }).provenance;
  return typeof p === 'string' ? p : null;
}

export type EvidenceLevel =
  /** integrity is not VERIFIED: tampered, or the hash could not be recomputed. Trust nothing. */
  | 'NOT_ESTABLISHED'
  /** the bytes are whole, but no pinned key was confirmed to have sealed them (no/absent trust root). */
  | 'WHOLE_BUT_UNSEALED'
  /** whole AND sealed by the owner's own install key (provenance=owner-self-signed). Authorship only. */
  | 'OWNER_SELF_SIGNED'
  /**
   * whole, sealed by a pinned issuer key that is NOT an owner self-signature, with ≥1 engine claim
   * VERIFIED under it. Attestation UNDER A NAMED ISSUER — NOT a finding that the issuer is independent
   * of the owner's beneficial control. Offline, the SDK only knows the caller chose to pin this key; it
   * cannot derive the controller graph. Whether the issuer is truly independent (and whether the receipt
   * earns RepID) is the engine's call against its own key, never an offline verdict.
   */
  | 'ISSUER_ATTESTED';

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
export function evidenceLevel(verdict: OfflineVerifyResult, receipt: unknown): EvidenceVerdict {
  const integrity = verdict.claims?.integrity?.status;
  if (integrity !== 'VERIFIED') {
    return { level: 'NOT_ESTABLISHED', repid_eligible: 'engine-decides', why: `integrity is ${integrity ?? 'absent'}, not VERIFIED` };
  }
  if (!verdict.sealer?.trusted) {
    return { level: 'WHOLE_BUT_UNSEALED', repid_eligible: 'engine-decides', why: 'the bytes are whole but no pinned key was confirmed to have sealed them' };
  }
  if (ownerReceiptProvenance(receipt) === OWNER_SELF_SIGNED) {
    return { level: 'OWNER_SELF_SIGNED', repid_eligible: 'no', why: `sealed by the owner's own install key (${verdict.sealer.fingerprint ?? 'pinned key'}); self-attestation earns authorship, never production RepID` };
  }
  const anyEngineClaimVerified = SIX_CLAIM_KEYS.some((k) => k !== 'integrity' && verdict.claims?.[k]?.status === 'VERIFIED');
  if (anyEngineClaimVerified) {
    return {
      level: 'ISSUER_ATTESTED',
      repid_eligible: 'engine-decides',
      why: 'sealed by a pinned issuer key (not an owner self-signature) and at least one engine attestation verified under it; this does NOT establish that the issuer is independent of the owner — independence and RepID are the engine’s call',
    };
  }
  // Whole + sealed by a pinned key that is not a self-signature, but no engine claim reached VERIFIED
  // (e.g. the envelope was not supplied or not authenticated). It is sealed, but it is not independently
  // verified — do not promote it.
  return { level: 'WHOLE_BUT_UNSEALED', repid_eligible: 'engine-decides', why: 'sealed by a pinned key, but no engine attestation reached VERIFIED, so no independent claim stands' };
}
