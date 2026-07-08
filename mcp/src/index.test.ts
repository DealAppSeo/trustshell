/**
 * Unit tests for the money-safety + config helpers in index.ts.
 *
 * These are PURE functions (no network, no wallet) that gate the buy_service money path and the
 * TRUSTSHELL_API_URL fail-fast. Run:  npm run build && npm test   (from mcp/)
 *
 * Uses Node's built-in test runner (node --test) — no extra dependency.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPaymentSafe, resolveApiUrl } from './index.js';

const GOOD_ADDR = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

test('checkPaymentSafe: accepts a quote at the listed price to a valid address', () => {
  const r = checkPaymentSafe(100000, undefined, 100000, GOOD_ADDR);
  assert.equal(r.ok, true);
});

test('checkPaymentSafe: accepts a quote BELOW the listed price', () => {
  const r = checkPaymentSafe(100000, undefined, 50000, GOOD_ADDR);
  assert.equal(r.ok, true);
});

test('checkPaymentSafe: REJECTS a quote above the listed price (double/over-charge)', () => {
  const r = checkPaymentSafe(100000, undefined, 100001, GOOD_ADDR);
  assert.equal(r.ok, false);
  assert.match((r as { reason: string }).reason, /exceeds the authorized price/);
});

test('checkPaymentSafe: REJECTS when caller agreed a price above the listing', () => {
  const r = checkPaymentSafe(100000, 200000, 100000, GOOD_ADDR);
  assert.equal(r.ok, false);
  assert.match((r as { reason: string }).reason, /exceeds the listed price/);
});

test('checkPaymentSafe: honors a LOWER agreed price as the ceiling', () => {
  // agreed 50000, backend quotes 80000 -> above the agreed ceiling -> reject
  const r = checkPaymentSafe(100000, 50000, 80000, GOOD_ADDR);
  assert.equal(r.ok, false);
  assert.match((r as { reason: string }).reason, /exceeds the authorized price 50000/);
});

test('checkPaymentSafe: REJECTS a malformed / unexpected payTo address', () => {
  assert.equal(checkPaymentSafe(100000, undefined, 100000, 'not-an-address').ok, false);
  assert.equal(checkPaymentSafe(100000, undefined, 100000, '0x1234').ok, false);
  assert.equal(checkPaymentSafe(100000, undefined, 100000, undefined).ok, false);
});

test('checkPaymentSafe: REJECTS a non-positive / unparseable quoted amount', () => {
  assert.equal(checkPaymentSafe(100000, undefined, 0, GOOD_ADDR).ok, false);
  assert.equal(checkPaymentSafe(100000, undefined, 'abc', GOOD_ADDR).ok, false);
});

test('checkPaymentSafe: parses a numeric-string amount from the 402 requirements', () => {
  const r = checkPaymentSafe(100000, undefined, '100000', GOOD_ADDR);
  assert.equal(r.ok, true);
});

test('resolveApiUrl: defaults when unset', () => {
  assert.equal(resolveApiUrl(undefined), 'https://repid-engine-production.up.railway.app');
});

test('resolveApiUrl: strips trailing slashes on a valid override', () => {
  assert.equal(resolveApiUrl('https://example.com/'), 'https://example.com');
});

test('resolveApiUrl: THROWS on a non-URL (fail-fast, not opaque per-call)', () => {
  assert.throws(() => resolveApiUrl('not a url'), /not a valid URL/);
});

test('resolveApiUrl: THROWS on a non-http(s) scheme', () => {
  assert.throws(() => resolveApiUrl('ftp://example.com'), /must use http\/https/);
});
