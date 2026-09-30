/**
 * /builders contains none of the banned words.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const page = readFileSync(join(__dirname, '../app/builders/page.tsx'), 'utf8').replace(/\r/g, '').toLowerCase();
const BANNED = ['paris', 'rome', 'eiffel', 'zk', 'stake', 'plonky', 'sqlite'];

describe('/builders banned words', () => {
  it('fails if Paris, Rome, Eiffel, zk, stake, plonky, or sqlite appear', () => {
    for (const word of BANNED) {
      expect({ word, hit: page.includes(word) }).toEqual({ word, hit: false });
    }
  });
});
