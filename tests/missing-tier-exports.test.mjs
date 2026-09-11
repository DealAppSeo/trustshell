import assert from 'node:assert/strict';
import test from 'node:test';
import * as sdk from '../dist/lib/index.js';

test('missing exports named: envelope package box vault', () => {
  const missing = ['envelope', 'package', 'box', 'vault'].filter((n) => typeof sdk[n] !== 'function');
  assert.deepEqual(missing, ['envelope', 'package', 'box', 'vault']);
});
