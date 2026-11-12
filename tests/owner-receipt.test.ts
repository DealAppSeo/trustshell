/**
 * The owner-self-signed receipt seam (DECISION 1): an owner seals a kernel-receipt/2 with their own
 * install key, offline, and a STRANGER reproduces its integrity with the SAME verifier the engine's
 * receipts use. These tests are the contract — they prove the guards bite, not just that the happy
 * path runs: a tampered byte, a foreign key, a missing domain tag, a transplanted signature, a missing
 * trust root, a rotated key, a smuggled self-attestation, and an expired policy each fail CLOSED, and
 * an owner self-signature can never read as independently-verified or RepID-bearing. Cross-verifier tests
 * prove key isolation (a receipt is trusted only under the verifier that pins its own sealing key, in both
 * directions), and a verbatim-replay test states plainly that offline verification does NOT reject replay —
 * that is the engine's receipt_id/nullifier, not a claim a stranger's stateless check can make.
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

/**
 * An ENGINE-style receipt: sealed over the domain-prefixed canonical bytes by `key`, with NO owner provenance
 * stamp (so `ownerReceiptProvenance` is null), plus the matching authenticated six-claim envelope. This is the
 * only shape that can reach ISSUER_ATTESTED — used by the cross-verifier tests to prove key isolation.
 */
