"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OWNER_SELF_SIGNED = exports.evidenceLevel = exports.ownerReceiptProvenance = exports.installKeyRootHex = exports.installKeySigner = exports.signOwnerReceipt = exports.kernelTrustedSigners = exports.kernelReceiptAuthenticity = exports.kernelReceiptHash = exports.kernelCanonicalJson = exports.KERNEL_TRUSTED_SIGNERS_ENV = exports.KERNEL_RECEIPT_SIGNATURE_DOMAIN = exports.KERNEL_RECEIPT_SCHEMA_SIGNED = exports.KERNEL_RECEIPT_SCHEMA = exports.SIX_CLAIMS_PREDICATE_TYPE = exports.SIX_CLAIM_KEYS = exports.TRUSTLATTICE_VERDICT_SPEC = exports.verifyReceiptChain = exports.verifyReceiptOffline = void 0;
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
var verify_receipt_1 = require("../lib/verify-receipt");
Object.defineProperty(exports, "verifyReceiptOffline", { enumerable: true, get: function () { return verify_receipt_1.verifyReceiptOffline; } });
Object.defineProperty(exports, "verifyReceiptChain", { enumerable: true, get: function () { return verify_receipt_1.verifyReceiptChain; } });
Object.defineProperty(exports, "TRUSTLATTICE_VERDICT_SPEC", { enumerable: true, get: function () { return verify_receipt_1.TRUSTLATTICE_VERDICT_SPEC; } });
/** The verdict taxonomy and the pure primitives, so a consumer can reproduce canonical bytes themselves. */
var kernel_client_1 = require("../lib/kernel-client");
Object.defineProperty(exports, "SIX_CLAIM_KEYS", { enumerable: true, get: function () { return kernel_client_1.SIX_CLAIM_KEYS; } });
Object.defineProperty(exports, "SIX_CLAIMS_PREDICATE_TYPE", { enumerable: true, get: function () { return kernel_client_1.SIX_CLAIMS_PREDICATE_TYPE; } });
Object.defineProperty(exports, "KERNEL_RECEIPT_SCHEMA", { enumerable: true, get: function () { return kernel_client_1.KERNEL_RECEIPT_SCHEMA; } });
Object.defineProperty(exports, "KERNEL_RECEIPT_SCHEMA_SIGNED", { enumerable: true, get: function () { return kernel_client_1.KERNEL_RECEIPT_SCHEMA_SIGNED; } });
Object.defineProperty(exports, "KERNEL_RECEIPT_SIGNATURE_DOMAIN", { enumerable: true, get: function () { return kernel_client_1.KERNEL_RECEIPT_SIGNATURE_DOMAIN; } });
Object.defineProperty(exports, "KERNEL_TRUSTED_SIGNERS_ENV", { enumerable: true, get: function () { return kernel_client_1.KERNEL_TRUSTED_SIGNERS_ENV; } });
Object.defineProperty(exports, "kernelCanonicalJson", { enumerable: true, get: function () { return kernel_client_1.kernelCanonicalJson; } });
Object.defineProperty(exports, "kernelReceiptHash", { enumerable: true, get: function () { return kernel_client_1.kernelReceiptHash; } });
Object.defineProperty(exports, "kernelReceiptAuthenticity", { enumerable: true, get: function () { return kernel_client_1.kernelReceiptAuthenticity; } });
Object.defineProperty(exports, "kernelTrustedSigners", { enumerable: true, get: function () { return kernel_client_1.kernelTrustedSigners; } });
/**
 * The owner's side of the same offline surface: seal a receipt with THIS install's own Ed25519 key so
 * a stranger reproduces its integrity with the verifier above — one wire format, one verifier. An
 * owner self-signature proves authorship and wholeness only; `evidenceLevel` keeps it from ever reading
 * as independently-verified or RepID-bearing. node:crypto only, no network (same import boundary).
 */
var owner_receipt_1 = require("../lib/owner-receipt");
Object.defineProperty(exports, "signOwnerReceipt", { enumerable: true, get: function () { return owner_receipt_1.signOwnerReceipt; } });
Object.defineProperty(exports, "installKeySigner", { enumerable: true, get: function () { return owner_receipt_1.installKeySigner; } });
Object.defineProperty(exports, "installKeyRootHex", { enumerable: true, get: function () { return owner_receipt_1.installKeyRootHex; } });
Object.defineProperty(exports, "ownerReceiptProvenance", { enumerable: true, get: function () { return owner_receipt_1.ownerReceiptProvenance; } });
Object.defineProperty(exports, "evidenceLevel", { enumerable: true, get: function () { return owner_receipt_1.evidenceLevel; } });
Object.defineProperty(exports, "OWNER_SELF_SIGNED", { enumerable: true, get: function () { return owner_receipt_1.OWNER_SELF_SIGNED; } });
