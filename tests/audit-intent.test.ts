import { mkdtempSync, readFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { auditThenAct } from '../src/lib/index';

const INTENT = { origin: 'Cli' as const, amount: 5, cap: 10, agentId: 'trinity-test' };

describe('auditThenAct — audit before act; missing policy refuses', () => {
  it('REFUSES a missing policy, never acts, but records the intent row first', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pai-ai-'));
    try {
      let acted = false;
      await expect(
        auditThenAct(INTENT, undefined, async () => { acted = true; }, { dir, now: 't0' }),
      ).rejects.toThrow(/policy_required/);
      expect(acted).toBe(false);
      const lines = readFileSync(join(dir, 'value-events.jsonl'), 'utf8').trim().split('\n');
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0])).toEqual({
        origin: 'Cli', amount: 5, cap: 10, agentId: 'trinity-test', ts: 't0', event: 'intent',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('REFUSES a denying policy', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pai-ai-'));
    try {
      await expect(
        auditThenAct(INTENT, { allow: false, reason: 'over budget' }, async () => 'signed', { dir, now: 't1' }),
      ).rejects.toThrow(/policy_denied: over budget/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('runs act under an allowing policy, after the intent row', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pai-ai-'));
    try {
      const out = await auditThenAct(INTENT, { allow: true }, async () => 'signed', { dir, now: 't2' });
      expect(out).toBe('signed');
      expect(existsSync(join(dir, 'value-events.jsonl'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
