/**
 * /devs links to /builders as Builders. That label is on no other page.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const LABEL = 'Builders';
const devs = readFileSync(join(ROOT, 'app/devs/page.tsx'), 'utf8').replace(/\r/g, '');

function walkTsx(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walkTsx(abs, acc);
    else if (name.endsWith('.tsx')) acc.push(abs);
  }
  return acc;
}

describe('Builders link', () => {
  it('lives on /devs and on no other page', () => {
    expect(devs).toContain('href="/builders"');
    expect(devs).toMatch(/>\s*Builders\s*</);
    expect(devs.split(LABEL).length - 1).toBe(1);

    const offenders = [...walkTsx(join(ROOT, 'app')), ...walkTsx(join(ROOT, 'components'))].filter((abs) => {
      const rel = abs.slice(ROOT.length + 1).replace(/\\/g, '/');
      if (rel === 'app/devs/page.tsx') return false;
      return readFileSync(abs, 'utf8').includes(LABEL);
    });
    expect(offenders).toEqual([]);
  });
});