async function signEngineReceipt(key: KeyObject, receiptId = 'engine-test-0001', expiresAt: number | string | null = null, policy?: unknown) {
  const b = base();
  (b.header as Record<string, unknown>).receipt_id = receiptId;
  (b.decision as { policy: Record<string, unknown> }).policy.expires_at = expiresAt;
  if (policy !== undefined) (b.decision as Record<string, unknown>).policy = policy; // a malformed policy, sealed
  const header = { ...b.header, schema: 'kernel-receipt/2', version: 2, signer: installKeySigner(key) }; // NO provenance stamp
  const unsigned = { ...b, header };
  const signature = `0x${sign(null, Buffer.from(KERNEL_RECEIPT_SIGNATURE_DOMAIN + kernelCanonicalJson(unsigned), 'utf8'), key).toString('hex')}`;
  const signed = { ...b, header: { ...header, signature } };
  const receipt_hash = await kernelReceiptHash(signed as unknown as Parameters<typeof kernelReceiptHash>[0]);
  const r = { ...b, header: { ...header, signature, receipt_hash } };
  const envelope = {
    _type: 'https://in-toto.io/Statement/v1',
    predicateType: SIX_CLAIMS_PREDICATE_TYPE,
    subject: [{ name: `kernel-receipt:${receiptId}`, digest: { keccak256: receipt_hash.replace(/^0x/, '') } }],
    predicate: { claims: sixClaims('VERIFIED'), what_this_does_not_establish: [] },
  };
  return { r, envelope };
}

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

  // NOTE: signature TRANSPLANT and verbatim REPLAY are different attacks; this test is the former only.
  it('signature transplant: one receipt’s signature cannot be lifted onto a different body (offline integrity FAILS)', async () => {
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

  it('verbatim replay is NOT something offline verify rejects: the identical receipt verifies again — freshness/one-time use is the engine’s receipt_id/nullifier, not stateless offline verification', async () => {
    const key = ownerKey();
    const r = await signOwnerReceipt(base(), key);
    // A replay is the UNCHANGED receipt, re-submitted. Offline verification is stateless: it proves the bytes are
    // whole and sealed by a pinned key — never that they are fresh or used once. So both pass, by design. Rejecting
    // a re-submitted receipt is one-time settlement in the engine (receipt_id / nullifier), which a stranger's
    // offline check cannot see and must not claim. Overstating this would be exactly the false "replay-proof" claim.
    const roots = { trustedRoots: [installKeyRootHex(key)] };
    const v1 = await verifyReceiptOffline(r, roots);
    const v2 = await verifyReceiptOffline(JSON.parse(JSON.stringify(r)) as typeof r, roots); // same bytes, submitted again
    expect(v1.claims.integrity.status).toBe('VERIFIED');
    expect(v2.claims.integrity.status).toBe('VERIFIED'); // identical bytes still verify — this is correct, not a hole
    expect(v2.sealer.trusted).toBe(true);
    expect(v2.receipt_hash).toBe(v1.receipt_hash); // nothing in the offline verdict distinguishes a replay
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

  it('a pinned NON-owner issuer + a verified engine claim reads as ISSUER_ATTESTED — attestation under a named issuer, NOT a finding of independence', async () => {
    // The ONLY branch that is not owner-self-signed: an engine-style receipt (no owner stamp), sealed by
    // an issuer key the verifier chose to pin, with an AUTHENTICATED six-claim envelope. The SDK cannot
    // know whether that issuer is independent of the owner's beneficial control — so the level must say
    // "attested under a named issuer", never "independently verified".
    const issuer = ownerKey(); // a stand-in issuer key; offline, the SDK cannot know who controls it
    const b = base();
    const header = { ...b.header, schema: 'kernel-receipt/2', version: 2, signer: installKeySigner(issuer) }; // NO provenance stamp
    const unsigned = { ...b, header };
    const signature = `0x${sign(null, Buffer.from(KERNEL_RECEIPT_SIGNATURE_DOMAIN + kernelCanonicalJson(unsigned), 'utf8'), issuer).toString('hex')}`;
    const signed = { ...b, header: { ...header, signature } };
    const receipt_hash = await kernelReceiptHash(signed as unknown as Parameters<typeof kernelReceiptHash>[0]);
    const r = { ...b, header: { ...header, signature, receipt_hash } };
    const receiptId = String((b.header as Record<string, unknown>).receipt_id);

    const envelope = {
      _type: 'https://in-toto.io/Statement/v1',
      predicateType: SIX_CLAIMS_PREDICATE_TYPE,
      subject: [{ name: `kernel-receipt:${receiptId}`, digest: { keccak256: receipt_hash.replace(/^0x/, '') } }],
      predicate: { claims: sixClaims('VERIFIED'), what_this_does_not_establish: [] },
    };
    const v = await verifyReceiptOffline(r, { trustedRoots: [installKeyRootHex(issuer)], engineEnvelope: envelope, envelopeAuthenticated: true });

    expect(v.claims.integrity.status).toBe('VERIFIED');
    expect(v.sealer.trusted).toBe(true);
    expect(ownerReceiptProvenance(r)).toBeNull(); // not an owner self-signature
    expect(v.claims.observation.status).toBe('VERIFIED'); // an engine attestation verified under the pin

    const ev = evidenceLevel(v, r);
    expect(ev.level).toBe('ISSUER_ATTESTED');
    expect(ev.repid_eligible).toBe('engine-decides'); // the SDK never says 'yes'
    // the honest caveat must be stated: a pinned key is not a controller-independence finding
    expect(ev.why).toMatch(/not establish|independen/i);
  });

  it('cross-verifier: a receipt sealed by one key is trusted ONLY by a verifier pinning that key; the other key fails it closed, and the level never promotes', async () => {
    const ownerK = ownerKey();
    const engineK = ownerKey(); // a distinct issuer key
    const rOwner = await signOwnerReceipt(base(), ownerK);
    const { r: rEngine, envelope } = await signEngineReceipt(engineK);

    // (positive control) each verifies — and is trusted — ONLY under its own key.
    expect((await verifyReceiptOffline(rOwner, { trustedRoots: [installKeyRootHex(ownerK)] })).sealer.trusted).toBe(true);
    const engineOwnKey = await verifyReceiptOffline(rEngine, { trustedRoots: [installKeyRootHex(engineK)], engineEnvelope: envelope, envelopeAuthenticated: true });
    expect(engineOwnKey.sealer.trusted).toBe(true);
    expect(evidenceLevel(engineOwnKey, rEngine).level).toBe('ISSUER_ATTESTED');

    // the OWNER receipt under an ENGINE-ONLY verifier: foreign key → integrity FAILS, untrusted, NOT_ESTABLISHED.
    // It can never read as engine-attested just because a different pinned key is handed in.
    const ownerUnderEngine = await verifyReceiptOffline(rOwner, { trustedRoots: [installKeyRootHex(engineK)], engineEnvelope: envelope, envelopeAuthenticated: true });
    expect(ownerUnderEngine.sealer.trusted).toBe(false);
    expect(ownerUnderEngine.claims.integrity.status).toBe('FAILED');
    expect(evidenceLevel(ownerUnderEngine, rOwner).level).toBe('NOT_ESTABLISHED');

    // the ENGINE receipt under an OWNER-ONLY verifier: symmetric — foreign key, fails closed, never promotes.
    const engineUnderOwner = await verifyReceiptOffline(rEngine, { trustedRoots: [installKeyRootHex(ownerK)], engineEnvelope: envelope, envelopeAuthenticated: true });
    expect(engineUnderOwner.sealer.trusted).toBe(false);
    expect(engineUnderOwner.claims.integrity.status).toBe('FAILED');
    expect(evidenceLevel(engineUnderOwner, rEngine).level).toBe('NOT_ESTABLISHED');
  });

  it('cross-verifier: an engine-style receipt whose sealing key is NOT pinned cannot reach ISSUER_ATTESTED even with an authenticated envelope — an unsealed body stays WHOLE_BUT_UNSEALED', async () => {
    // No trusted root pinned at all: the bytes recompute (integrity VERIFIED) but no key is confirmed to have
    // sealed them, so the five engine claims are gated off (verify-receipt.ts: sealerTrusted && envelopeAuthenticated),
    // and an authenticated envelope cannot lift an unsealed receipt to issuer-attested.
    const engineK = ownerKey();
    const { r, envelope } = await signEngineReceipt(engineK, 'engine-test-0002');
    const v = await verifyReceiptOffline(r, { trustedRoots: [], engineEnvelope: envelope, envelopeAuthenticated: true });
    expect(v.claims.integrity.status).toBe('VERIFIED');
    expect(v.sealer.trusted).toBe(false);
    expect(v.claims.observation.status).toBe('NOT_CHECKED'); // not VERIFIED: no trusted sealer
    expect(evidenceLevel(v, r).level).toBe('WHOLE_BUT_UNSEALED');
  });

  it('expired authorization: a policy expired at/before as_of fails the authorization claim', async () => {
    const key = ownerKey();
    const b = base();
    (b.decision as { policy: Record<string, unknown> }).policy.expires_at = 1_000_000_000; // 2001
    const r = await signOwnerReceipt(b, key);
    const v = await verifyReceiptOffline(r, { trustedRoots: [installKeyRootHex(key)], asOf: 2_000_000_000 }); // 2033
    expect(v.claims.authorization.status).toBe('FAILED');
  });

  // With no as_of, v0 leaves authorization as read (the conformance vector clean-valid-pinned-authenticated
  // pins VERIFIED). Before this, an already-expired policy then read VERIFIED with an empty gaps list: the
  // skipped freshness check was invisible. The status is a spec question; saying what was skipped is not.
  const FRESHNESS_SKIPPED = /no as_of was supplied, so freshness was NOT checked/;

  it('no as_of: an expiring policy says freshness was NOT checked, and its status is left as read', async () => {
    const key = ownerKey();
    const { r, envelope } = await signEngineReceipt(key, 'engine-test-0003', 1_000_000_000); // expired in 2001
    const v = await verifyReceiptOffline(r, { trustedRoots: [installKeyRootHex(key)], engineEnvelope: envelope, envelopeAuthenticated: true });
    expect(v.claims.authorization.status).toBe('VERIFIED');
    expect(v.claims.authorization.gaps.filter((g) => FRESHNESS_SKIPPED.test(g))).toEqual([
      'the policy expires at 1000000000 and no as_of was supplied, so freshness was NOT checked',
    ]);
  });

  it('the freshness note appears only when an expiry exists and no as_of was given', async () => {
    const key = ownerKey();
    const root = [installKeyRootHex(key)];
    const expiring = await signEngineReceipt(key, 'engine-test-0004', 1_900_000_000);
    const inside = await verifyReceiptOffline(expiring.r, { trustedRoots: root, engineEnvelope: expiring.envelope, envelopeAuthenticated: true, asOf: 1_800_000_000 });
    expect(inside.claims.authorization.status).toBe('VERIFIED');
    expect(inside.claims.authorization.gaps.some((g) => FRESHNESS_SKIPPED.test(g))).toBe(false);

    const noExpiry = await signEngineReceipt(key, 'engine-test-0005', null);
    const v = await verifyReceiptOffline(noExpiry.r, { trustedRoots: root, engineEnvelope: noExpiry.envelope, envelopeAuthenticated: true });
    expect(v.claims.authorization.status).toBe('VERIFIED');
    expect(v.claims.authorization.gaps.some((g) => FRESHNESS_SKIPPED.test(g))).toBe(false);
  });

  // Strix on #704: an expiry that is present but not a number used to read as "no expiry", so even WITH an
  // as_of an expired policy passed silently. It is now unreadable, never absent.
  it('an expires_at that is not a number is never read as absent', async () => {
    const key = ownerKey();
    const root = [installKeyRootHex(key)];
    const { r, envelope } = await signEngineReceipt(key, 'engine-test-0006', '2001-01-01T00:00:00Z');
    const withAsOf = await verifyReceiptOffline(r, { trustedRoots: root, engineEnvelope: envelope, envelopeAuthenticated: true, asOf: 2_000_000_000 });
    expect(withAsOf.claims.authorization.status).toBe('NOT_CHECKED'); // fails closed, like an unreadable as_of
    expect(withAsOf.claims.authorization.gaps).toContain('policy.expires_at is a string, not a number, so freshness was NOT checked: this is not a pass');
    expect(withAsOf.reconciliation.downgraded).toContain('authorization');

    const noAsOf = await verifyReceiptOffline(r, { trustedRoots: root, engineEnvelope: envelope, envelopeAuthenticated: true });
    expect(noAsOf.claims.authorization.status).toBe('VERIFIED'); // no as_of: left as read, like a numeric expiry
    expect(noAsOf.claims.authorization.gaps.filter((g) => FRESHNESS_SKIPPED.test(g))).toEqual([
      'policy.expires_at is a string, not a number, and no as_of was supplied, so freshness was NOT checked',
    ]);
  });

  // Strix on #704 (round 3): a millisecond stamp compared as seconds never expires, and a policy that is not
  // an object hid its expiry entirely. Both are unreadable, so with an as_of they fail closed.
  it('a millisecond expiry and a non-object policy are unreadable, not silently fresh', async () => {
    const key = ownerKey();
    const root = [installKeyRootHex(key)];
    const opts = { trustedRoots: root, envelopeAuthenticated: true, asOf: 2_000_000_000 } as const;

    const ms = await signEngineReceipt(key, 'engine-test-0007', 1_000_000_000_000); // 2001, in milliseconds
    const vMs = await verifyReceiptOffline(ms.r, { ...opts, engineEnvelope: ms.envelope });
    expect(vMs.claims.authorization.status).toBe('NOT_CHECKED');
    expect(vMs.claims.authorization.gaps).toContain('policy.expires_at 1000000000000 is after 4102444800 (2100), so it is not epoch seconds (a millisecond stamp lands here), so freshness was NOT checked: this is not a pass');

    const str = await signEngineReceipt(key, 'engine-test-0008', null, JSON.stringify({ expires_at: 1_000_000_000 })); // double-encoded
    const vStr = await verifyReceiptOffline(str.r, { ...opts, engineEnvelope: str.envelope });
    expect(vStr.claims.authorization.status).toBe('NOT_CHECKED');
    expect(vStr.claims.authorization.gaps).toContain('decision.policy is a string, not an object, so freshness was NOT checked: this is not a pass');

    // Control: an in-window seconds expiry still FAILS on the same as_of, and a null policy is still "no expiry".
    const sec = await signEngineReceipt(key, 'engine-test-0009', 1_000_000_000);
    expect((await verifyReceiptOffline(sec.r, { ...opts, engineEnvelope: sec.envelope })).claims.authorization.status).toBe('FAILED');
    // An EARLY expiry (before 2000, or 0) is simply expired: it FAILS, it is not "unreadable" (Strix, MEDIUM).
    for (const [id, early] of [['engine-test-0011', 1], ['engine-test-0012', 0], ['engine-test-0013', 946_684_799]] as const) {
      const s = await signEngineReceipt(key, id, early);
      const v = await verifyReceiptOffline(s.r, { ...opts, engineEnvelope: s.envelope });
      expect([early, v.claims.authorization.status]).toEqual([early, 'FAILED']);
    }
    const none = await signEngineReceipt(key, 'engine-test-0010', null, null);
    const vNone = await verifyReceiptOffline(none.r, { ...opts, engineEnvelope: none.envelope });
    expect(vNone.claims.authorization.status).toBe('VERIFIED');
    expect(vNone.claims.authorization.gaps.some((g) => /freshness was NOT checked/.test(g))).toBe(false);
  });

  // A receipt whose bytes are not trusted is not read for freshness. Before this, an expiry edited after
  // signing was quoted back as fact ("the policy expires at X", "policy expired at X") right beside the gap
  // saying the receipt's decision fields cannot be trusted.
  it('an untrusted receipt’s expiry is never stated: freshness is not read from bytes that failed integrity', async () => {
    const key = ownerKey();
    const root = [installKeyRootHex(key)];
    const NOT_READ = 'freshness was NOT checked: integrity is not VERIFIED, so the policy expiry was not read';
    const { r, envelope } = await signEngineReceipt(key, 'engine-test-0014', 1_900_000_000);
    const tampered = JSON.parse(JSON.stringify(r)) as { decision: { policy: Record<string, unknown> } };
    tampered.decision.policy.expires_at = 1_234_567_890; // edited after signing: the hash is now stale
    for (const asOf of [2_000_000_000, undefined]) {
      const v = await verifyReceiptOffline(tampered, { trustedRoots: root, engineEnvelope: envelope, envelopeAuthenticated: true, asOf });
      expect(v.claims.integrity.status).toBe('FAILED');
      expect([asOf, v.claims.authorization.status]).toEqual([asOf, 'NOT_CHECKED']);
      expect(v.claims.authorization.gaps).toContain(NOT_READ);
      expect(v.claims.authorization.gaps.some((g) => g.includes('1234567890'))).toBe(false);
    }
    // Control: the same receipt untampered, past its expiry, still FAILS on the anchor.
    const whole = await verifyReceiptOffline(r, { trustedRoots: root, engineEnvelope: envelope, envelopeAuthenticated: true, asOf: 2_000_000_000 });
    expect(whole.claims.integrity.status).toBe('VERIFIED');
    expect(whole.claims.authorization.status).toBe('FAILED');
    expect(whole.claims.authorization.gaps).not.toContain(NOT_READ);
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
