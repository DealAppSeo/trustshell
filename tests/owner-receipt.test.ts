/**
 * The owner-self-signed receipt seam (DECISION 1): an owner seals a kernel-receipt/2 with their own
 * install key, offline, and a STRANGER reproduces its integrity with the SAME verifier the engine's
 * receipts use. These tests are the contract — they prove the guards bite, not just that the happy
 * path runs: a tampered byte, a foreign key, a missing domain tag, a transplanted signature, a missing
 * trust root, a rotated key, a smuggled self-attestation, and an expired policy each fail CLOSED, and
 * an owner self-signature can never read as independently-verified or RepID-bearing.
 */
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import {
  KERNEL_RECEIPT_SIGNATURE_DOMAIN,
  SIX_CLAIMS_PREDICATE_TYPE,
  SIX_CLAIM_KEYS,
  kernelCanonicalJson,
  kernelReceiptHash,
  type SixClaimKey,
  type SixClaimStatus,
} from '../src/lib/kernel-client';
import { verifyReceiptOffline } from '../src/lib/verify-receipt';
import {
  OWNER_SELF_SIGNED,
  evidenceLevel,
  installKeyRootHex,
  installKeySigner,
  ownerReceiptProvenance,
  signOwnerReceipt,
  type SealableReceipt,
} from '../src/lib/owner-receipt';

const ownerKey = (): KeyObject => generateKeyPairSync('ed25519').privateKey;
const ENGINE_CLAIMS: SixClaimKey[] = ['authenticity', 'observation', 'correctness', 'authorization', 'containment'];

/** A fresh, minimal-but-complete kernel-receipt body to seal. New object each call (tests mutate clones). */
function base(): SealableReceipt {
  return {
    header: { receipt_id: 'owner-test-0001', prev_receipt_id: null, prev_hash: null, created_at: '2026-11-07T00:00:00Z', env: { network: 'base-sepolia', chain_id: 84532, is_simulated: true } },
    subject: { agent: { agent_id: 'agent-1', agent_name: 'demo' }, owner: { wallet: null, assurance: null, status: 'none' } },
    request: { tool: { name: 'echo', class: 'read' }, origin: 'Cli', args_hash: `0x${'a'.repeat(64)}`, amount_raw: null, payee: null, asset: null, chain_id: null },
    decision: {
      verdict: 'ALLOW', blocking: false, executed: false, reasons: [], checks: [{ name: 'local', outcome: 'PASS', source: 'owner' }], does_not_attest: [],
      policy: { policy_hash: null, signer: null, signature: 'NOT_CHECKED', expires_at: null, revocation: 'NOT_CHECKED' },
      limits: { per_tx_raw: '0', daily_raw: '0', total_raw: '0', effective_per_tx_raw: '0', binding_term: 'none' },
      laya: { lane: null, mode: 'shadow', consulted: false },
    },
    payment: { status: 'none' },
    verification: { status: 'none' },
  };
}

const sixClaims = (status: SixClaimStatus): Record<SixClaimKey, { status: SixClaimStatus; statement: string; supports: string[]; gaps: string[] }> => {
  const out = {} as Record<SixClaimKey, { status: SixClaimStatus; statement: string; supports: string[]; gaps: string[] }>;
  for (const k of SIX_CLAIM_KEYS) out[k] = { status, statement: `claim ${k}`, supports: [], gaps: [] };
  return out;
};

