/**
 * The default panel on "/" is the hero return before either reveal.
 * Install, verify your own claim, then copy the family host verdict line.
 * No memory.sqlite.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const hero = readFileSync(join(__dirname, '../components/hero.tsx'), 'utf8').replace(/\r/g, '');

describe('home default panel', () => {
  it('shows install, verify, and the family host line before a panel opens', () => {
    expect(hero).toContain("useState<'mcp' | 'terminal' | null>(null)");
    const start = hero.indexOf('return (');
    const end = hero.indexOf("{panel === 'mcp' ?");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const idle = hero.slice(start, end);
    const commands = idle.indexOf('{FIRST_COMMANDS}');
    const copy = idle.indexOf('After verify, copy the family host verdict line.');
    const chat = idle.indexOf('Check a claim in the chat you already use');
    expect(idle).not.toContain('PAI');
    expect(idle).not.toContain('CMO belt');
    expect(commands).toBeGreaterThan(-1);
    expect(copy).toBeGreaterThan(commands);
    expect(chat).toBeGreaterThan(copy);
    const first = hero.match(/const FIRST_COMMANDS = `([\s\S]*?)`;/);
    expect(first?.[1].replace(/\r/g, '').split('\n')).toEqual([
      'npm i -g @hyperdag/trustshell@1.5.0',
      'trustshell verify "paste your own claim"',
      'trustshell repid trinity-shofet',
    ]);
    expect(idle).not.toMatch(/memory\.sqlite/);
    expect(idle).not.toMatch(/Startup|Enterprise/);
    expect(idle).not.toMatch(/stake now/i);
    expect(idle).not.toMatch(/<input/);
    expect(hero).not.toMatch(/memory\.sqlite/);
    expect(hero).not.toMatch(/Startup|Enterprise/);
  });
});
