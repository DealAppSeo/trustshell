/**
 * Public pages /, /start, /more, and /belts do not name Paris, Rome, or Eiffel.
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
