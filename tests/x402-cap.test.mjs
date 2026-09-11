import assert from 'node:assert/strict';
import test from 'node:test';
import { assertPaymentCap } from '../dist/lib/index.js';

test('cap below amount refuses', () => {
  assert.throws(() => assertPaymentCap({ amount: 1000n, cap: 999n }), /cap_exceeded/);
});

test('cap equal or above allows', () => {
  assert.equal(assertPaymentCap({ amount: 1000n, cap: 1000n }), true);
});
