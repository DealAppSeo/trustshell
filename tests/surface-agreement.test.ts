/**
 * README and /start share one sentence and one check.
 *
 * The hero left this group on purpose: the home page is now /check moved up, and its copy and
 * commands are pinned in tests/home-check.test.ts. The sentence and the command here are the
 * first screen.
 *
 * The outputs are two real runs, so they are pinned as the same label and the same explanation
 * line, not the same milliseconds. The README shows a 1.6.0 run (2026-10-07), which adds a third
 * line naming who decided; /start still shows a 1.5.0 run (the README change was README + tests
 * only). tests/readme-first-screen.test.ts pins each recording exactly.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const LINES = [
  'Paste something an AI told you and see if it checks out.',
  'veto',
];
const EXPLANATION = /^The classifier labelled this sentence veto — do not rely on it \(\d+ ms\)\./m;
const COMMANDS = [
  'npx @hyperdag/trustshell check "If you drive 60 miles at 30 mph and drive back at 60 mph, your average speed for the trip is 45 mph."',
];

const FILES = ['README.md', 'app/start/page.tsx'];

describe('surface agreement', () => {
  it('fails if README and /start disagree', () => {
    const blocks = FILES.map((rel) => {
      const text = readFileSync(join(ROOT, rel), 'utf8').replace(/\r/g, '');
      for (const line of LINES) {
        expect(text).toContain(line);
      }
      expect(text).toMatch(EXPLANATION);
      expect(text).toContain(COMMANDS.join('\n'));
      return COMMANDS.join('\n');
    });
    expect(new Set(blocks).size).toBe(1);
  });
});
