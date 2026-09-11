import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseAnswers, parseArgv, toolPack, QUESTIONS } = require('../lib/interview.js');

test('caps answers at 3 — a fourth pipe is ignored', () => {
  assert.deepEqual(parseAnswers('a|b|c|d'), ['a', 'b', 'c']);
  assert.equal(QUESTIONS.length, 3);
});

test('parseArgv --name and --answers', () => {
  const r = parseArgv(['node', 'init-pai.mjs', '--name', 'pai-night-1', '--answers', 'write weekly research|wasted hours|grok']);
  assert.equal(r.name, 'pai-night-1');
  assert.deepEqual(r.answers, ['write weekly research', 'wasted hours', 'grok']);
});

test('toolPack always verify + present_proof; pay/market adds x402-cap', () => {
  assert.deepEqual(toolPack('write weekly research'), ['verify', 'present_proof']);
  assert.deepEqual(toolPack('pay invoices on the market'), ['verify', 'present_proof', 'x402-cap']);
});
