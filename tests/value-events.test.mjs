import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { logValueEvent } from '../scripts/value-events.mjs';

test('logValueEvent writes register_ok and VETO JSONL; unknown throws', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pai-ve-'));
  try {
    logValueEvent('register_ok', { agentId: 'abc' }, { dir, now: 't0' });
    logValueEvent('VETO', { claim: 'rome' }, { dir, now: 't1' });
    const lines = readFileSync(join(dir, 'value-events.jsonl'), 'utf8').trim().split('\n');
    assert.equal(lines.length, 2);
    assert.deepEqual(JSON.parse(lines[0]), { agentId: 'abc', ts: 't0', event: 'register_ok' });
    assert.deepEqual(JSON.parse(lines[1]), { claim: 'rome', ts: 't1', event: 'VETO' });
    assert.throws(() => logValueEvent('nonsense', {}, { dir }), /unknown event/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
