import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReceipt, validateReceipt } from '../scripts/write-receipt.mjs';

// The receipt shape shared with scripts/safety-glass.mjs, plus the `cap` block.
const sample = () => buildReceipt({
  agent: 'trinity-shofet',
  hal: { verdict: 'PASS', trustScore: 0.98, evidence: [] },
  repid: { score: 2150, tier: 'ESTABLISHED' },
  onchain: { tx: '0xa9a17329b6cc4c7eb6bfbba547f076687c64512f084422258041d603ffda5c95' },
  proof: { scheme: 'plonky3_range_check', verified: true },
  cap: { limit: 1000, amount: 5, currency: 'USDC', enforced: true },
});

test('a safety-glass-shaped receipt with cap validates', () => {
  assert.deepEqual(validateReceipt(sample()), { valid: true, errors: [] });
});

test('each required field (hal, repid, tx, proof.verified, cap) is enforced', () => {
  for (const drop of [
    (r) => delete r.hal,
    (r) => delete r.repid,
    (r) => delete r.onchain.tx,
    (r) => delete r.proof.verified,
    (r) => delete r.cap,
  ]) {
    const r = sample(); drop(r);
    assert.equal(validateReceipt(r).valid, false, 'missing required field must fail');
  }
});

test('bad verdict, non-0x tx, exceeded cap, non-finite amounts, missing currency all fail', () => {
  const bads = [
    (r) => { r.hal.verdict = 'MAYBE'; },
    (r) => { r.onchain.tx = 'nope'; },
    (r) => { r.cap.amount = 2000; },        // > limit while enforced
    (r) => { r.cap.limit = Infinity; },     // non-finite cap (Greptile #1)
    (r) => { r.cap.amount = NaN; },         // non-finite amount
    (r) => { delete r.cap.currency; },      // currency now required (Greptile #2)
  ];
  for (const mutate of bads) {
    const r = sample(); mutate(r);
    assert.equal(validateReceipt(r).valid, false);
  }
});

test('a null proof.scheme validates (safety-glass may copy a null scheme) — Greptile #3', () => {
  const r = sample(); r.proof.scheme = null;
  assert.equal(validateReceipt(r).valid, true);
});

test('a union type still type-checks — non-string non-null scheme fails (Greptile: union bypass)', () => {
  const r = sample(); r.proof.scheme = 123;
  assert.equal(validateReceipt(r).valid, false);
});
