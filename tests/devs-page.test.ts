import { readdirSync, readFileSync, statSync } from 'node:fs';
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

  it('says the two sentences, then See the code for trustshell only', () => {
    const lines = [
      'Terminal is a text window that runs a command.',
      'GitHub is undo-history for a project you can share.',
      'See the code',
    ];
    let at = -1;
    for (const line of lines) {
      const next = devs.indexOf(line);
      expect(next).toBeGreaterThan(at);
      at = next;
    }
    expect(devs.split('See the code').length - 1).toBe(1);
    expect(devs).toContain('href="https://github.com/DealAppSeo/trustshell"');
    expect(devs).not.toContain('repid-engine');
    expect(devs).not.toMatch(/oauth/i);
    expect(devs).not.toMatch(/sign in|log in|\blogin\b/i);
    expect(devs).not.toMatch(/stake now/i);
    expect(devs).not.toMatch(/HeyGen/i);
    expect(devs).not.toMatch(/REAL_STAKING/);
  });

  it('puts See the code on no other page', () => {
    const offenders = [...walkTsx(join(ROOT, 'app')), ...walkTsx(join(ROOT, 'components'))].filter((abs) => {
      const rel = abs.slice(ROOT.length + 1).replace(/\\/g, '/');
      if (rel === 'app/devs/page.tsx') return false;
      return readFileSync(abs, 'utf8').includes('See the code');
    });
    expect(offenders).toEqual([]);
  });
});

function walkTsx(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walkTsx(abs, acc);
    else if (name.endsWith('.tsx')) acc.push(abs);
  }
  return acc;
}
