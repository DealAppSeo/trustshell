/**
 * Reproduce conformance/trustlattice/v0/vectors.json from the signed engine golden.
 *
 *   npm run sdk:build && node conformance/trustlattice/v0/generate.mjs
 *
 * The emitted vectors.json is the artifact a stranger consumes: each vector is a self-contained
 * {receipt, options, expect} a relying party can run through ANY conformant verifier and get the
 * same per-claim verdict. This script only PREPARES the test data (it reuses the SDK's own
 * canonical-JSON + keccak to seal synthetic receipts, exactly as tests/cli-receipt.test.ts does);
 * the EXPECTED verdicts are hand-authored here and in README.md — they are the ruler, not an echo
 * of the implementation. Regenerate after any change to the receipt fixtures; the verdicts are
 * pinned to the TrustLattice v0 verdict spec (docs/protocol/VERDICTS.md).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { kernelReceiptHash } from '../../../dist/verify/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const golden = JSON.parse(readFileSync(join(ROOT, 'tests', 'fixtures', 'kernel-receipt-v2.golden.json'), 'utf8'));

const RECEIPT = golden.receipt_response.receipt;          // signed kernel-receipt/2
const ENVELOPE = golden.receipt_response.six_claims;      // engine six-claim in-toto statement
const KEY = golden.public_key;                            // the real sealer's Ed25519 public key
const WRONG_KEY = '0x' + 'ab'.repeat(32);
const EXPIRES_AT = RECEIPT.decision.policy.expires_at;    // 1800003600

const clone = (x) => JSON.parse(JSON.stringify(x));

/** Re-serialize every object with its keys reversed: semantically identical, byte-different. */
function reverseKeysDeep(v) {
  if (Array.isArray(v)) return v.map(reverseKeysDeep);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).reverse()) out[k] = reverseKeysDeep(v[k]);
    return out;
  }
  return v;
}

/** A minimal, correctly-hashed kernel-receipt/1 (unsigned), mirroring cli-receipt.test.ts. */
async function v1Receipt() {
  const r = {
    header: { schema: 'kernel-receipt/1', version: 1, receipt_id: '00000000-0000-4000-8000-0000000000c1', prev_receipt_id: null, prev_hash: null, created_at: '2027-01-15T08:00:00.000Z', receipt_hash: '', env: { network: 'base-sepolia', chain_id: 84532, is_simulated: true }, signer: null },
    subject: { agent: { agent_id: 'a', agent_name: 'a' }, owner: { wallet: null, assurance: null, status: 'none' } },
    request: { tool: { name: 'inspect', class: 'read' }, origin: 'Cli', args_hash: '0x' + '00'.repeat(32), amount_raw: null, payee: null, asset: null, chain_id: null },
    decision: { verdict: 'ALLOW', blocking: false, executed: false, reasons: [], checks: [{ name: 'request_wellformed', outcome: 'PASS', source: 'kernel/decide' }], does_not_attest: [], policy: { policy_hash: null, signer: null, signature: 'NOT_CHECKED', expires_at: null, revocation: 'NOT_CHECKED' }, limits: { per_tx_raw: '0', daily_raw: '0', total_raw: '0', effective_per_tx_raw: '0', binding_term: 'per_tx' }, laya: { lane: null, mode: 'shadow', consulted: false } },
    payment: { status: 'NOT_APPLICABLE' },
    verification: { status: 'NOT_CHECKED' },
  };
  r.header.receipt_hash = await kernelReceiptHash(r);
  return r;
}

/** Envelope whose subject names a different receipt id (so it must not bind). */
function unboundEnvelope() {
  const e = clone(ENVELOPE);
  e.subject[0].name = 'kernel-receipt:00000000-0000-4000-8000-000000000999';
  return e;
}

const C = (statuses) => statuses; // readability alias

