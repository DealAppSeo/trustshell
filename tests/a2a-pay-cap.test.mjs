/**
 * Missing TRUSTSHELL_PAY_CAP must not sign.
 * Run: node --test tests/a2a-pay-cap.test.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { requirePayCap, PAY_CAP_MISSING } from '../examples/a2a-purchase/require-pay-cap.mjs';

test('missing TRUSTSHELL_PAY_CAP does not sign', () => {
  const r = requirePayCap({});
  assert.equal(r.ok, false);
  assert.equal(r.message, PAY_CAP_MISSING);
});

test('empty TRUSTSHELL_PAY_CAP does not sign', () => {
  const r = requirePayCap({ TRUSTSHELL_PAY_CAP: '  ' });
  assert.equal(r.ok, false);
});

test('set TRUSTSHELL_PAY_CAP is used as-is (not listing price)', () => {
  const r = requirePayCap({ TRUSTSHELL_PAY_CAP: '1000000' });
  assert.equal(r.ok, true);
  assert.equal(r.cap, '1000000');
});
