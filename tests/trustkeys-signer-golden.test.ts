/**
 * trustkeys-signer-golden.test.ts — THE CROSS-REPO CONTRACT.
 *
 * The client signer here and the repid-engine verifier (src/services/signed-job.ts, PR #1273)
 * must agree BYTE-FOR-BYTE on the canonical JSON and the payee hash, or every real owner
 * signature silently fails to verify. This test pins that agreement with a fixed throwaway key
 * and asserts, exactly:
 *
 *   (a) buildPolicy / buildJog produce the exact expected objects;
 *   (b) canonicalize() produces the EXACT expected string (the bytes the owner signs);
 *   (c) ethers recovers the fixture address from each signature (the load-bearing check);
 *   (d) the signatures equal the pinned values (ECDSA is RFC-6979 deterministic, so these are a
 *       real pin across ethers patch versions and across repos).
 *
 * The identical vector is emitted in the PR body so repid-engine's verifier test pins the SAME
 * policy, job, canonical strings, and signatures. A one-byte drift in either repo's canonicalizer
 * breaks (b) here and the recovery there — caught in CI, not by a user whose payment won't verify.
 *
 * THE KEY IS THE PUBLICLY-KNOWN HARDHAT ACCOUNT #0 TEST KEY. It is a universal test fixture with
 * no value and controls no real funds — never a real key, and never written anywhere but this test.
 */
import { Wallet, verifyMessage } from 'ethers';
import { buildPolicy, buildJob, canonicalize, hashPayee, signPolicy, signJob, type Policy, type Job } from '../lib/trustkeys-signer';

// ---- Fixture (throwaway; the standard Hardhat account #0 key — public, zero value) ----------
const TEST_PK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const TEST_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const OWNER = TEST_ADDRESS.toLowerCase();
const PAYEE = '0x' + 'b'.repeat(40);
const EXPIRY = 1893456000; // 2030-01-01T00:00:00Z — fixed, comfortably in the future
const POLICY_NONCE = '0x' + 'ab'.repeat(16);
const JOB_NONCE = '0x' + '01'.padStart(32, '0');

// ---- The pinned vector (emitted in the PR body; repid-engine pins the identical values) -----
const EXPECTED = {
  payeeHash: '0xee441ddf4990cb02d0fd89b94e7db060430759c5d4a9202b9f4614e678b91515',
  policy: {
    v: 1,
    type: 'trustkeys-policy',
    owner: OWNER,
    chain_id: 84532,
    cap: '1000000000',
    token: 'USDC',
    payee_hashes: ['0xee441ddf4990cb02d0fd89b94e7db060430759c5d4a9202b9f4614e678b91515'],
    expiry: EXPIRY,
    policy_nonce: POLICY_NONCE,
  } satisfies Policy,
  job: {
    v: 1,
    type: 'trustkeys-job',
    owner: OWNER,
    chain_id: 84532,
    action: 'spend',
    cap: '1000000',
    payee_hash: '0xee441ddf4990cb02d0fd89b94e7db060430759c5d4a9202b9f4614e678b91515',
    expiry: EXPIRY,
    nonce: JOB_NONCE,
  } satisfies Job,
  policyCanon:
    '{"cap":"1000000000","chain_id":84532,"expiry":1893456000,"owner":"0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266","payee_hashes":["0xee441ddf4990cb02d0fd89b94e7db060430759c5d4a9202b9f4614e678b91515"],"policy_nonce":"0xabababababababababababababababab","token":"USDC","type":"trustkeys-policy","v":1}',
  jobCanon:
    '{"action":"spend","cap":"1000000","chain_id":84532,"expiry":1893456000,"nonce":"0x00000000000000000000000000000001","owner":"0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266","payee_hash":"0xee441ddf4990cb02d0fd89b94e7db060430759c5d4a9202b9f4614e678b91515","type":"trustkeys-job","v":1}',
  policySig:
    '0x8c96c6cebc1c23d6caa317dc886978a5a932d6e43ec7196a4dd955c23193037262d5905832b0370efd383673774effabc76b9a3a58e586d3161cbf8a41aa76921c',
  jobSig:
    '0x12355cef8aa1a5676b0522639d8697fb5652c8bf16aab74113503ea421529bce6aad589d394a2ab6e6fe58da1ed61beca05b3c9dc2f33551b7b3e20b405620571b',
};

describe('TrustKeys signer — golden vector (cross-repo contract with repid-engine)', () => {
  const policy = buildPolicy({
    owner: TEST_ADDRESS,
    chainId: 84532,
    cap: '1000000000',
    token: 'USDC',
    payees: [PAYEE],
    expiry: EXPIRY,
    policyNonce: POLICY_NONCE,
  });
  const job = buildJob({
    owner: TEST_ADDRESS,
    chainId: 84532,
    action: 'spend',
    cap: '1000000',
    payee: PAYEE,
    expiry: EXPIRY,
    nonce: JOB_NONCE,
  });

  it('hashPayee is keccak256 of the lowercased address string', () => {
    expect(hashPayee(PAYEE)).toBe(EXPECTED.payeeHash);
    // lowercasing is applied, so a checksummed input hashes identically
    expect(hashPayee(PAYEE.toUpperCase().replace('0X', '0x'))).toBe(EXPECTED.payeeHash);
  });

  it('(a) buildPolicy / buildJob produce the exact expected objects (owner lowercased, cap string, payees hashed)', () => {
    expect(policy).toEqual(EXPECTED.policy);
    expect(job).toEqual(EXPECTED.job);
  });

  it('(b) canonicalize() produces the EXACT expected string — the bytes the owner signs', () => {
    expect(canonicalize(policy)).toBe(EXPECTED.policyCanon);
    expect(canonicalize(job)).toBe(EXPECTED.jobCanon);
  });

  it('(c) ethers recovers the fixture address from each signature, and (d) the signatures are the pinned values', async () => {
    const wallet = new Wallet(TEST_PK);
    const { signature: policySig } = await signPolicy(wallet, policy);
    const { signature: jobSig } = await signJob(wallet, job);

    // (c) the load-bearing check: the signature recovers to the fixture owner.
    expect(verifyMessage(EXPECTED.policyCanon, policySig).toLowerCase()).toBe(OWNER);
    expect(verifyMessage(EXPECTED.jobCanon, jobSig).toLowerCase()).toBe(OWNER);

    // (d) the pinned signatures — RFC-6979 deterministic, so a real cross-version/cross-repo pin.
    expect(policySig).toBe(EXPECTED.policySig);
    expect(jobSig).toBe(EXPECTED.jobSig);
  });

  it('verifies against a FRESH random wallet too (not a quirk of the fixture key)', async () => {
    const w = Wallet.createRandom();
    const p = buildPolicy({ owner: w.address, cap: 500, token: 'USDC', payees: [PAYEE], expiry: EXPIRY, policyNonce: POLICY_NONCE });
    const { policy: signed, signature } = await signPolicy(w, p);
    expect(verifyMessage(canonicalize(signed), signature).toLowerCase()).toBe(w.address.toLowerCase());
  });
});