describe('owner-self-signed receipt seam (DECISION 1)', () => {
  it('emits an owner-stamped kernel-receipt/2 a stranger verifies under the owner-pinned key; the 5 engine claims stay NOT_CHECKED', async () => {
    const key = ownerKey();
    const r = await signOwnerReceipt(base(), key);

    expect(r.header.schema).toBe('kernel-receipt/2');
    expect((r.header as unknown as { provenance: string }).provenance).toBe(OWNER_SELF_SIGNED);
    expect(ownerReceiptProvenance(r)).toBe(OWNER_SELF_SIGNED);
    expect(r.header.signature).toMatch(/^0x[0-9a-f]{128}$/);
    expect(r.header.receipt_hash).toMatch(/^0x[0-9a-f]{64}$/);

    const v = await verifyReceiptOffline(r, { trustedRoots: [installKeyRootHex(key)] });
    expect(v.claims.integrity.status).toBe('VERIFIED');
    expect(v.sealer.trusted).toBe(true);
    for (const k of ENGINE_CLAIMS) expect(v.claims[k].status).toBe('NOT_CHECKED');

    expect(evidenceLevel(v, r)).toMatchObject({ level: 'OWNER_SELF_SIGNED', repid_eligible: 'no' });
  });

  it('absent trust root: the bytes are whole but UNSEALED — never silently owner-signed', async () => {
    const key = ownerKey();
    const r = await signOwnerReceipt(base(), key);
    const v = await verifyReceiptOffline(r, { trustedRoots: [] }); // no pin
    expect(v.claims.integrity.status).toBe('VERIFIED'); // hash recomputed and matched
    expect(v.sealer.trusted).toBe(false); // but no key was confirmed to have sealed it
    expect(evidenceLevel(v, r).level).toBe('WHOLE_BUT_UNSEALED');
  });

  it('a foreign pinned key: integrity FAILS (untrusted signer), evidence NOT_ESTABLISHED', async () => {
    const key = ownerKey();
    const r = await signOwnerReceipt(base(), key);
    const v = await verifyReceiptOffline(r, { trustedRoots: [installKeyRootHex(ownerKey())] }); // someone else's key
    expect(v.claims.integrity.status).toBe('FAILED');
    expect(v.sealer.trusted).toBe(false);
    expect(evidenceLevel(v, r).level).toBe('NOT_ESTABLISHED');
  });

  it('tampering after sealing: a flipped decision breaks the hash, integrity FAILS', async () => {
    const key = ownerKey();
    const r = await signOwnerReceipt(base(), key);
    const tampered = JSON.parse(JSON.stringify(r));
    tampered.decision.verdict = 'DENY';
    const v = await verifyReceiptOffline(tampered, { trustedRoots: [installKeyRootHex(key)] });
    expect(v.claims.integrity.status).toBe('FAILED');
  });

  it('domain separation: a signature made WITHOUT the domain tag does not verify (the tag is load-bearing)', async () => {
    const key = ownerKey();
    const b = base();
    const header = { ...b.header, schema: 'kernel-receipt/2', version: 2, provenance: OWNER_SELF_SIGNED, signer: installKeySigner(key) };
    const unsigned = { ...b, header };
    const badSig = `0x${sign(null, Buffer.from(kernelCanonicalJson(unsigned), 'utf8'), key).toString('hex')}`; // NO domain prefix
    const signed = { ...b, header: { ...header, signature: badSig } };
    const receipt_hash = await kernelReceiptHash(signed as unknown as Parameters<typeof kernelReceiptHash>[0]);
    const forged = { ...b, header: { ...header, signature: badSig, receipt_hash } };

    const v = await verifyReceiptOffline(forged, { trustedRoots: [installKeyRootHex(key)] });
    // hash matches the forged bytes, but the signature is over the un-prefixed message, so it fails under the domain.
    expect(v.claims.integrity.status).toBe('FAILED');
    expect(v.sealer.trusted).toBe(false);
    // sanity: with the domain tag it WOULD have verified
    expect((await verifyReceiptOffline(await signOwnerReceipt(base(), key), { trustedRoots: [installKeyRootHex(key)] })).sealer.trusted).toBe(true);
  });

  it('canonical serialization: re-ordering keys does not change the hash or the verdict', async () => {
    const key = ownerKey();
    const r = await signOwnerReceipt(base(), key);
    // rebuild the same receipt with top-level AND header keys inserted in reverse order
    const reverse = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).reverse());
    const shuffled = { ...reverse(r as unknown as Record<string, unknown>), header: reverse(r.header as unknown as Record<string, unknown>) };
    const v = await verifyReceiptOffline(shuffled, { trustedRoots: [installKeyRootHex(key)] });
    expect(v.claims.integrity.status).toBe('VERIFIED');
    expect(v.receipt_hash).toBe(r.header.receipt_hash);
  });

  it('replay / signature transplant: one receipt’s signature cannot be lifted onto a different body', async () => {
    const key = ownerKey();
    const r = await signOwnerReceipt(base(), key);
    const other = base();
    (other.header as Record<string, unknown>).receipt_id = 'owner-test-0002';
    const transplant = { ...other, header: { ...other.header, schema: 'kernel-receipt/2', version: 2, provenance: OWNER_SELF_SIGNED, signer: r.header.signer, signature: r.header.signature } };
    const receipt_hash = await kernelReceiptHash(transplant as unknown as Parameters<typeof kernelReceiptHash>[0]);
    const forged = { ...transplant, header: { ...transplant.header, receipt_hash } };
    const v = await verifyReceiptOffline(forged, { trustedRoots: [installKeyRootHex(key)] });
    expect(v.claims.integrity.status).toBe('FAILED'); // r's signature does not cover other's bytes
  });

  it('key rotation: an old receipt verifies under the old pin, is rejected under the new, and still holds when both are pinned', async () => {
    const oldKey = ownerKey();
    const newKey = ownerKey();
    const rOld = await signOwnerReceipt(base(), oldKey);
    expect((await verifyReceiptOffline(rOld, { trustedRoots: [installKeyRootHex(newKey)] })).claims.integrity.status).toBe('FAILED');
    expect((await verifyReceiptOffline(rOld, { trustedRoots: [installKeyRootHex(oldKey)] })).claims.integrity.status).toBe('VERIFIED');
    const both = await verifyReceiptOffline(rOld, { trustedRoots: [installKeyRootHex(newKey), installKeyRootHex(oldKey)] });
    expect(both.sealer.trusted).toBe(true);
  });

  it('mismatched execution evidence: a smuggled six-claim envelope cannot make an owner receipt independently-verified', async () => {
    const key = ownerKey();
    const r = await signOwnerReceipt(base(), key);
    const envelope = {
      _type: 'https://in-toto.io/Statement/v1',
      predicateType: SIX_CLAIMS_PREDICATE_TYPE,
      subject: [{ name: `kernel-receipt:${r.header.receipt_id}`, digest: { keccak256: r.header.receipt_hash.replace(/^0x/, '') } }],
      predicate: { claims: sixClaims('VERIFIED'), what_this_does_not_establish: [] },
    };

    // (a) read from a file (envelope NOT declared authenticated): claims are read, not verified → NOT_CHECKED
    const vFile = await verifyReceiptOffline(r, { trustedRoots: [installKeyRootHex(key)], engineEnvelope: envelope });
    expect(vFile.claims.observation.status).toBe('NOT_CHECKED');
    expect(evidenceLevel(vFile, r)).toMatchObject({ level: 'OWNER_SELF_SIGNED', repid_eligible: 'no' });

    // (b) even if a caller wrongly declares the owner's own envelope authenticated, evidenceLevel still
    //     caps it at OWNER_SELF_SIGNED on the provenance stamp — self-attestation never earns RepID.
    const vAuthed = await verifyReceiptOffline(r, { trustedRoots: [installKeyRootHex(key)], engineEnvelope: envelope, envelopeAuthenticated: true });
    expect(evidenceLevel(vAuthed, r)).toMatchObject({ level: 'OWNER_SELF_SIGNED', repid_eligible: 'no' });
  });

  it('expired authorization: a policy expired at/before as_of fails the authorization claim', async () => {
    const key = ownerKey();
    const b = base();
    (b.decision as { policy: Record<string, unknown> }).policy.expires_at = 1_000_000_000; // 2001
    const r = await signOwnerReceipt(b, key);
    const v = await verifyReceiptOffline(r, { trustedRoots: [installKeyRootHex(key)], asOf: 2_000_000_000 }); // 2033
    expect(v.claims.authorization.status).toBe('FAILED');
  });

  it('installKeySigner encodes the key the engine way: 0x + 64 hex public key and sha256 fingerprint', () => {
    const s = installKeySigner(ownerKey());
    expect(s.alg).toBe('ed25519');
    expect(s.public_key).toMatch(/^0x[0-9a-f]{64}$/);
    expect(s.fingerprint).toMatch(/^0x[0-9a-f]{64}$/);
    expect(installKeyRootHex).toBeDefined();
  });

  it('the domain constant is the engine’s (so owner and engine receipts share one verifier)', () => {
    expect(KERNEL_RECEIPT_SIGNATURE_DOMAIN).toBe('hyperdag.kernel-receipt.signature.v1\n');
  });
});
