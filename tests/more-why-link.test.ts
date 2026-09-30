/**
 * /more links to /why. /start still asks one question.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const more = readFileSync(join(ROOT, 'app/more/page.tsx'), 'utf8').replace(/\r/g, '');
const start = readFileSync(join(ROOT, 'app/start/page.tsx'), 'utf8').replace(/\r/g, '');
const layout = readFileSync(join(ROOT, 'app/start/layout.tsx'), 'utf8').replace(/\r/g, '');
const QUESTION = 'Where do you already talk to AI?';

function questionsIn(text: string): string[] {
  return [...text.matchAll(/['"`]([^'"`\n]*\?)['"`]/g)].map((match) => match[1]);
}

describe('/more links to /why', () => {
  it('links Why and does not add a second question on /start', () => {
    expect(more).toContain('href="/why"');
    expect(more).toMatch(/>\s*Why\s*</);
    expect(questionsIn(start)).toEqual([QUESTION]);
    expect(questionsIn(`${start}\n${layout}`)).toEqual([QUESTION]);
  });
});
