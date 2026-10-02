/**
 * None of the three belt pages contain stake now.
 */
export {};

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PAGES = ['cmo.html', 'cto.html', 'cfo.html'];

describe('public belts', () => {
  it('none of the three pages contain stake now', () => {
    for (const name of PAGES) {
      const html = readFileSync(join(__dirname, '../public/belts', name), 'utf8').toLowerCase();
      expect(html).not.toContain('stake');
    }
  });
});
