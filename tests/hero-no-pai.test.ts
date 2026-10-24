/**
 * The landing hero does not name a PAI or a CMO belt.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const hero = readFileSync(join(__dirname, '../app/page.tsx'), 'utf8');

describe('hero copy', () => {
  it('fails if the hero names a PAI or a CMO belt', () => {
    expect(hero).not.toContain('PAI');
    expect(hero).not.toContain('CMO belt');
    expect(hero).toContain('Check what your AI agent did, not what it says it did.');
    expect(hero).not.toContain('Get a receipt');
  });
});
