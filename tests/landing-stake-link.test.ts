import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { linksForLanding } from '../lib/landing-nav';

const ROOT = join(__dirname, '..');
const LINKS = [
  { href: '/market', label: 'Market' },
  { href: '/stake', label: 'Stake' },
  { href: '/bind', label: 'Claim' },
];

describe('landing does not link stake', () => {
  it('drops the stake link on / and keeps it everywhere else', () => {
    expect(linksForLanding('/', LINKS).map((l) => l.href)).toEqual(['/market', '/bind']);
    expect(linksForLanding('/', [{ href: '/go', label: 'stake now' }])).toEqual([]);
    expect(linksForLanding('/stake', LINKS).map((l) => l.href)).toEqual(['/market', '/stake', '/bind']);
  });

  it('the landing sources do not say stake now or point at /stake', () => {
    for (const rel of [
      'app/page.tsx',
      'components/hero.tsx',
      'components/landing-close.tsx',
      'components/after-agent.tsx',
    ]) {
      const text = readFileSync(join(ROOT, rel), 'utf8');
      expect(text).not.toMatch(/stake now/i);
      expect(text).not.toMatch(/href=["']\/stake["']/);
    }
    const nav = readFileSync(join(ROOT, 'components/top-nav.tsx'), 'utf8');
    expect(nav).toContain('linksForLanding');
  });
});
