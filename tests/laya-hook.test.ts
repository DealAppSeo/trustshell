import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { layaHook, layaRecords } from '../src/laya/hook';

describe('laya hook', () => {
  it('records cheap, escalate, or ask and does not call HAL', () => {
    const src = readFileSync(join(__dirname, '../src/laya/hook.ts'), 'utf8');
    expect(src.split(/\r?\n/).filter((line) => line.length > 0).length).toBeLessThanOrEqual(20);
    expect(src).not.toMatch(/fetch\(|\/api\/v1\/hal|honesty-a|factCheck/);
    expect(layaHook('cheap')).toEqual({ classify: 'cheap' });
    expect(layaHook('escalate')).toEqual({ classify: 'escalate' });
    expect(layaHook('ask')).toEqual({ classify: 'ask' });
    expect(layaRecords().map((row) => row.classify)).toEqual(['cheap', 'escalate', 'ask']);
  });
});
