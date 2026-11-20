/**
 * Everything on /three-cases that a person might want to change in one line.
 *
 * The case data is NOT here. It is three-cases.json beside this file: the saved output of the
 * engine's demo script, composed by a script and never typed by hand. To refresh it, re-run the
 * command in its `source.command` and rebuild the file; do not edit an outcome.
 */
import data from './three-cases.json';

/** BRAND EXPERIMENT, this page only. To revert, set this back to 'TrustShell'. */
export const BYLINE = 'TrustShell by AIDeaGuy';

/** Explainer video. Empty renders nothing. Set a URL or a path under /public; no video file lives in this repo. */
export const VIDEO_URL = '';

export const SENTENCE = 'Bring your AI. See what it checked. Keep the evidence behind the work.';
export const FIXTURE_LABEL = 'Fixture replay using the real checker. No live model call.';

export type Outcome = 'CHECKED_CORRECT' | 'CHECKED_WRONG' | 'NOT_CHECKED';

/** The demo's JSON carries a code; its plain output prints these words. One table, three rows. */
export const OUTCOME_WORDS: Record<Outcome, string> = {
  CHECKED_CORRECT: 'CHECKED: CORRECT',
  CHECKED_WRONG: 'CHECKED: WRONG',
  NOT_CHECKED: 'NOT CHECKED',
};

/** Our words, kept apart from the demo's output. B is the point, so it goes first. */
export const ORDER: ReadonlyArray<{ id: 'A' | 'B' | 'C'; ours: string }> = [
  { id: 'B', ours: 'The reason is true. The answer is not.' },
  { id: 'A', ours: 'Here the answer and the key agree, so the outcome says checked and correct.' },
  { id: 'C', ours: 'Not checked is not a pass.' },
];

export const SOURCE = data.source;

/** The demo's own lines for one case, split at the independent check so a reader can decide first. */
export function caseLines(id: string): { outcome: string; before: string[]; after: string[] } {
  const found = data.demo.cases.find((c) => c.id === id);
  if (!found) throw new Error(`three-cases.json has no case ${id}`);
  const words = OUTCOME_WORDS[found.outcome as Outcome];
  if (!words) throw new Error(`three-cases.json case ${id} has an outcome this page does not know: ${found.outcome}`);
  const lines = data.plain_output;
  const start = lines.indexOf(`--- Case ${id} ---`);
  const end = lines.indexOf('', start);
  const split = lines.findIndex((l, i) => i > start && l.startsWith('Independent check:'));
  if (start < 0 || end < 0 || split < 0 || split > end) throw new Error(`three-cases.json plain_output has no block for case ${id}`);
  const after = lines.slice(split, end);
  // The JSON and the plain output are two views of one run. If they disagree, show neither.
  if (!after.includes(`OUTCOME: ${words}`)) throw new Error(`three-cases.json case ${id}: the JSON outcome and the plain output disagree`);
  return { outcome: words, before: lines.slice(start + 1, split), after };
}

/** The four-line table the demo prints at the end. */
export function summaryTable(): string[] {
  const start = data.plain_output.findIndex((l) => l.startsWith('Case | Panel opinion'));
  if (start < 0) throw new Error('three-cases.json plain_output has no summary table');
  return data.plain_output.slice(start, start + 4);
}
