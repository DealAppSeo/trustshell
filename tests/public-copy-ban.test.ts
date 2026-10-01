/**
 * Landing, /start, and the README share one ban.
 * The hero lines stay the first screen.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const BANNED = ['stake now', 'staking is live', 'every transaction earns RepID'];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (/\.(tsx|md)$/.test(entry.name)) out.push(path);
  }
  return out;
}

describe('public copy ban', () => {
  it('bans stake claims on landing, /start, and the README, and keeps the hero', () => {
    const files = [
      join(ROOT, 'app/page.tsx'),
      join(ROOT, 'components/hero.tsx'),
      ...walk(join(ROOT, 'app/start')),
      join(ROOT, 'README.md'),
    ];
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8').toLowerCase();
      for (const phrase of BANNED) {
        if (text.includes(phrase.toLowerCase())) hits.push(`${file} :: ${phrase}`);
      }
    }
    expect(hits).toEqual([]);
    const hero = readFileSync(join(ROOT, 'components/hero.tsx'), 'utf8');
    expect(hero).toContain('A portable trust harness. Autonomy is earned.');
    expect(hero).toContain('Check a claim. See the receipt. Keep your keys.');
  });
});
