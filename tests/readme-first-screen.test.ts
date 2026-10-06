/**
 * The README and /start open on the same sentence and the same measured check.
 * The output is one real run of the published package, not a written example.
 * npx @hyperdag/trustshell@1.5.0 check "<SPEED_TRAP>" printed these two lines and exited 1.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SPEED_TRAP } from '../lib/home-samples';

const ROOT = join(__dirname, '..');
const SENTENCE = 'Paste something an AI told you and see if it checks out.';
const COMMAND = `npx @hyperdag/trustshell check "${SPEED_TRAP}"`;
const OUTPUT = [
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

  it('shows the same sentence, the same command, and the same output', () => {
    expect(page).toContain(SENTENCE);
    expect(page).toContain(COMMAND);
    expect(page).toContain(OUTPUT);
    expect(COMMAND).not.toMatch(/&&/);
    expect(page).not.toMatch(/Get a receipt/);
    expect(page).not.toMatch(/\b(Paris|Rome|Eiffel)\b/);
    expect(page).toContain("const QUESTION = 'Where do you already talk to AI?'");
  });
});
