/**
 * The landing hero does not name a PAI or a CMO belt.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const hero = readFileSync(join(__dirname, '../components/hero.tsx'), 'utf8');

describe('hero copy', () => {
  it('fails if the hero names a PAI or a CMO belt', () => {
    expect(hero).not.toContain('PAI');
    expect(hero).not.toContain('CMO belt');
    expect(hero).toContain('AI sounds sure. It is often wrong.');
    expect(hero).toContain('Now it has to show its work.');
    expect(hero).not.toContain('AI lies. Now it has to show its work.');
    expect(hero).not.toContain('Get a receipt');
  });
});