async function build() {
  const v1 = await v1Receipt();
  const tampered = clone(RECEIPT);
  tampered.decision.verdict = 'DENY';            // mutates bytes; header.receipt_hash now stale

  const vectors = [
    {
      id: 'clean-valid-pinned',
      description: 'The engine golden, verified under the real sealer key with its six-claim envelope. Reproduces the engine verdict.',
      receipt: RECEIPT,
      options: { trustedRoots: [KEY], engineEnvelope: ENVELOPE },
      expect: { schema: 'kernel-receipt/2', sealer_trusted: true, engine_envelope: 'BOUND', downgraded: [], claims: C({ integrity: 'VERIFIED', authenticity: 'VERIFIED', observation: 'NOT_CHECKED', correctness: 'NOT_APPLICABLE', authorization: 'VERIFIED', containment: 'VERIFIED' }) },
    },
    {
      id: 'clean-valid-no-roots',
      description: 'Same receipt, but no signer is pinned. Integrity holds on the hash, but every issuer attestation that was VERIFIED is downgraded to NOT_CHECKED because the sealer was not confirmed.',
      receipt: RECEIPT,
      options: { trustedRoots: [], engineEnvelope: ENVELOPE },
      expect: { schema: 'kernel-receipt/2', sealer_trusted: false, engine_envelope: 'BOUND', downgraded: ['authenticity', 'authorization', 'containment'], claims: C({ integrity: 'VERIFIED', authenticity: 'NOT_CHECKED', observation: 'NOT_CHECKED', correctness: 'NOT_APPLICABLE', authorization: 'NOT_CHECKED', containment: 'NOT_CHECKED' }) },
    },
    {
      id: 'jcs-key-reorder',
      description: 'The receipt re-serialized with every object key reversed. Canonicalization normalizes order, so the hash and signature still verify: identical verdict to clean-valid-pinned. Pins RFC-8785-style canonical hashing.',
      receipt: reverseKeysDeep(RECEIPT),
      options: { trustedRoots: [KEY], engineEnvelope: ENVELOPE },
      expect: { schema: 'kernel-receipt/2', sealer_trusted: true, engine_envelope: 'BOUND', downgraded: [], claims: C({ integrity: 'VERIFIED', authenticity: 'VERIFIED', observation: 'NOT_CHECKED', correctness: 'NOT_APPLICABLE', authorization: 'VERIFIED', containment: 'VERIFIED' }) },
    },
    {
      id: 'byte-tamper-decision',
      description: 'One decision field flipped (ALLOW->DENY) without re-hashing. The recomputed hash no longer matches header.receipt_hash, so integrity FAILS AND the real envelope no longer binds (its digest is over the original bytes): it is PRESENT_UNBOUND and ignored, so nothing is "downgraded" — every read claim is fail-closed NOT_CHECKED. Contrast untrusted-signer, where the bytes are intact so the envelope stays BOUND.',
      receipt: tampered,
      options: { trustedRoots: [KEY], engineEnvelope: ENVELOPE },
      expect: { schema: 'kernel-receipt/2', sealer_trusted: false, engine_envelope: 'PRESENT_UNBOUND', downgraded: [], claims: C({ integrity: 'FAILED', authenticity: 'NOT_CHECKED', observation: 'NOT_CHECKED', correctness: 'NOT_CHECKED', authorization: 'NOT_CHECKED', containment: 'NOT_CHECKED' }) },
    },
    {
      id: 'untrusted-signer',
      description: 'The genuine golden receipt, but the caller pins a DIFFERENT key. The signature verifies under the header key, which is not pinned: the receipt is treated as forged. Integrity FAILS.',
      receipt: RECEIPT,
      options: { trustedRoots: [WRONG_KEY], engineEnvelope: ENVELOPE },
      expect: { schema: 'kernel-receipt/2', sealer_trusted: false, engine_envelope: 'BOUND', downgraded: ['authenticity', 'correctness', 'authorization', 'containment'], claims: C({ integrity: 'FAILED', authenticity: 'NOT_CHECKED', observation: 'NOT_CHECKED', correctness: 'NOT_CHECKED', authorization: 'NOT_CHECKED', containment: 'NOT_CHECKED' }) },
    },
    {
      id: 'expired-as-of',
      description: 'Verified after the policy expired. Integrity and the sealer still hold, but authorization FAILS on freshness however the issuer labelled it.',
      receipt: RECEIPT,
      options: { trustedRoots: [KEY], engineEnvelope: ENVELOPE, asOf: EXPIRES_AT + 1 },
      expect: { schema: 'kernel-receipt/2', sealer_trusted: true, engine_envelope: 'BOUND', downgraded: [], claims: C({ integrity: 'VERIFIED', authenticity: 'VERIFIED', observation: 'NOT_CHECKED', correctness: 'NOT_APPLICABLE', authorization: 'FAILED', containment: 'VERIFIED' }) },
    },
    {
      id: 'within-as-of',
      description: 'Verified while the policy is still valid: authorization is unaffected. The control for expired-as-of.',
      receipt: RECEIPT,
      options: { trustedRoots: [KEY], engineEnvelope: ENVELOPE, asOf: EXPIRES_AT - 1 },
      expect: { schema: 'kernel-receipt/2', sealer_trusted: true, engine_envelope: 'BOUND', downgraded: [], claims: C({ integrity: 'VERIFIED', authenticity: 'VERIFIED', observation: 'NOT_CHECKED', correctness: 'NOT_APPLICABLE', authorization: 'VERIFIED', containment: 'VERIFIED' }) },
    },
    {
      id: 'envelope-absent',
      description: 'A bare receipt with no six-claim envelope. The two cryptographic claims are established; the five issuer attestations are NOT_CHECKED because there is nothing to read them from.',
      receipt: RECEIPT,
      options: { trustedRoots: [KEY] },
      expect: { schema: 'kernel-receipt/2', sealer_trusted: true, engine_envelope: 'ABSENT', downgraded: [], claims: C({ integrity: 'VERIFIED', authenticity: 'NOT_CHECKED', observation: 'NOT_CHECKED', correctness: 'NOT_CHECKED', authorization: 'NOT_CHECKED', containment: 'NOT_CHECKED' }) },
    },
    {
      id: 'envelope-unbound',
      description: 'An envelope that names a different receipt id does not bind: it is ignored, and the attestations are NOT_CHECKED. An envelope can never be grafted onto a receipt it was not issued for.',
      receipt: RECEIPT,
      options: { trustedRoots: [KEY], engineEnvelope: unboundEnvelope() },
      expect: { schema: 'kernel-receipt/2', sealer_trusted: true, engine_envelope: 'PRESENT_UNBOUND', downgraded: [], claims: C({ integrity: 'VERIFIED', authenticity: 'NOT_CHECKED', observation: 'NOT_CHECKED', correctness: 'NOT_CHECKED', authorization: 'NOT_CHECKED', containment: 'NOT_CHECKED' }) },
    },
    {
      id: 'unknown-schema',
      description: 'A header schema this verifier does not know. The receipt is MALFORMED: integrity FAILS and nothing is checked. Forward-incompatible receipts fail closed.',
      receipt: (() => { const r = clone(RECEIPT); r.header.schema = 'kernel-receipt/9'; return r; })(),
      options: { trustedRoots: [KEY], engineEnvelope: ENVELOPE },
      expect: { schema: 'MALFORMED', sealer_trusted: false, engine_envelope: 'ABSENT', downgraded: [], claims: C({ integrity: 'FAILED', authenticity: 'NOT_CHECKED', observation: 'NOT_CHECKED', correctness: 'NOT_CHECKED', authorization: 'NOT_CHECKED', containment: 'NOT_CHECKED' }) },
    },
    {
      id: 'not-a-receipt',
      description: 'An object that is not a kernel receipt at all. MALFORMED, nothing checked.',
      receipt: { hello: 'world' },
      options: { trustedRoots: [KEY] },
      expect: { schema: 'MALFORMED', sealer_trusted: false, engine_envelope: 'ABSENT', downgraded: [], claims: C({ integrity: 'FAILED', authenticity: 'NOT_CHECKED', observation: 'NOT_CHECKED', correctness: 'NOT_CHECKED', authorization: 'NOT_CHECKED', containment: 'NOT_CHECKED' }) },
    },
    {
      id: 'v1-unsigned-no-roots',
      description: 'A legacy unsigned kernel-receipt/1 with no signer pinned. Integrity holds on the hash alone (the standing gap: anyone can mint one). No envelope, so the attestations are NOT_CHECKED.',
      receipt: v1,
      options: { trustedRoots: [] },
      expect: { schema: 'kernel-receipt/1', sealer_trusted: false, engine_envelope: 'ABSENT', downgraded: [], claims: C({ integrity: 'VERIFIED', authenticity: 'NOT_CHECKED', observation: 'NOT_CHECKED', correctness: 'NOT_CHECKED', authorization: 'NOT_CHECKED', containment: 'NOT_CHECKED' }) },
    },
    {
      id: 'v1-unsigned-pin-downgrade',
      description: 'The same unsigned /1, but a signer IS pinned. An unsigned receipt under a pin is a downgrade attack: integrity FAILS rather than silently accepting less.',
      receipt: v1,
      options: { trustedRoots: [KEY] },
      expect: { schema: 'kernel-receipt/1', sealer_trusted: false, engine_envelope: 'ABSENT', downgraded: [], claims: C({ integrity: 'FAILED', authenticity: 'NOT_CHECKED', observation: 'NOT_CHECKED', correctness: 'NOT_CHECKED', authorization: 'NOT_CHECKED', containment: 'NOT_CHECKED' }) },
    },
  ];

  const out = {
    spec: 'https://hyperdag.dev/trustlattice/verdicts/v0',
    corpus: 'trustlattice/v0',
    generated_from: { fixture: 'tests/fixtures/kernel-receipt-v2.golden.json', engine_commit: golden.engine_commit },
    predicateType: ENVELOPE.predicateType,
    note: 'Self-contained conformance vectors. Each {receipt, options, expect} runs through any TrustLattice-conformant verifier and must yield the per-claim statuses in expect.claims. See README.md and docs/protocol/VERDICTS.md.',
    vectors,
  };
  writeFileSync(join(HERE, 'vectors.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(`wrote vectors.json — ${vectors.length} vectors`);
}

build().catch((e) => { console.error(e); process.exit(1); });
