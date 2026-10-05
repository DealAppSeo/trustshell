/**
 * README and /start share one command block and two lines.
 *
 * The hero left this group on purpose: the home page is now /check moved up, and its copy and
 * commands are pinned in tests/home-check.test.ts. It no longer says "Get a receipt" (not
 * delivered today) or "any claim" (overstated). README and /start still do, which is a separate
 * decision; this test keeps the two of them agreeing until it is made.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const LINES = [
  'AI lies. Now it has to show its work.',
  'Check any claim. Get a receipt. Your keys stay yours.',
];
const COMMANDS = [
  'npm i -g @hyperdag/trustshell@1.6.0',
  'trustshell verify "paste your own claim"',
  'trustshell repid trinity-shofet',
];

const FILES = ['README.md', 'app/start/page.tsx'];

describe('surface agreement', () => {
  it('fails if README and /start disagree', () => {
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
