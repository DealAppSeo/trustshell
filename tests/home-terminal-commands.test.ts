/**
 * "I have a terminal" reveals the four commands, including trustshell status.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const hero = readFileSync(join(__dirname, '..', 'components', 'hero.tsx'), 'utf8');

describe('terminal link', () => {
  it('reveals the four commands including trustshell status', () => {
    expect(hero).toContain('I have a terminal');
    expect(hero).toContain("setPanel('terminal')");
    const block = hero.match(/const WIN_COMMANDS = `([\s\S]*?)`;/);
    expect(block?.[1].replace(/\r/g, '').split('\n')).toEqual([
      'npm i -g @hyperdag/trustshell@1.4.0',
      'trustshell verify "The capital of France is Paris."',
      'trustshell verify "The Eiffel Tower is located in Rome, Italy."',
      'trustshell status',
    ]);
    const reveal = hero.slice(hero.indexOf("panel === 'terminal'"));
    expect(reveal).toContain('{WIN_COMMANDS}');
    expect(reveal).not.toMatch(/stake now/i);
  });
});
