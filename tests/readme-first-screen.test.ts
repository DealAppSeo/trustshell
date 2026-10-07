/**
 * The README and /start open on the same sentence and the same check.
 * Each output is one real run of the published package, not a written example.
 *
 * README (2026-10-07): npx @hyperdag/trustshell check "<SPEED_TRAP>" ran 1.6.0 (npm latest) and
 * printed these three lines, exit 1. 1.6.0 added the third line, which names who decided.
 * /start: the 1.5.0 run, two lines, exit 1. The README change that moved the sample to 1.6.0 was
 * README + tests only, so /start still shows the older run. That is a known gap, pinned here so
 * whoever updates app/start/page.tsx has to choose a recording too, not drift into a mix.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SPEED_TRAP } from '../lib/home-samples';

const ROOT = join(__dirname, '..');
const SENTENCE = 'Paste something an AI told you and see if it checks out.';
const COMMAND = `npx @hyperdag/trustshell check "${SPEED_TRAP}"`;
const OUTPUT = [
  'veto',
  'The classifier labelled this sentence veto — do not rely on it (755 ms).',
  'Groq and Cerebras both said false.',
].join('\n');
const START_OUTPUT = [
  'veto',
  'The classifier labelled this sentence veto — do not rely on it (356 ms).',
].join('\n');

function text(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8').replace(/\r/g, '');
}

describe('README first screen', () => {
  const readme = text('README.md');
  const DIAGRAM = '![How a check works';
  const fold = readme.indexOf(DIAGRAM);
  const first = fold === -1 ? readme : readme.slice(0, fold);

  it('opens with one sentence, the measured check, and a PowerShell line', () => {
    expect(readme.startsWith(`# ${SENTENCE}\n`)).toBe(true);
    expect(first).toContain('```powershell\n' + COMMAND + '\n```');
    expect(first).toContain(OUTPUT);
    expect(first).not.toMatch(/&&/);
    expect(first).not.toMatch(/Get a receipt/);
    expect(first).not.toMatch(/\b(Paris|Rome|Eiffel|Berlin)\b/);
    expect(fold).toBeGreaterThan(first.indexOf(OUTPUT));
    expect(readme.slice(fold, fold + 400)).toMatch(/\]\(public\/how-a-check-works\.svg\)/);
  });
});

describe('the animated diagram under the first screen', () => {
  const svg = text('public/how-a-check-works.svg');

  it('is readable without animation: a title and a description a screen reader can say', () => {
    expect(svg).toMatch(/<title id="t">How a TrustShell check works<\/title>/);
    expect(svg).toMatch(/<desc id="d">[^<]{200,}<\/desc>/);
    expect(svg).toContain('aria-labelledby="t d"');
  });

  it('stops moving for anyone who asked for reduced motion', () => {
    expect(svg).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[^}]*animation: none/);
  });

  it('says the three stranger words and never that a miss passes', () => {
    for (const w of ['Checks out', 'Caught', 'Not checked']) expect(svg).toContain(w);
    expect(svg).toContain('A miss is never a pass.');
    // Nothing to run and nothing to fetch: the only URL is the SVG namespace itself.
    expect(svg.replace('xmlns="http://www.w3.org/2000/svg"', '')).not.toMatch(/<script|javascript:|https?:\/\/|href=/);
  });
});

describe('/start aligned with that screen', () => {
  const page = text('app/start/page.tsx');

  it('shows the same sentence, the same command, and its own recorded run', () => {
    expect(page).toContain(SENTENCE);
    expect(page).toContain(COMMAND);
    expect(page).toContain(START_OUTPUT);
    expect(COMMAND).not.toMatch(/&&/);
    expect(page).not.toMatch(/Get a receipt/);
    expect(page).not.toMatch(/\b(Paris|Rome|Eiffel)\b/);
    expect(page).toContain("const QUESTION = 'Where do you already talk to AI?'");
  });
});
