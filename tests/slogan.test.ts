import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const COPY = [
  'components/hero.tsx',
  'components/landing-close.tsx',
  'app/page.tsx',
  'app/start/page.tsx',
  'README.md',
];

/** A line that says staking is live, or that TrustShell says VETO, is a slogan. A negation is not. */
export function spokenAsSlogan(line: string): boolean {
  if (/\b(?:not|no|never|n't)\b/i.test(line)) return false;
  if (/\bstaking is live\b/i.test(line)) return true;
  return /TrustShell says VETO/i.test(line);
}

describe('copy slogans', () => {
  it('fails if copy says staking is live or TrustShell says VETO', () => {
    expect(spokenAsSlogan('staking is live')).toBe(true);
    expect(spokenAsSlogan('TrustShell says VETO')).toBe(true);
    expect(spokenAsSlogan('Staking is not live')).toBe(false);
    expect(spokenAsSlogan('do not say TrustShell says VETO')).toBe(false);
    for (const rel of COPY) {
      const text = readFileSync(join(ROOT, rel), 'utf8');
      const hits = text.split('\n').filter((line) => spokenAsSlogan(line));
      expect(hits).toEqual([]);
    }
  });
});
