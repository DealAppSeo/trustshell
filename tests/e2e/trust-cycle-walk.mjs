#!/usr/bin/env node
/**
 * TrustShell trust-cycle E2E walk — INERT, OFFLINE, test-signer, reproducible.
 *
 * One genuine trust cycle, then an adversarial verification matrix, in one hermetic process:
 *   owner policy GRANTS a bounded action + REFUSES one over the cap   (real dist/lib/guardrails.decide)
 *   -> the authorized tool writes a DETERMINISTIC artifact on disk     (only on ALLOW)
 *   -> two real kernel-receipt/2 are minted + Ed25519-signed           (engine recipe, EPHEMERAL TEST key)
 *   -> linked prev_hash/prev_receipt_id (ALLOW root -> DENY child)
 *   -> 16 experiments through the SHIPPED verifier (dist/verify): 4 positive + 8 negative controls
 *      + 4 envelope experiments, asserting the exact per-claim verdict each MUST produce.
 *
 * No network, no chain, no live state. The signer is an ephemeral in-process Ed25519 keypair, a TEST
 * signer, never saved — so with a pin `integrity` VERIFIES and the sealer is trusted, but the six-claim
 * envelope is NOT covered by the receipt signature, so its attested claims are READ, not re-derived:
 * they surface as NOT_CHECKED unless the caller declares an authenticated channel (envelopeAuthenticated).
 * That downgrade is the whole point this walk guards — a refactor that lets an unauthenticated envelope
 * read as VERIFIED would pass typecheck and lint and silently start over-claiming.
 *
 * Run: `npm run test:trust-cycle` (builds the SDK first). Optional arg: a directory to emit the
 * artifacts into (kept); with no arg it writes to a temp dir and deletes it. Exits non-zero on any
 * mismatch. CI-safe: hermetic and deterministic apart from the ephemeral key (which changes only the
 * signature/hash, never a claim verdict).
 */
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const REPO = dirname(dirname(dirname(fileURLToPath(import.meta.url)))); // tests/e2e/<this> -> repo root
const imp = (p) => import(pathToFileURL(join(REPO, p)).href);
const { decide, policySha256 } = await imp('dist/lib/guardrails.js');
const { kernelCanonicalJson, kernelReceiptHash, KERNEL_RECEIPT_SIGNATURE_DOMAIN } = await imp('dist/lib/kernel-client.js');
const { verifyReceiptOffline, verifyReceiptChain } = await imp('dist/verify/index.js');

const EMIT = process.argv[2]; // optional: keep artifacts here
const OUT = EMIT || mkdtempSync(join(tmpdir(), 'trust-cycle-'));
rmSync(join(OUT, 'outbox'), { recursive: true, force: true });
mkdirSync(join(OUT, 'outbox'), { recursive: true });

const clone = (x) => JSON.parse(JSON.stringify(x));
const GOLDEN = JSON.parse(readFileSync(join(REPO, 'tests/fixtures/kernel-receipt-v2.golden.json'), 'utf8')).decide_response.receipt_preview;

const NOW_S = 1800000000;                       // fixed policy clock
const CREATED_AT = '2026-11-06T00:00:00.000Z';  // fixed receipt timestamp
const OWNER = '0xA1dED137A8afd0EE6c2cFF42d7A292ed77fB1645';

// ── Owner policy: grants the write tool, grants spend but CAPS per-tx at 1,000,000 units ──────────
const policy = { subject: OWNER, actions: ['tool:write-artifact', 'spend'], per_tx_raw: '1000000', daily_raw: '5000000', total_raw: '20000000', expires_at: NOW_S + 30 * 86400, nonce: '1' };
const POLICY_SHA = policySha256(policy);
const spent = { today: 0n, total: 0n };

function runAuthorizedTool() {
  const b = `TrustShell trust-cycle deterministic artifact\nmission=trust-cycle-walk\ncontent=fixed-bytes-v1\n`;
  const p = join(OUT, 'outbox', 'artifact.txt');
  writeFileSync(p, b, { encoding: 'utf8' });
  return { path: p, sha256: '0x' + createHash('sha256').update(b, 'utf8').digest('hex'), bytes: Buffer.byteLength(b) };
}

