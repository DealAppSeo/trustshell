/**
 * /three-cases: the page a first-time reader can try without an account, key or install.
 *
 * RENDERED, NOT GREPPED, for what a reader sees: the page is rendered to static markup (the HTML a
 * browser gets with JavaScript off) with fetch stubbed, so a request at load or render fails the test.
 * The data file is checked against the hashes of the demo output it was built from, so an edited
 * outcome fails here before it reaches the page.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- require inside jest.isolateModules is the point: a fresh load under the fetch stub (same as tests/home-check.test.ts). */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement } from 'react';

const DIR = join(__dirname, '..', 'app', 'three-cases');
const PAGE = '../app/three-cases/page';
const CONTENT = '../app/three-cases/content';
const data = JSON.parse(readFileSync(join(DIR, 'three-cases.json'), 'utf8'));
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

function render(mock?: Record<string, unknown>): { html: string; calls: number } {
  let calls = 0;
  const prev = global.fetch;
  global.fetch = (() => {
    calls += 1;
    return Promise.reject(new Error('no request may leave while the page renders'));
  }) as typeof fetch;
  try {
    let html = '';
    jest.isolateModules(() => {
      if (mock) jest.doMock(CONTENT, () => ({ ...jest.requireActual(CONTENT), ...mock }));
      const { createElement } = require('react') as typeof import('react');
      const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server');
      const Page = (require(PAGE) as { default: () => ReactElement }).default;
      html = renderToStaticMarkup(createElement(Page));
    });
    return { html, calls };
  } finally {
    global.fetch = prev;
    jest.dontMock(CONTENT);
  }
}

const words = (html: string) =>
  html.replace(/<[^>]+>/g, '\n').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');

