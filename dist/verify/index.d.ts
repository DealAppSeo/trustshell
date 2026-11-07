/**
 * `@hyperdag/trustshell/verify` — the offline receipt-verification surface, on its own subpath.
 *
 * This entry exists so a consumer who only wants to VERIFY a receipt (a relying party, a CI gate, a
 * stranger auditing a published receipt) imports exactly that: the recompute-and-reconcile verifier
 * plus the taxonomy and the pure crypto primitives, and nothing from the Next.js app, the HAL
 * client, or anything that opens a socket. The import boundary is pinned by
 * tests/verify-subpath-import.mjs — it fails loudly if this subpath ever pulls next/react/supabase
 * or performs a network call during verification.
 *
 * Everything here is re-exported from src/lib (no logic lives in this file): the subpath is a
 * curated door onto the SDK, not a second implementation.
 */
export { verifyReceiptOffline, verifyReceiptChain, TRUSTLATTICE_VERDICT_SPEC, } from '../lib/verify-receipt';
export type { OfflineVerifyOptions, OfflineVerifyResult, ClaimSource, OfflineVerifyChainOptions, OfflineVerifyChainResult, ChainLink, ChainStatus, } from '../lib/verify-receipt';
/** The verdict taxonomy and the pure primitives, so a consumer can reproduce canonical bytes themselves. */
export { SIX_CLAIM_KEYS, SIX_CLAIMS_PREDICATE_TYPE, KERNEL_RECEIPT_SCHEMA, KERNEL_RECEIPT_SCHEMA_SIGNED, KERNEL_RECEIPT_SIGNATURE_DOMAIN, KERNEL_TRUSTED_SIGNERS_ENV, kernelCanonicalJson, kernelReceiptHash, kernelReceiptAuthenticity, kernelTrustedSigners, } from '../lib/kernel-client';
export type { SixClaim, SixClaimKey, SixClaimStatus, SixClaimStatement, KernelReceipt, KernelReceiptV1, KernelReceiptV2, KernelReceiptSigner, KernelReceiptAuthenticity, } from '../lib/kernel-client';
/**
 * The owner's side of the same offline surface: seal a receipt with THIS install's own Ed25519 key so
 * a stranger reproduces its integrity with the verifier above — one wire format, one verifier. An
 * owner self-signature proves authorship and wholeness only; `evidenceLevel` keeps it from ever reading
 * as independently-verified or RepID-bearing. node:crypto only, no network (same import boundary).
 */
export { signOwnerReceipt, installKeySigner, installKeyRootHex, ownerReceiptProvenance, evidenceLevel, OWNER_SELF_SIGNED, } from '../lib/owner-receipt';
export type { SealableReceipt, EvidenceLevel, EvidenceVerdict } from '../lib/owner-receipt';