// Ephemeral TEST signer (engine's exact key derivation).
function newKey() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const publicHex = '0x' + Buffer.from(String(publicKey.export({ format: 'jwk' }).x), 'base64url').toString('hex');
  return { privateKey, publicHex };
}
const KEY = newKey();
const FINGERPRINT = '0x' + createHash('sha256').update(Buffer.from(KEY.publicHex.slice(2), 'hex')).digest('hex');

async function signAsEngine(receipt) {
  const r = clone(receipt);
  r.header.schema = 'kernel-receipt/2';
  r.header.version = 2;
  r.header.signer = { alg: 'ed25519', public_key: KEY.publicHex, fingerprint: FINGERPRINT };
  delete r.header.signature;
  const { receipt_hash: _h, ...header } = r.header;
  r.header.signature = '0x' + sign(null, Buffer.from(KERNEL_RECEIPT_SIGNATURE_DOMAIN + kernelCanonicalJson({ ...r, header }), 'utf8'), KEY.privateKey).toString('hex');
  r.header.receipt_hash = await kernelReceiptHash(r);
  return r;
}

function body({ receipt_id, prev_receipt_id, prev_hash, verdict, reasons, request, checks, executed }) {
  const r = clone(GOLDEN);
  r.header.receipt_id = receipt_id;
  r.header.prev_receipt_id = prev_receipt_id;
  r.header.prev_hash = prev_hash;
  r.header.created_at = CREATED_AT;
  r.header.env = { network: 'base-sepolia', chain_id: 84532, is_simulated: true };
  delete r.header.signer; delete r.header.signature; r.header.receipt_hash = '';
  r.subject.owner = { wallet: OWNER, assurance: null, status: 'resolved' };
  r.request = request;
  r.decision.verdict = verdict;
  r.decision.blocking = verdict === 'DENY';
  r.decision.executed = executed;
  r.decision.reasons = reasons;
  r.decision.checks = checks;
  r.decision.does_not_attest = [];
  r.decision.policy = { policy_hash: POLICY_SHA, signer: null, signature: 'NOT_CHECKED', expires_at: policy.expires_at, revocation: 'NOT_CHECKED' };
  r.decision.limits = { per_tx_raw: policy.per_tx_raw, daily_raw: policy.daily_raw, total_raw: policy.total_raw, effective_per_tx_raw: policy.per_tx_raw, binding_term: 'per_tx' };
  r.decision.laya = { lane: null, mode: 'shadow', consulted: false };
  r.payment = { status: 'NOT_APPLICABLE', scheme: null, amount_raw: null, payer: null, payee: null, authorization_nonce: null, tx_hash: null, block: null, observed_amount_raw: null, settlement_evidence: 'NOT_CHECKED', is_simulated: true };
  r.verification = { status: 'NOT_APPLICABLE', method: null, votes: [], verdict_label: 'PROVISIONAL', settled_by: null, grounded: false, same_domain: false, is_simulated: true, counts_toward_band_restore: false };
  return r;
}

// ── Produce the cycle ─────────────────────────────────────────────────────────────────────────────
const reqA = { tool: 'write-artifact', class: 'other' };
const decA = decide(policy, reqA, spent, NOW_S);
assert.equal(decA.decision, 'ALLOWED', 'request A must be ALLOWED by the owner policy');
const artifact = runAuthorizedTool();
const A = await signAsEngine(body({
  receipt_id: '00000000-0000-4000-8000-0000000ed001', prev_receipt_id: null, prev_hash: null,
  verdict: 'ALLOW', reasons: [], executed: true,
  request: { tool: { name: 'write-artifact', class: 'other' }, origin: 'Cli', args_hash: artifact.sha256, amount_raw: null, payee: null, asset: null, chain_id: null },
  checks: [{ name: 'policy_decide', outcome: 'PASS', source: 'trustshell/guardrails.decide' }, { name: 'artifact_written', outcome: 'PASS', source: 'trust-cycle/authorized-tool' }],
}));

