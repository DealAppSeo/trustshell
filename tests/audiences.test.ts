/**
 * Hero v2 (2026-10-24): the three audience pages. These tests hold what the design promises:
 * every fear has a numbered source and an honest "what it does not do"; the picture of a receipt is the
 * real one; no page names a price or an accuracy figure; nothing on the page can send a request.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement } from 'react';
import { AUDIENCES, AUDIENCE_SLUGS, SOURCES, audienceBySlug, citeNumbers, sourcesFor } from '../lib/audiences';
import { RECEIPT_LINES } from '../lib/receipt-sample';

const PRICE = /pric(e|es|ing)|per month|free for a year|\bfree trial|subscription/i;
const PERCENT = /\d\s?%/;
const ABSOLUTE = /\b(catches|stops|prevents) (every|all)\b/i;
const NETWORK = /\bfetch\s*\(|sendBeacon|XMLHttpRequest|<script|gtag\(|\bplausible\b|posthog|\bva\(/i;

const ROOT = join(__dirname, '..');
const read =(rel: string) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r/g, '');

function renderAudience(slug: string): string {
  let html = '';
  jest.isolateModules(() => {
    const { createElement } = require('react') as typeof import('react');
    const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server');
    const { AudiencePage } = require('../components/audience-page') as { AudiencePage: (p: { a: unknown }) => ReactElement };
    const { audienceBySlug: find } = require('../lib/audiences') as typeof import('../lib/audiences');
    html = renderToStaticMarkup(createElement(AudiencePage as never, { a: find(slug) }));
  });
  return html;
}
const words = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

describe('the audience data', () => {
  it('has exactly the three pages, with unique slugs', () => {
    expect(AUDIENCE_SLUGS).toEqual(['openclaw', 'vibe-coders', 'erc']);
    expect(audienceBySlug('nope')).toBeUndefined();
  });

  it.each(AUDIENCES.map((a) => [a.slug, a] as const))('%s: every fear has a source, and says what TrustShell does not do', (_slug, a) => {
    expect(a.fears.length).toBeGreaterThanOrEqual(2);
    for (const f of a.fears) {
      expect(f.cite.length).toBeGreaterThanOrEqual(1);
      for (const id of f.cite) expect(SOURCES[id]).toBeDefined();
      expect(f.doesNot.trim().length).toBeGreaterThan(20);
      expect(f.does.trim().length).toBeGreaterThan(20);
    }
  });

  it('every source is an https link with a note that says what kind of evidence it is', () => {
    for (const s of Object.values(SOURCES)) {
      expect(s.url).toMatch(/^https:\/\//);
      expect(s.note.trim().length).toBeGreaterThan(10);
      expect(s.name.trim().length).toBeGreaterThan(10);
    }
  });

  it('footnote numbers run 1..n in order of first use, and each fear points at its own', () => {
    for (const a of AUDIENCES) {
      const src = sourcesFor(a);
      expect(src.map((s) => s.n)).toEqual(src.map((_, i) => i + 1));
      for (const f of a.fears) for (const n of citeNumbers(a, f)) expect(n).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('the receipt picture is the real one', () => {
  const doc = read('docs/challenge.md');
  it('each line of it is in the pinned-run challenge doc, word for word', () => {
    const r = RECEIPT_LINES;
    expect(doc).toContain(r.summary);
    expect(doc).toContain(r.contradicted.claim);
    expect(doc).toContain(r.contradicted.why);
    for (const s of r.supported) expect(doc).toContain(s);
    expect(doc).toContain('The check workflow succeeded on commit 5d1c5e3f57e1, run 39619591025.');
  });
});

describe.each(AUDIENCES.map((a) => [a.slug, a] as const))('the %s page, rendered', (slug, a) => {
  const html = renderAudience(slug);
  const text = words(html);

  it('has one h1, the headline, one primary action and a link for each source', () => {
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(text).toContain(a.h1);
    expect(html).toContain(`href="${a.primary.href}"`);
    for (const { n, source } of sourcesFor(a)) {
      expect(html).toContain(`id="src-${n}"`);
      expect(html).toContain(`href="#src-${n}"`);
      expect(html).toContain(`href="${source.url}"`);
    }
    expect(html.match(/data-testid="aud-sources"/g)).toHaveLength(1);
  });

  it('says what it does not do under every fear', () => {
    expect(html.match(/data-testid="aud-does-not"/g)).toHaveLength(a.fears.length);
  });

  it('names no price and no accuracy figure', () => {
    expect(text).not.toMatch(PRICE);
    expect(text).not.toMatch(PERCENT);
    expect(text).not.toMatch(ABSOLUTE);
  });

  it('does not ask for a wallet', () => {
    expect(text).not.toMatch(/claim it with your wallet|connect (your )?wallet/i);
  });

  it('shows the right picture: the game on the vibe-coders page, the receipt on the others', () => {
    expect(html.includes('data-testid="spot-the-lie"')).toBe(a.visual === 'game');
    expect(html.includes('data-testid="receipt-card"')).toBe(a.visual === 'receipt');
  });
});

describe('nothing on these pages can send a request, and no banned word appears', () => {
  const FILES = [
    'lib/audiences.ts',
    'lib/spot-the-lie.ts',
    'components/audience-page.tsx',
    'components/spot-the-lie.tsx',
    'components/receipt-card.tsx',
    'app/for/[audience]/page.tsx',
  ];
  it.each(FILES)('%s has no fetch, beacon, XHR, script tag or analytics call', (rel) => {
    // The code, not the comments that explain why there is none.
    const code = read(rel)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(NETWORK);
  });
  it.each(FILES)('%s has none of the words the public pages avoid', (rel) => {
    const text = read(rel).toLowerCase();
    for (const word of ['paris', 'rome', 'eiffel', 'zk', 'stake', 'plonky', 'sqlite']) {
      expect({ file: rel, word, hit: text.includes(word) }).toEqual({ file: rel, word, hit: false });
    }
  });
});

describe('the guards can fail (controls)', () => {
  it('the price, accuracy and network guards catch what they are for', () => {
    // The SAME patterns the guards above use, so a control can only pass if the guard can fail.
    expect('Free for a year, then $10 per month').toMatch(PRICE);
    expect('Catches 94% of them').toMatch(PERCENT);
    expect('const r = await fetch(url)').toMatch(NETWORK);
    expect('navigator.sendBeacon("/x")').toMatch(NETWORK);
    expect('It stops every attack').toMatch(ABSOLUTE);
  });
});

describe('the pages are findable', () => {
  it('are in the sitemap list', () => {
    const site = read('lib/site.ts');
    for (const slug of AUDIENCE_SLUGS) expect(site).toContain(`/for/${slug}`);
  });
  it('the home page links to the game, as a link and not a second primary action', () => {
    const hero = read('components/hero.tsx');
    expect(hero).toContain('href="/for/vibe-coders"');
    expect(hero).toContain('data-testid="hero-play-link"');
  });
});
