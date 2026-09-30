/**
 * /more source has none of: zk, stake, ERC-8004, plonky, sqlite.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const page = readFileSync(join(__dirname, '../app/more/page.tsx'), 'utf8').replace(/\r/g, '');

const BANNED = ['zk', 'stake', 'ERC-8004', 'plonky', 'sqlite'];

describe('/more source', () => {
  it('has none of zk, stake, ERC-8004, plonky, or sqlite', () => {
    const lower = page.toLowerCase();
    for (const word of BANNED) {
      expect(lower).not.toContain(word.toLowerCase());
    }
  });
});
