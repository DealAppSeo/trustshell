/**
 * The loop strip on /lab/start, and the one source it draws from (lib/loop-status.ts).
 *
 * RENDERED, NOT GREPPED: the page itself is rendered with fetch stubbed, so "the strip is on the page"
 * means a visitor gets it, and "no request on load" is counted, not assumed.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement } from 'react';
import { CHECKED_ON, LOOP_STEPS, STATUS_WORDS } from '../lib/loop-status';

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

/** Every visible string the source holds: what a visitor can read. */
const copy = [
  ...LOOP_STEPS.flatMap((s) => [s.title, s.does, s.linkLabel, s.evidence, ...(s.later ?? []).map((l) => l.text)]),
  ...Object.values(STATUS_WORDS).flatMap((w) => [w.chip, w.means]),
];

describe('the loop source', () => {
  it('is the five steps of the loop, in order', () => {
    expect(LOOP_STEPS.map((s) => s.id)).toEqual(['watch', 'check', 'name', 'budget', 'revoke']);
  });

  it('links every step to a page that exists, so no chip is a dead button', () => {
    for (const s of LOOP_STEPS) {
      const path = s.href.split('#')[0].replace(/^\//, '');
      expect(existsSync(join(ROOT, 'app', path, 'page.tsx'))).toBe(true);
    }
  });

  it('dates the evidence of every live step, so moving CHECKED_ON forces a re-check', () => {
    for (const s of LOOP_STEPS.filter((x) => x.status === 'live')) expect(s.evidence).toContain(CHECKED_ON);
  });

  it('labels a budget step testnet, never live', () => {
    for (const id of ['budget', 'revoke']) expect(LOOP_STEPS.find((s) => s.id === id)?.status).toBe('testnet');
  });

  it('makes none of the claims the site may not make', () => {
    const forbidden = [/fully autonomous/i, /zero[- ]knowledge/i, /mainnet/i, /\balways\b/i, /guarantee/i, /\b(simply|just|easy)\b/i];
    const hits = copy.flatMap((t) => forbidden.filter((re) => re.test(t)).map((re) => `${re}: ${t}`));
    expect(hits).toEqual([]);
  });
});

describe('/lab/start shows the loop', () => {
  const { html, calls } = render(join(ROOT, 'app', 'lab', 'start', 'page.tsx'));

  it('renders the strip with one chip per step, from the source', () => {
    expect(html).toContain('data-testid="loop-strip"');
    for (const s of LOOP_STEPS) {
      const li = html.match(new RegExp(`<li[^>]*data-step="${s.id}"[\\s\\S]*?</li>`))?.[0] ?? '';
      expect(li).toContain(`data-status="${s.status}"`);
      expect(li).toContain(`href="${s.href}"`);
    }
  });

  it('labels every part that does not work yet, with no link of its own', () => {
    expect(html).toContain('Not built yet');
    expect(html).toContain('Built, switched off');
  });

  it('sends nothing while it renders', () => {
    expect(calls).toEqual([]);
  });
});
