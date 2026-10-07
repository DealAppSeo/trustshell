/**
 * /start asks two questions, in order, and no more.
 *
 * Until 2026-10-07 it asked exactly one ("Where do you already talk to AI?") and this file failed
 * on a second. The walkthrough found that a stranger with an agent they care about had no way to
 * say "start me fresh" or "link the one I have", and the only page that asked sent them to a model
 * key vault. Sean's GO on B3 added the second question; this file now fails on a THIRD, and on the
 * second appearing before the first is answered.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const page = readFileSync(join(ROOT, 'app/start/page.tsx'), 'utf8').replace(/\r/g, '');
const layout = readFileSync(join(ROOT, 'app/start/layout.tsx'), 'utf8').replace(/\r/g, '');
const plan = readFileSync(join(ROOT, 'lib/start-plan.tsx'), 'utf8').replace(/\r/g, '');

const QUESTION = 'Where do you already talk to AI?';
const SECOND = 'A fresh agent, or one you already have?';

function questionsIn(text: string): string[] {
  return [...text.matchAll(/['"`]([^'"`\n]*\?)['"`]/g)].map((match) => match[1]!);
}

describe('/start questions', () => {
  it('asks where, then fresh-or-own, and nothing else', () => {
    expect(questionsIn(page)).toEqual([QUESTION, SECOND]);
    expect(questionsIn(`${page}\n${layout}\n${plan}`)).toEqual([QUESTION, SECOND]);
    expect(page).not.toMatch(/\/start\/tailor/);
  });

  it('shows the second question only once the first is answered', () => {
    const gate = page.indexOf('{where && (');
    expect(gate).toBeGreaterThan(-1);
    expect(page.indexOf('{SECOND}')).toBeGreaterThan(gate);
    expect(page.indexOf('{QUESTION}')).toBeLessThan(gate);
  });
});