const reqB = { tool: 'x402.pay', class: 'spend', amount_raw: '2000000' };
const decB = decide(policy, reqB, spent, NOW_S);
assert.equal(decB.decision, 'DENIED', 'request B must be DENIED (over the cap)');
assert.ok(decB.reasons.some((r) => /over per_tx_raw/.test(r)), 'B denial must cite the per_tx cap');
const B = await signAsEngine(body({
  receipt_id: '00000000-0000-4000-8000-0000000ed002', prev_receipt_id: A.header.receipt_id, prev_hash: A.header.receipt_hash,
  verdict: 'DENY', reasons: decB.reasons, executed: false,
  request: { tool: { name: 'x402.pay', class: 'spend' }, origin: 'Cli', args_hash: '0x' + '00'.repeat(32), amount_raw: '2000000', payee: '0x000000000000000000000000000000000000dEaD', asset: 'USDC', chain_id: 84532 },
  checks: [{ name: 'policy_decide', outcome: 'FAIL', source: 'trustshell/guardrails.decide' }],
}));

// Six-claim envelopes (the issuer's attestation — here the TEST signer). The envelope is NOT covered by
// the receipt signature, so a VERIFIED here is a READ the verifier must downgrade, not a re-derivation.
const envelope = (rec, claims) => ({
  _type: 'https://in-toto.io/Statement/v1',
  subject: [{ name: `kernel-receipt:${rec.header.receipt_id}`, digest: { keccak256: rec.header.receipt_hash.replace(/^0x/, '').toLowerCase() } }],
  predicateType: 'https://hyperdag.dev/predicates/trust-receipt-six-claims/v1',
  predicate: { claims, what_this_does_not_establish: ['this is a TEST-signer attestation, not a production issuance'] },
});
const envA = envelope(A, { integrity: { status: 'VERIFIED' }, authenticity: { status: 'VERIFIED' }, observation: { status: 'NOT_CHECKED' }, correctness: { status: 'NOT_APPLICABLE' }, authorization: { status: 'VERIFIED' }, containment: { status: 'VERIFIED' } });
const envB = envelope(B, { integrity: { status: 'VERIFIED' }, authenticity: { status: 'NOT_CHECKED' }, observation: { status: 'NOT_CHECKED' }, correctness: { status: 'NOT_APPLICABLE' }, authorization: { status: 'FAILED' }, containment: { status: 'NOT_APPLICABLE' } });

const ROOT = KEY.publicHex;
const WRONG = '0x' + '22'.repeat(32);
const st = (v) => Object.fromEntries(Object.entries(v.claims).map(([k, c]) => [k, c.status]));

// ── Verify through the shipped verifier: 16 experiments ─────────────────────────────────────────────
let fail = 0;
const check = (cond, msg) => { if (cond) { console.log(`  OK   ${msg}`); } else { console.error(`  FAIL ${msg}`); fail++; } };

const v1 = await verifyReceiptOffline(A, { trustedRoots: [ROOT] });
check(v1.claims.integrity.status === 'VERIFIED' && v1.sealer?.trusted === true, '1  ALLOW pinned: integrity VERIFIED, sealer trusted');
check(v1.claims.authorization.status === 'NOT_CHECKED', '1  no envelope: authorization NOT_CHECKED (nothing to read)');

const v2 = await verifyReceiptOffline(A, {});
check(v2.claims.integrity.status === 'VERIFIED' && v2.sealer?.trusted !== true, '2  ALLOW no root: integrity VERIFIED, sealer NOT trusted');

const v3 = await verifyReceiptOffline(B, { trustedRoots: [ROOT] });
check(v3.claims.integrity.status === 'VERIFIED' && B.decision.verdict === 'DENY', '3  DENY pinned: integrity VERIFIED, sealed verdict DENY');

const v4 = await verifyReceiptChain([A, B], { trustedRoots: [ROOT] });
check(v4.chain === 'VERIFIED' && v4.broken_at === null, '4  chain [ALLOW->DENY] pinned: VERIFIED');

