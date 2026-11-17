/**
 * "Watch an agent get caught" on /lab/start: a recorded run of the published package, shown, not typed.
 *
 * The record is pinned by its sha256 (the recording's own), every verdict line the page shows must be a
 * substring of it, and the page must send nothing when it renders. The parser refuses a record it cannot
 * read rather than rendering an empty or invented catch.
 */
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { ReactElement } from 'react';
import { CATCH_RECORD, CATCH_SHA256 } from '../lib/recordings/catch-1.9.3';
import { CATCH, parseRecord } from '../lib/watch-catch';

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

const decode = (html: string) =>
  html.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

describe('the recorded run', () => {
  it('is byte for byte the recording it was copied from', () => {
    expect(createHash('sha256').update(CATCH_RECORD).digest('hex')).toBe(CATCH_SHA256);
  });

  it('carries its exit code and when it was observed', () => {
    expect(CATCH_RECORD.endsWith('\n\nexit 1\n')).toBe(true);
    expect(CATCH.exit).toBe('exit 1');
    expect(CATCH.observed).toMatch(/^2026-11-16T06:18:\d\d\.\d{3}Z from api\.github\.com/);
  });

  it('parses every claim the headline counts', () => {
    const count = (s: string) => CATCH.claims.filter((c) => c.status === s).length;
    expect(CATCH.headline).toBe(`Claims: ${count('SUPPORTED')} supported · ${count('CONTRADICTED')} contradicted · 1 not checked`);
    expect(count('CONTRADICTED')).toBeGreaterThan(0);
  });

  it('shows a false claim caught, then a true one supported', () => {
    expect(CATCH.caught).toMatchObject({ status: 'CONTRADICTED', template: 'git.head_sha' });
    expect(CATCH.fair).toMatchObject({ status: 'SUPPORTED', template: 'gha.run_succeeded' });
    expect(CATCH.runUrl).toBe(`https://github.com/DealAppSeo/trustshell/actions/runs/${CATCH.runId}`);
  });

  it('refuses a record it cannot read instead of showing nothing', () => {
    expect(() => parseRecord(CATCH_RECORD.replace('\n\nexit 1\n', '\n'))).toThrow();
    expect(() => parseRecord(CATCH_RECORD.replace('### Claims: ', '### Verdicts: '))).toThrow();
  });
});

describe('/lab/start shows the catch', () => {
  const { html, calls } = render(join(ROOT, 'app', 'lab', 'start', 'page.tsx'));
  const text = decode(html);

  it('prints both verdicts, word for word from the record', () => {
    expect(html).toContain('id="watch"');
    for (const line of [CATCH.caught.said, CATCH.caught.why, CATCH.fair.said, CATCH.fair.why, CATCH.exit]) {
      expect(CATCH_RECORD).toContain(line);
      expect(text).toContain(line);
    }
    expect(text.indexOf(CATCH.caught.why)).toBeLessThan(text.indexOf(CATCH.fair.why));
  });

  it('puts the evidence one click away: the run, and the whole record', () => {
    expect(html).toContain(`href="${CATCH.runUrl}"`);
    expect(text).toContain(CATCH_RECORD.trim());
  });

  it('sends nothing while it renders', () => {
    expect(calls).toEqual([]);
  });
});
