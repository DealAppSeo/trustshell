/**
 * /, /more, and /why contain none of Paris, Rome, Eiffel, zk, stake, or plonky.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const FILES = ['app/page.tsx', 'components/hero.tsx', 'app/more/page.tsx', 'app/why/page.tsx'];
const BANNED = ['paris', 'rome', 'eiffel', 'zk', 'stake', 'plonky'];

describe('/, /more, and /why', () => {
  it('contains none of Paris, Rome, Eiffel, zk, stake, or plonky', () => {
    for (const rel of FILES) {
      const text = readFileSync(join(ROOT, rel), 'utf8').toLowerCase();
      for (const word of BANNED) {
        expect(text).not.toContain(word);
      }
    }
  });
});
