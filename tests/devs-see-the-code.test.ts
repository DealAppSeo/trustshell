/**
 * The GitHub control lives only on /devs, and its visible label is See the code.
 * It is not a login and not OAuth.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const LABEL = 'See the code';
const DEV_PAGE = 'app/devs/page.tsx';

function walkTsx(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      walkTsx(abs, acc);
    } else if (name.endsWith('.tsx')) {
      acc.push(abs);
    }
  }
  return acc;
}

describe('See the code lives only on /devs', () => {
  it('is one link, not login or OAuth, and nowhere else', () => {
    const page = readFileSync(join(ROOT, DEV_PAGE), 'utf8');
    expect(page.split(LABEL).length - 1).toBe(1);
    expect(page).toContain('href="https://github.com/DealAppSeo/trustshell"');
    expect(page).not.toMatch(/oauth/i);
    expect(page).not.toMatch(/sign in|log in|\blogin\b/i);
    expect(page).not.toMatch(/HeyGen/i);
    expect(page).not.toMatch(/REAL_STAKING/);
    expect(page).not.toMatch(/stake now/i);

    const files = [...walkTsx(join(ROOT, 'app')), ...walkTsx(join(ROOT, 'components'))];
    const offenders = files.filter((abs) => {
      const rel = abs.slice(ROOT.length + 1).replace(/\\/g, '/');
      if (rel === DEV_PAGE) return false;
      return readFileSync(abs, 'utf8').includes(LABEL);
    });
    expect(offenders).toEqual([]);
  });
});
