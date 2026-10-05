/**
 * Public pages /, /start, /more, and /belts do not name Paris, Rome, or Eiffel.
 *
 * No exception any more: until 2026-10-05 the home page's two check samples were a city lab
 * fixture and were exempted. They are now measured traps people actually fall into
 * (lib/home-samples.ts), so the hero is held to the same rule as every other page.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const REQUIRED = ['app/page.tsx', 'components/hero.tsx', 'app/start/page.tsx', 'app/start/layout.tsx'];
const WHEN_PRESENT = ['app/more/page.tsx', 'app/belts/page.tsx'];

describe('public pages omit Paris, Rome, and Eiffel', () => {
  it('fails if those words appear', () => {
    const files = [...REQUIRED, ...WHEN_PRESENT.filter((rel) => existsSync(join(ROOT, rel)))];
    expect(files).toEqual(expect.arrayContaining(REQUIRED));
    for (const rel of files) {
      const text = readFileSync(join(ROOT, rel), 'utf8');
      expect(text).not.toMatch(/\b(Paris|Rome|Eiffel)\b/);
    }
  });
});
