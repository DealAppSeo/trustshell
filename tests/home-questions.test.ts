/**
 * Three still question cards under the stamp, and the three pieces they open (Sean and Grok,
 * 2026-10-06). Not a carousel: lib/why-questions.ts says why. Rendered, not grepped, the same way
 * tests/home-check.test.ts renders the home page.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement } from 'react';
import { WHY_QUESTIONS } from '../lib/why-questions';
import { INDEXABLE_ROUTES } from '../lib/site';

const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

function render(modulePath: string): string {
  const prev = global.fetch;
  global.fetch = (() => Promise.reject(new Error('no request may leave while the page renders'))) as typeof fetch;
  try {
    let html = '';
    jest.isolateModules(() => {
      const { createElement } = require('react') as typeof import('react');
      const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server');
      const Page = (require(modulePath) as { default: () => ReactElement }).default;
      html = renderToStaticMarkup(createElement(Page));
    });
    return html;
  } finally {
    global.fetch = prev;
  }
}

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

describe('the three questions on the home page', () => {
  const home = render('../app/page');

  it('three still cards, after the stamp and before the doors, each opening its piece', () => {
    expect(WHY_QUESTIONS.map((q) => q.question)).toEqual([
      'When a lie costs you, who pays?',
      'Who is supposed to catch it, the lab or you?',
      'A cage on the agent, or a check you can take with you?',
    ]);
    const at = home.indexOf('data-testid="home-questions"');
    expect(at).toBeGreaterThan(home.indexOf('</form>'));
    expect(at).toBeLessThan(home.indexOf('id="add-agent"'));
    let last = at;
    for (const q of WHY_QUESTIONS) {
      const card = home.indexOf(`href="/why/${q.slug}"`, at);
      expect(card).toBeGreaterThan(last);
      expect(home.slice(card, card + 600)).toContain(q.question);
      last = card;
    }
  });

  it('nothing rotates: the cards and the hero have no timer and no client code', () => {
    for (const f of ['components/home-questions.tsx', 'components/hero.tsx', 'lib/why-questions.ts']) {
      const src = read(f);
      expect(src).not.toMatch(/setInterval|setTimeout|useEffect|useState|'use client'|autoplay/i);
    }
    expect(text(home)).toContain('AI lies.');
  });

  it('the solution line names the moments that matter', () => {
    expect(text(home)).toContain(
      'Before you ship it, cite it, or let an agent act on it, two checkers read it. You see what they said: Checks out, Caught, or Not checked.',
    );
  });
});

describe('the three pieces', () => {
  const pages = {
    cost: '../app/why/cost/page',
    blame: '../app/why/blame/page',
    harness: '../app/why/harness/page',
  } as const;

  it.each(WHY_QUESTIONS.map((q) => [q.slug, q.question] as const))('/why/%s: its heading is the card, and it ends at the stamp', (slug, question) => {
    const html = render(pages[slug]);
    expect(html).toMatch(new RegExp(`<h1[^>]*>${question.replace(/[?,]/g, (c) => `\\${c}`)}</h1>`));
    expect(html).toContain('href="/check"');
    expect(html).toContain('href="/#add-agent"');
    for (const other of WHY_QUESTIONS.filter((q) => q.slug !== slug)) expect(html).toContain(`href="/why/${other.slug}"`);
    expect(INDEXABLE_ROUTES.map((r) => r.path)).toContain(`/why/${slug}`);
  });

  it('cost and blame cite only public records, by name', () => {
    expect(text(render(pages.cost))).toContain('(Mata v. Avianca)');
    expect(text(render(pages.cost))).toContain('(Moffatt v. Air Canada)');
    expect(text(render(pages.blame))).toContain('(Moffatt v. Air Canada, 2024)');
  });

  it('the glass box is said precisely: you see who checked; the text is still sent', () => {
    const harness = text(render(pages.harness));
    expect(harness).toContain('Glass box means you see who checked the sentence and what they said.');
    expect(harness).toContain('It does not mean the sentence stayed on your machine');
    expect(harness).toContain('People, helping agents, to help people, help people.');
    expect(harness).toContain('It never passes by default.');
  });

  it('no piece promises what is not live', () => {
    for (const slug of Object.keys(pages) as Array<keyof typeof pages>) {
      const words = text(render(pages[slug]));
      expect(words).not.toMatch(/guarantee|always right|never wrong|100%|private by default|sav(e|es|ing) you money|launched/i);
    }
  });

  it('/why lists the three questions under its four lines', () => {
    const why = render('../app/why/page');
    for (const q of WHY_QUESTIONS) expect(why).toContain(`href="/why/${q.slug}"`);
  });
});
