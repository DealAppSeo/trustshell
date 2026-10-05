/**
 * Public pages /, /start, /more, and /belts do not name Paris, Rome, or Eiffel.
 *
 * One exception, by decision: the home page is the check form, and its two samples are the
 * sentences a visitor checks (one false, one true). Those two exact sentences, in the hero only,
 * are removed before the scan, so a city named anywhere else on these pages still fails.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const REQUIRED = ['app/page.tsx', 'components/hero.tsx', 'app/start/page.tsx', 'app/start/layout.tsx'];
const WHEN_PRESENT = ['app/more/page.tsx', 'app/belts/page.tsx'];
const HOME_SAMPLES = ['The Eiffel Tower is in Berlin.', 'Paris is the capital of France.'];

describe('public pages omit Paris, Rome, and Eiffel', () => {
  it('fails if those words appear', () => {
    const files = [...REQUIRED, ...WHEN_PRESENT.filter((rel) => existsSync(join(ROOT, rel)))];
    expect(files).toEqual(expect.arrayContaining(REQUIRED));
    for (const rel of files) {
      let text = readFileSync(join(ROOT, rel), 'utf8');
      if (rel === 'components/hero.tsx') {
        for (const sample of HOME_SAMPLES) {
          expect(text).toContain(sample);
          text = text.split(sample).join('');
        }
      }
      expect(text).not.toMatch(/\b(Paris|Rome|Eiffel)\b/);
    }
  });
});
