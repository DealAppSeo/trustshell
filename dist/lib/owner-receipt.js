"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OWNER_SELF_SIGNED = void 0;
exports.installKeySigner = installKeySigner;
exports.installKeyRootHex = installKeyRootHex;
exports.signOwnerReceipt = signOwnerReceipt;
exports.ownerReceiptProvenance = ownerReceiptProvenance;
exports.evidenceLevel = evidenceLevel;
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
const node_crypto_1 = require("node:crypto");
const kernel_client_1 = require("./kernel-client");
/** The provenance stamp that marks a receipt as sealed by an owner's own install key, not the engine. */
exports.OWNER_SELF_SIGNED = 'owner-self-signed';
const HEX32 = /^0x[0-9a-f]{64}$/;
/**
 * This install key's public identity in the engine's wire encoding: public_key and fingerprint are
 * lower-case `0x` + hex (the install key's own {@link import('./install-key').signerOf} gives base64url
 * / un-prefixed sha256; kernel-receipt/2 uses 0x-hex, so convert once, here).
 */
function installKeySigner(key) {
    const x = String((0, node_crypto_1.createPublicKey)(key).export({ format: 'jwk' }).x);
    const raw = Buffer.from(x, 'base64url');
    if (raw.length !== 32)
        throw new Error('not an Ed25519 public key (expected 32 bytes)');
    return {
        alg: 'ed25519',
        public_key: `0x${raw.toString('hex')}`,
        fingerprint: `0x${(0, node_crypto_1.createHash)('sha256').update(raw).digest('hex')}`,
    };
}
/** The `trustedRoots` pin a verifier passes to confirm THIS key sealed a receipt (0x + 64 hex). */
function installKeyRootHex(key) {
    return installKeySigner(key).public_key;
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
async function signOwnerReceipt(body, key) {
    if (!body || typeof body !== 'object' || typeof body.header !== 'object' || body.header === null) {
        throw new Error('signOwnerReceipt: body must be an object with a header object');
    }
    const signer = installKeySigner(key);
    const { receipt_hash: _h, signature: _s, ...rest } = body.header;
    const header = { ...rest, schema: kernel_client_1.KERNEL_RECEIPT_SCHEMA_SIGNED, version: 2, provenance: exports.OWNER_SELF_SIGNED, signer };
    const unsigned = { ...body, header };
    const signature = `0x${(0, node_crypto_1.sign)(null, Buffer.from(kernel_client_1.KERNEL_RECEIPT_SIGNATURE_DOMAIN + (0, kernel_client_1.kernelCanonicalJson)(unsigned), 'utf8'), key).toString('hex')}`;
    const signed = { ...body, header: { ...header, signature } };
    const receipt_hash = await (0, kernel_client_1.kernelReceiptHash)(signed);
    return { ...body, header: { ...header, signature, receipt_hash } };
}
/** The provenance stamp on a receipt, or null when it has none (an engine receipt carries none). */
function ownerReceiptProvenance(receipt) {
    if (!receipt || typeof receipt !== 'object')
        return null;
    const header = receipt.header;
    if (!header || typeof header !== 'object')
        return null;
    const p = header.provenance;
    return typeof p === 'string' ? p : null;
}
/**
 * Map an offline verdict (+ the receipt it came from) to one of the three evidence levels D1 preserves.
 * This is the guard that keeps owner-signed from ever reading as independently-verified or RepID-bearing.
 */
function evidenceLevel(verdict, receipt) {
    const integrity = verdict.claims?.integrity?.status;
    if (integrity !== 'VERIFIED') {
        return { level: 'NOT_ESTABLISHED', repid_eligible: 'engine-decides', why: `integrity is ${integrity ?? 'absent'}, not VERIFIED` };
    }
    if (!verdict.sealer?.trusted) {
        return { level: 'WHOLE_BUT_UNSEALED', repid_eligible: 'engine-decides', why: 'the bytes are whole but no pinned key was confirmed to have sealed them' };
    }
    if (ownerReceiptProvenance(receipt) === exports.OWNER_SELF_SIGNED) {
        return { level: 'OWNER_SELF_SIGNED', repid_eligible: 'no', why: `sealed by the owner's own install key (${verdict.sealer.fingerprint ?? 'pinned key'}); self-attestation earns authorship, never production RepID` };
    }
    const anyEngineClaimVerified = kernel_client_1.SIX_CLAIM_KEYS.some((k) => k !== 'integrity' && verdict.claims?.[k]?.status === 'VERIFIED');
    if (anyEngineClaimVerified) {
        return { level: 'INDEPENDENTLY_VERIFIED', repid_eligible: 'engine-decides', why: 'sealed by a pinned key and at least one engine attestation verified against it' };
    }
    // Whole + sealed by a pinned key that is not a self-signature, but no engine claim reached VERIFIED
    // (e.g. the envelope was not supplied or not authenticated). It is sealed, but it is not independently
    // verified — do not promote it.
    return { level: 'WHOLE_BUT_UNSEALED', repid_eligible: 'engine-decides', why: 'sealed by a pinned key, but no engine attestation reached VERIFIED, so no independent claim stands' };
}
