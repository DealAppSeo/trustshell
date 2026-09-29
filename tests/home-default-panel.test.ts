/**
 * The default panel on "/" is the hero return before either reveal.
 * It has no npm and no memory.sqlite.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const hero = readFileSync(join(__dirname, '../components/hero.tsx'), 'utf8').replace(/\r/g, '');

describe('home default panel', () => {
  it('has no npm and no memory.sqlite before a panel opens', () => {
    expect(hero).toContain("useState<'mcp' | 'terminal' | null>(null)");
    const start = hero.indexOf('return (');
    const end = hero.indexOf("{panel === 'mcp'");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const idle = hero.slice(start, end);
    expect(idle).not.toMatch(/npm/);
    expect(idle).not.toMatch(/memory\.sqlite/);
    expect(hero).not.toMatch(/memory\.sqlite/);
  });
});
