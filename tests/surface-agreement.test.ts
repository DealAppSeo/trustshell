/**
 * README, /start, and the hero share one command block and two lines.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const LINES = [
  'AI lies. Now it has to show its work.',
  'Check any claim. Get a receipt. Your keys stay yours.',
];
const COMMANDS = [
  'npm i -g @hyperdag/trustshell@1.4.1',
  'trustshell verify "paste your own claim"',
  'trustshell repid trinity-shofet',
];

const FILES = ['README.md', 'app/start/page.tsx', 'components/hero.tsx'];

describe('surface agreement', () => {
  it('fails if README, /start, and the hero disagree', () => {
    const blocks = FILES.map((rel) => {
      const text = readFileSync(join(ROOT, rel), 'utf8').replace(/\r/g, '');
      for (const line of LINES) {
        expect(text).toContain(line);
      }
      expect(text).toContain(COMMANDS.join('\n'));
      return COMMANDS.join('\n');
    });
    expect(new Set(blocks).size).toBe(1);
  });
});