describe('three-cases.json is the demo output, not a retyped copy', () => {
  it('has three cases A, B, C with exactly the three outcomes', () => {
    expect(data.demo.cases.map((c: { id: string; outcome: string }) => [c.id, c.outcome])).toEqual([
      ['A', 'CHECKED_CORRECT'],
      ['B', 'CHECKED_WRONG'],
      ['C', 'NOT_CHECKED'],
    ]);
    expect(data.demo.ok).toBe(true);
    expect(data.demo.database_calls).toBe(0);
  });

  it('still hashes to the --json output and the plain output it was built from', () => {
    expect(sha256(JSON.stringify(data.demo, null, 2) + '\n')).toBe(data.source.demo_sha256);
    expect(sha256(data.plain_output.join('\n') + '\n')).toBe(data.source.plain_output_sha256);
  });

  it('names the code that produced it: repository, script, full commit, command, time', () => {
    expect(data.source.repository).toBe('DealAppSeo/repid-engine');
    expect(data.source.script).toBe('scripts/demo/checked-answer-demo.ts');
    expect(data.source.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(data.source.command).toContain(`${data.source.script} --json`);
    expect(Number.isNaN(Date.parse(data.source.generated_at))).toBe(false);
  });

  it('prints the outcome words the demo prints', () => {
    const { OUTCOME_WORDS, caseLines } = require(CONTENT) as typeof import('../app/three-cases/content');
    expect(OUTCOME_WORDS).toEqual({ CHECKED_CORRECT: 'CHECKED: CORRECT', CHECKED_WRONG: 'CHECKED: WRONG', NOT_CHECKED: 'NOT CHECKED' });
    expect(caseLines('A').after).toContain('OUTCOME: CHECKED: CORRECT');
    expect(caseLines('B').after).toContain('OUTCOME: CHECKED: WRONG');
    expect(caseLines('C').after).toContain('OUTCOME: NOT CHECKED');
    // The reader decides before the check: nothing above the reveal gives the outcome away.
    for (const id of ['A', 'B', 'C']) expect(caseLines(id).before.join('\n')).not.toMatch(/OUTCOME|answer key/);
  });
});

describe('/three-cases as the server sends it', () => {
  // In beforeAll, not the describe body: if the data file is wrong, each test fails by name
  // instead of the whole file failing to load.
  let html = '';
  let calls = -1;
  let text = '';
  beforeAll(() => {
    ({ html, calls } = render());
    text = words(html);
  });

  it('makes no request while loading or rendering', () => {
    expect(calls).toBe(0);
  });

  it('carries no script and no client component: the reveal is a native <details>', () => {
    expect(html).not.toContain('<script');
    expect(readFileSync(join(DIR, 'page.tsx'), 'utf8')).not.toMatch(/['"]use client['"]/);
    expect(html.match(/<details/g)).toHaveLength(3);
    expect(html.match(/<summary[^>]*>Reveal the independent check<\/summary>/g)).toHaveLength(3);
  });

  it('shows all three outcomes, with case B first', () => {
    expect(text).toContain('OUTCOME: CHECKED: CORRECT');
    expect(text).toContain('OUTCOME: CHECKED: WRONG');
    expect(text).toContain('OUTCOME: NOT CHECKED');
    expect(html.indexOf('id="case-b"')).toBeLessThan(html.indexOf('id="case-a"'));
    expect(html.indexOf('id="case-a"')).toBeLessThan(html.indexOf('id="case-c"'));
  });

  it("shows the demo's lines for case B exactly, and our comment apart from them", () => {
    for (const line of data.plain_output.slice(data.plain_output.indexOf('--- Case B ---') + 1, data.plain_output.indexOf('--- Case C ---') - 1)) {
      expect(text).toContain(line);
    }
    expect(text).toContain('Our comment, not demo output');
    expect(text).toContain('The reason is true. The answer is not.');
    expect(text).toContain('Not checked is not a pass.');
  });

  it('says what it is: the sentence, the fixture label, and the limits', () => {
    expect(text).toContain('Bring your AI. See what it checked. Keep the evidence behind the work.');
    expect(text).toContain('Fixture replay using the real checker. No live model call.');
    expect(text).toContain('Reputation here is a score, not a token.');
    expect(text).toContain('TrustShell is a free, open source command-line tool.');
    expect(text).toContain('reports clean installs by other readers taking 24 to 40 minutes');
  });

  it('gives the commands and puts the sources one click away', () => {
    expect(text).toContain('npm ci --legacy-peer-deps\nnpx ts-node --transpile-only scripts/demo/checked-answer-demo.ts');
    expect(text).toContain('node scripts/trust-backend-conformance.mjs');
    expect(text).toContain('npx @hyperdag/trustshell@1.9.3 check https://github.com/DealAppSeo/trustshell/actions/runs/44544121933 --claims-file claims.txt');
    const at = `https://github.com/DealAppSeo/repid-engine/blob/${data.source.commit}`;
    for (const href of [`${at}/scripts/demo/checked-answer-demo.ts`, `${at}/docs/CHECKED_ANSWER_DEMO.md`, 'https://github.com/DealAppSeo/repid-engine', 'https://github.com/DealAppSeo/trustshell', 'https://github.com/DealAppSeo/trustshell#readme']) {
      expect(html).toContain(`href="${href}"`);
    }
  });

  it('renders no video until a URL is set', () => {
    expect(html).not.toContain('<video');
    expect(render({ VIDEO_URL: '/explainer.mp4' }).html).toContain('<video');
  });
});

describe('the byline is one constant', () => {
  it('is the experiment by default and changes with the constant alone', () => {
    expect(words(render().html)).toContain('TrustShell by AIDeaGuy');
    const plain = render({ BYLINE: 'TrustShell' }).html;
    expect(plain).not.toContain('AIDeaGuy');
    expect(plain).toMatch(/data-byline="true">TrustShell</);
    // One definition, nothing else in the page folder spells it out.
    expect(readFileSync(join(DIR, 'page.tsx'), 'utf8')).not.toContain('AIDeaGuy');
    expect(readFileSync(join(DIR, 'content.ts'), 'utf8').match(/AIDeaGuy/g)).toHaveLength(1);
  });
});

describe('wording: nothing beyond what the page shows', () => {
  // Checked in the page source, the data file and the rendered text.
  const BANNED = /on-chain|blockchain|\bportable\b|trustless|guarantee|\benforce[ds]?\b|any agent|\bearn(s|ed|ing)?\b|\d\s*%|\bpercent|verifies your AI|\b(users|customers)\b/i;
  const sources = ['page.tsx', 'content.ts', 'three-cases.json'].map((f) => [f, readFileSync(join(DIR, f), 'utf8')] as const);

  it.each(sources)('%s has no banned word', (_name, src) => {
    expect(src.match(BANNED)).toBeNull();
  });

  it('the rendered page has none either', () => {
    expect(words(render().html).match(BANNED)).toBeNull();
  });

  it('the home page links here once, above the GitHub link', () => {
    const home = readFileSync(join(__dirname, '..', 'app', 'page.tsx'), 'utf8');
    expect(home.match(/href="\/three-cases"/g)).toHaveLength(1);
    expect(home).toMatch(/href="\/three-cases"[^>]*>Try the three cases<\/a>/);
    expect(home.indexOf('href="/three-cases"')).toBeLessThan(home.indexOf('href={GITHUB}'));
  });
});
