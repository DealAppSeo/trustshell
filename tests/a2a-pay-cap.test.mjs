/**
 * Missing TRUSTSHELL_PAY_CAP must not sign.
 * Run: node --test tests/a2a-pay-cap.test.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { requirePayCap, refuseOverCap, PAY_CAP_MISSING, CAP_EXCEEDED } from '../examples/a2a-purchase/require-pay-cap.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const overCapScript = join(here, '..', 'examples', 'a2a-purchase', 'over-cap.mjs');

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

test('amount above cap refuses — does not sign', () => {
  const r = refuseOverCap(501, 500);
  assert.equal(r.ok, false);
  assert.equal(r.message, CAP_EXCEEDED);
});

test('amount at cap is allowed (still no sign in over-cap.mjs)', () => {
  assert.equal(refuseOverCap(500, 500).ok, true);
});

test('over-cap.mjs exits 1 when amount > cap', () => {
  const r = spawnSync(process.execPath, [overCapScript], {
    env: { ...process.env, TRUSTSHELL_PAY_CAP: '500', TRUSTSHELL_AMOUNT: '501' },
    encoding: 'utf8',
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /cap_exceeded/);
});

test('over-cap.mjs exits 1 when cap is missing', () => {
  const env = { ...process.env };
  delete env.TRUSTSHELL_PAY_CAP;
  const r = spawnSync(process.execPath, [overCapScript], {
    env: { ...env, TRUSTSHELL_AMOUNT: '1' },
    encoding: 'utf8',
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /TRUSTSHELL_PAY_CAP/);
});
