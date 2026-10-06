/**
 * /, /more, /why, /start, and /belts contain none of the banned words.
 *
 * No exception any more: the home page's samples used to be two city sentences and were exempted.
 * They are now measured traps (lib/home-samples.ts), so the hero is scanned like every other page.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const FILES = [
  'app/page.tsx',
  'components/hero.tsx',
  'app/more/page.tsx',
  'app/why/page.tsx',
  'app/why/cost/page.tsx',
  'app/why/blame/page.tsx',
  'app/why/harness/page.tsx',
  'components/home-questions.tsx',
  'components/why-article.tsx',
  'lib/why-questions.ts',
  'app/start/page.tsx',
  'app/start/layout.tsx',
  'app/belts/page.tsx',
];
const BANNED = ['paris', 'rome', 'eiffel', 'zk', 'stake', 'plonky', 'sqlite'];

describe('public pages omit demo cities and engine jargon', () => {
  it('fails if Paris, Rome, Eiffel, zk, stake, plonky, or sqlite appear', () => {
    for (const rel of FILES) {
      const raw = readFileSync(join(ROOT, rel), 'utf8').replace(/\r/g, '');
      const text = raw.toLowerCase();
      for (const word of BANNED) {
        expect({ file: rel, word, hit: text.includes(word) }).toEqual({ file: rel, word, hit: false });
      }
    }
  });
});
