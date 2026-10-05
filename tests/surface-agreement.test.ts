/**
 * README and /start share one sentence and one measured check.
 *
 * The hero left this group on purpose: the home page is now /check moved up, and its copy and
 * commands are pinned in tests/home-check.test.ts. The sentence and the command here are the
 * first screen. The output is one real run of npx @hyperdag/trustshell@1.5.0, exit 1.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const LINES = [
  'Paste something an AI told you and see if it checks out.',
  'veto',
  'The classifier labelled this sentence veto — do not rely on it (356 ms).',
];
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
      expect(text).toContain(COMMANDS.join('\n'));
      return COMMANDS.join('\n');
    });
    expect(new Set(blocks).size).toBe(1);
  });
});
