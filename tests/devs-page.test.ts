import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const hero = readFileSync(join(ROOT, 'components/hero.tsx'), 'utf8').replace(/\r/g, '');
const devs = readFileSync(join(ROOT, 'app/devs/page.tsx'), 'utf8').replace(/\r/g, '');
const nav = readFileSync(join(ROOT, 'components/top-nav.tsx'), 'utf8');
const footer = readFileSync(join(ROOT, 'components/footer.tsx'), 'utf8');
const home = readFileSync(join(ROOT, 'app/page.tsx'), 'utf8');

describe('/devs', () => {
  it('is linked only from the terminal panel', () => {
    const termAt = hero.indexOf("{panel === 'terminal'");
    expect(termAt).toBeGreaterThan(-1);
    expect(hero.slice(0, termAt)).not.toContain('/devs');
    expect(hero.slice(termAt).match(/href="\/devs"/g)).toEqual(['href="/devs"']);
    expect(nav).not.toContain('/devs');
    expect(footer).not.toContain('/devs');
    expect(home).not.toContain('/devs');
  });

  it('lists the two repos and does not say stake now', () => {
    expect(devs).toContain('DealAppSeo/trustshell');
    expect(devs).toContain('DealAppSeo/repid-engine');
    expect(devs).not.toMatch(/stake now/i);
    expect(devs).not.toMatch(/HeyGen/i);
  });
});
