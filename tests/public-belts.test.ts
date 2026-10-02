/**
 * None of the three belt pages contain stake now.
 * A plain 'stake' substring missed 'staking' and 'REAL_STAKING' (neither contains 'stake'),
 * so a page saying "Staking is live" passed. Match the stem.
 */
export {};

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PAGES = ['cmo.html', 'cto.html', 'cfo.html'];
const STAKE = /(^|[^a-z])stak(e|ed|es|ing)\b/i;

describe('public belts', () => {
  it('none of the three pages contain stake now', () => {
    for (const name of PAGES) {
      const html = readFileSync(join(__dirname, '../public/belts', name), 'utf8');
      expect(html).not.toMatch(STAKE);
    }
  });

  it('the guard catches staking and REAL_STAKING, not only stake', () => {
    for (const text of ['Staking is live.', 'REAL_STAKING=1', 'a stake now', 'staked funds']) {
      expect(text).toMatch(STAKE);
    }
    expect('mistakes happen').not.toMatch(STAKE);
  });
});
