/**
 * Spend preview shows 50 or 100 and does not send.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spendPreview } from '../src/lib/spend-preview';

const src = readFileSync(join(__dirname, '../src/lib/spend-preview.ts'), 'utf8');

describe('spend preview', () => {
  const prevFetch = global.fetch;

  afterEach(() => {
    global.fetch = prevFetch;
  });

  it('returns 50 and 100 as numbers and does not send', () => {
    const calls: string[] = [];
    global.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      throw new Error('send');
    }) as typeof fetch;

    expect(src).not.toMatch(/fetch\(|buildX402Payment|sendTransaction|https?:\/\//);

    for (const amount of [50, 100] as const) {
      const preview = spendPreview(amount);
      expect(preview.amount).toBe(amount);
      expect(typeof preview.amount).toBe('number');
      expect(preview.send).toBe(false);
    }
    expect(calls).toEqual([]);
    expect(() => spendPreview(49)).toThrow(/50 or 100/);
  });
});
