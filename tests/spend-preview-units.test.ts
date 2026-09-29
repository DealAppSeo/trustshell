/**
 * 50 or 100 USDC previews as eth and cbbtc numbers. Nothing is sent.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spendPreviewUnits } from '../src/lib/spend-preview-units';

const src = readFileSync(join(__dirname, '../src/lib/spend-preview-units.ts'), 'utf8');

describe('spend preview units', () => {
  const prevFetch = global.fetch;

  afterEach(() => {
    global.fetch = prevFetch;
  });

  it('returns eth and cbbtc as numbers and does not send', () => {
    const calls: string[] = [];
    global.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      throw new Error('send');
    }) as typeof fetch;
    expect(src).not.toMatch(/fetch\(|buildX402Payment|sendTransaction|https?:\/\//);
    expect(src).not.toMatch(/stake live|stake now/i);

    const fifty = spendPreviewUnits(50);
    const hundred = spendPreviewUnits(100);
    expect(typeof fifty.eth).toBe('number');
    expect(typeof fifty.cbbtc).toBe('number');
    expect(typeof hundred.eth).toBe('number');
    expect(typeof hundred.cbbtc).toBe('number');
    expect(fifty).toEqual({ eth: 50000, cbbtc: 500 });
    expect(hundred).toEqual({ eth: 100000, cbbtc: 1000 });
    expect(hundred.eth).toBe(fifty.eth * 2);
    expect(hundred.cbbtc).toBe(fifty.cbbtc * 2);
    expect(calls).toEqual([]);
    expect(() => spendPreviewUnits(49)).toThrow(/50 or 100/);
  });
});
