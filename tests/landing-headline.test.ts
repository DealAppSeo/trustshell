/**
 * The landing hero headline is the first-screen line.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const hero = readFileSync(join(__dirname, '../components/hero.tsx'), 'utf8');

describe('landing headline', () => {
  it('fails if the hero h1 is not the first-screen line', () => {
    const h1 = hero.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/);
    expect(h1).not.toBeNull();
    expect(h1?.[1] ?? '').toMatch(/A portable trust harness\. Autonomy is earned\./);
    expect(hero).toContain('Check a claim. See the receipt. Keep your keys.');
    expect(h1?.[1] ?? '').not.toMatch(/stake now/i);
    expect(hero).not.toMatch(/every transaction earns RepID/i);
    expect(h1?.[1] ?? '').not.toMatch(/VETO/);
  });
});
