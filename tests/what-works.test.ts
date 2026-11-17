/**
 * "What works today" on /trust-harness: verified, in progress, open questions, drawn from the same
 * source as the loop strip (lib/loop-status.ts), so a capability cannot be "verified" there and
 * "not built" on the strip.
 */
import { join } from 'node:path';
import type { ReactElement } from 'react';
import { LOOP_STEPS, OPEN_QUESTIONS, OTHER_PARTS, STATUS_WORDS, whatWorks } from '../lib/loop-status';

const ROOT = join(__dirname, '..');

function render(modulePath: string): { html: string; calls: unknown[] } {
  const calls: unknown[] = [];
  const prev = global.fetch;
  global.fetch = ((...args: unknown[]) => {
    calls.push(args);
    return Promise.reject(new Error('no request may leave while the page renders'));
  }) as typeof fetch;
  try {
    let html = '';
    jest.isolateModules(() => {
      const { createElement } = require('react') as typeof import('react');
      const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server');
      const Page = (require(modulePath) as { default: () => ReactElement }).default;
      html = renderToStaticMarkup(createElement(Page));
    });
    return { html, calls };
  } finally {
    global.fetch = prev;
  }
}

const group = (html: string, name: string) => html.match(new RegExp(`<ul[^>]*data-group="${name}"[\\s\\S]*?</ul>`))?.[0] ?? '';

describe('the grouping', () => {
  const { verified, inProgress } = whatWorks();

  it('puts only live and testnet under verified, and everything else under in progress', () => {
    expect(verified.every((i) => i.status === 'live' || i.status === 'testnet')).toBe(true);
    expect(inProgress.every((i) => i.status !== 'live' && i.status !== 'testnet')).toBe(true);
  });

  it('loses nothing: every step, every part not built yet, every other part appears once', () => {
    const later = LOOP_STEPS.reduce((n, s) => n + (s.later?.length ?? 0), 0);
    expect(verified.length + inProgress.length).toBe(LOOP_STEPS.length + later + OTHER_PARTS.length);
  });

  it('names the open questions the ACTA reply names', () => {
    expect(OPEN_QUESTIONS.map((q) => q.title)).toEqual(['Private delegation through several agents', 'Unlinkable across chains', 'What a proof costs']);
  });

  it('makes none of the claims the site may not make', () => {
    const copy = [...OTHER_PARTS.flatMap((p) => [p.title, p.text, p.evidence]), ...OPEN_QUESTIONS.flatMap((q) => [q.title, q.text])];
    const bad = [/fully autonomous/i, /zero[- ]knowledge/i, /mainnet/i, /\balways\b/i, /guarantee/i];
    expect(copy.filter((t) => bad.some((re) => re.test(t)))).toEqual([]);
  });
});

describe('/trust-harness shows it', () => {
  const { html, calls } = render(join(ROOT, 'app', 'trust-harness', 'page.tsx'));
  const { verified, inProgress } = whatWorks();

  it('renders the three groups with the same chip as the strip', () => {
    expect(html).toContain('id="what-works"');
    for (const [name, items] of [['verified', verified], ['in-progress', inProgress]] as const) {
      const ul = group(html, name);
      for (const i of items) expect(ul).toMatch(new RegExp(`data-status="${i.status}"[^>]*>${STATUS_WORDS[i.status].chip}<`));
    }
    for (const q of OPEN_QUESTIONS) expect(group(html, 'open')).toContain(q.title);
  });

  it('links only to pages, never to an anchor that belongs to another page', () => {
    const links = [...group(html, 'verified').matchAll(/href="([^"]+)"/g), ...group(html, 'in-progress').matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(links.length).toBeGreaterThan(0);
    for (const l of links) expect(l).toMatch(/^\//);
  });

  it('sends nothing while it renders', () => {
    expect(calls).toEqual([]);
  });
});
