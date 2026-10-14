/**
 * Every page on the six-stage journey strip names itself in the browser tab. /spend did not: it is a
 * client page, so it cannot export metadata, and it had no layout.tsx to do it for it, so a stranger's
 * tab read the generic site title on that one step [seen live 2026-10-14]. The pages are read from the
 * strip itself, so a new stage is covered without editing this test.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const strip = readFileSync(join(ROOT, 'components/journey-steps.tsx'), 'utf8');
const hrefs = [...strip.matchAll(/href:\s*'(\/[a-z-]+)'/g)].map((m) => m[1] as string);

describe('journey pages set their own title', () => {
  it('reads the stages from the strip', () => {
    expect(hrefs.length).toBeGreaterThanOrEqual(6);
  });

  it.each(hrefs)('%s', (href) => {
    const dir = join(ROOT, 'app', href.slice(1));
    const titled = ['page.tsx', 'layout.tsx'].some((f) => {
      const p = join(dir, f);
      return existsSync(p) && /export const metadata[\s\S]*?title:\s*['"`][^'"`]+['"`]/.test(readFileSync(p, 'utf8'));
    });
    expect(titled).toBe(true);
  });
});
