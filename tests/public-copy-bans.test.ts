/**
 * /, /more, /why, /start, and /belts contain none of the banned words.
 *
 * One exception, by decision: the home page's two check samples (one false, one true) are the
 * sentences a visitor checks. Those two exact sentences, in the hero only, are removed before the
 * scan; every other mention of a banned word still fails.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const FILES = [
  'app/page.tsx',
  'components/hero.tsx',
  'app/more/page.tsx',
  'app/why/page.tsx',
  'app/start/page.tsx',
  'app/start/layout.tsx',
  'app/belts/page.tsx',
];
const BANNED = ['paris', 'rome', 'eiffel', 'zk', 'stake', 'plonky', 'sqlite'];
const HOME_SAMPLES = ['The Eiffel Tower is in Berlin.', 'Paris is the capital of France.'];

describe('public pages omit demo cities and engine jargon', () => {
  it('fails if Paris, Rome, Eiffel, zk, stake, plonky, or sqlite appear', () => {
    for (const rel of FILES) {
      let raw = readFileSync(join(ROOT, rel), 'utf8').replace(/\r/g, '');
      if (rel === 'components/hero.tsx') for (const sample of HOME_SAMPLES) raw = raw.split(sample).join('');
      const text = raw.toLowerCase();
      for (const word of BANNED) {
        expect({ file: rel, word, hit: text.includes(word) }).toEqual({ file: rel, word, hit: false });
      }
    }
  });
});