const v5 = await verifyReceiptOffline(A, { trustedRoots: [WRONG] });
check(v5.sealer?.trusted !== true, '5  wrong root: sealer NOT trusted');
const t6 = clone(A); t6.decision.verdict = 'DENY';
check((await verifyReceiptOffline(t6, { trustedRoots: [ROOT] })).claims.integrity.status !== 'VERIFIED', '6  verdict flipped: integrity not VERIFIED');
const t7 = clone(A); t7.request.args_hash = '0x' + 'ab'.repeat(32);
check((await verifyReceiptOffline(t7, { trustedRoots: [ROOT] })).claims.integrity.status !== 'VERIFIED', '7  args_hash swapped: integrity not VERIFIED');
const t8 = clone(B); t8.decision.reasons = ['approved after all'];
check((await verifyReceiptOffline(t8, { trustedRoots: [ROOT] })).claims.integrity.status !== 'VERIFIED', '8  refusal reason rewritten: integrity not VERIFIED');
const t9 = clone(A); delete t9.header.signer; delete t9.header.signature; t9.header.schema = 'kernel-receipt/1'; t9.header.version = 1;
check((await verifyReceiptOffline(t9, { trustedRoots: [ROOT] })).sealer?.trusted !== true, '9  downgraded to unsigned /1 under pin: not trusted');
const t10 = clone(A); t10.header.schema = 'kernel-receipt/9';
check((await verifyReceiptOffline(t10, { trustedRoots: [ROOT] })).schema !== 'kernel-receipt/2', '10 unknown schema: not /2');
const c11 = [A, clone(B)]; c11[1].header.prev_hash = '0x' + '11'.repeat(32);
const r11 = await verifyReceiptChain(c11, { trustedRoots: [ROOT] });
check(r11.chain === 'FAILED' && r11.broken_at === 1, '11 broken prev_hash: chain FAILED @1');
const c12 = [A, clone(B)]; c12[1].header.prev_receipt_id = '00000000-0000-4000-8000-00000000dead';
check((await verifyReceiptChain(c12, { trustedRoots: [ROOT] })).chain === 'FAILED', '12 mismatched prev_receipt_id: chain FAILED');

// Envelope experiments — the downgrade this walk exists to guard.
const v13 = await verifyReceiptOffline(A, { trustedRoots: [ROOT], engineEnvelope: envA });
check(v13.reconciliation?.engine_envelope === 'BOUND', '13 bound envelope under pin: engine_envelope BOUND');
check(st(v13).authorization === 'NOT_CHECKED' && st(v13).containment === 'NOT_CHECKED', '13 bound+pinned but UNauthenticated: authorization/containment NOT_CHECKED (read, not verified)');
const v13a = await verifyReceiptOffline(A, { trustedRoots: [ROOT], engineEnvelope: envA, envelopeAuthenticated: true });
check(st(v13a).authorization === 'VERIFIED', '13a authenticated channel + trusted sealer: authorization VERIFIED');
const v14 = await verifyReceiptOffline(A, { engineEnvelope: envA });
check(v14.reconciliation?.engine_envelope === 'BOUND' && st(v14).authorization === 'NOT_CHECKED', '14 bound, no root: authorization NOT_CHECKED (sealer unconfirmed)');
const v15 = await verifyReceiptOffline(B, { trustedRoots: [ROOT], engineEnvelope: envB });
check(st(v15).authorization === 'FAILED', '15 DENY envelope: a self-reported FAILED is surfaced, not downgraded');
const v16 = await verifyReceiptOffline(A, { trustedRoots: [ROOT], engineEnvelope: envB });
check(v16.reconciliation?.engine_envelope === 'PRESENT_UNBOUND' && st(v16).authorization === 'NOT_CHECKED', "16 another receipt's envelope: PRESENT_UNBOUND, authorization NOT_CHECKED");

if (!EMIT) rmSync(OUT, { recursive: true, force: true });
console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}: trust-cycle E2E — ${fail} failure(s)` + (EMIT ? ` (artifacts kept at ${OUT})` : ''));
process.exit(fail === 0 ? 0 : 1);
