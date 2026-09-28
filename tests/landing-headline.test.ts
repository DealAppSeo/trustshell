/**
 * The landing hero must say Autonomy is earned.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const hero = readFileSync(join(__dirname, '../components/hero.tsx'), 'utf8');

describe('landing headline', () => {
  it('fails if the hero lacks Autonomy is earned', () => {
    const h1 = hero.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/);
    expect(h1).not.toBeNull();
    expect(h1?.[1] ?? '').toMatch(/Autonomy is earned/);
    expect(h1?.[1] ?? '').not.toMatch(/stake now/i);
  });
});
