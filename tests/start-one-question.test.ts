/**
 * /start asks one question. A second question is a fail.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const page = readFileSync(join(ROOT, 'app/start/page.tsx'), 'utf8').replace(/\r/g, '');
const layout = readFileSync(join(ROOT, 'app/start/layout.tsx'), 'utf8').replace(/\r/g, '');

const QUESTION = 'Where do you already talk to AI?';

function questionsIn(text: string): string[] {
  return [...text.matchAll(/['"`]([^'"`\n]*\?)['"`]/g)].map((match) => match[1]);
}

describe('/start one question', () => {
  it('asks one question, and an extra question fails', () => {
    expect(questionsIn(page)).toEqual([QUESTION]);
    expect(questionsIn(`${page}\n${layout}`)).toEqual([QUESTION]);
    expect(page).not.toMatch(/\/start\/tailor/);
  });
});
