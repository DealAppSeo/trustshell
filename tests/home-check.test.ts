/**
 * The home page IS /check moved up: the same CheckForm, prefilled with the speed trap, with
 * swaps to the other measured sentences. Prefill and swap send NOTHING: a request leaves only when a person clicks
 * Check, so a crawler or a page load never spends the shared checker budget.
 *
 * RENDERED, NOT GREPPED. The other home tests read source; this one renders the real page
 * (app/page.tsx → Hero → CheckForm) with fetch stubbed, and asserts on the markup a crawler gets.
 * jest.config.js compiles TSX for exactly this.
 *
 * What a server render cannot show is hydration: effects and clicks. That half is driven in a real
 * browser by tests/e2e/check-walk.mjs (npm run test:check-walk), which counts every fetch the page
 * makes on load and on a swap, and clicks Check once as the positive control. Here, the source
 * half: the form has no effect, the swap handler calls nothing, and classifyClaim is called from
 * onSubmit only.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement } from 'react';

const ROOT = join(__dirname, '..');
import { HERO_RUN, HOME_SAMPLES, SPEED_TRAP } from '../lib/home-samples';
// The hero offers the measured cards whose answer is not already on screen in the result card.
const TRY_ONE = HOME_SAMPLES.filter((s) => s.text !== HERO_RUN.text);
const PRIVACY =
  'What you type is sent to our engine. A whole equation is computed there, with no model asked; anything else is sent to our checkers, Groq and Cerebras. If one cannot answer, a backup checker takes its turn: Cloudflare Workers AI (Llama), or another listed in our privacy policy. It is not stored. Do not paste anything private.';
const NOT_YET = 'ChatGPT and Grok apps: not yet. On their websites, use the Chrome extension.';

/** Render a page module with fetch stubbed, counting every call made while loading and rendering it. */
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
      // require, not import: a fresh load inside the stub, so a fetch at module load counts too.
      // React and the renderer load in the same fresh registry, or the page gets a second React.
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

/** The words a reader sees: tags dropped, the entities React emits decoded. */
function words(html: string): string {
  return html
    .replace(/<[^>]+>/g, '\n')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}

function buttons(html: string): string[] {
  return html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
}

// Since 2026-10-24 the home page is install-first and has no check form; the form's own tests are below and in /check.
describe('home page renders and sends nothing', () => {
  const home = render('../app/page');
  const text = words(home.html);

  it('makes zero fetch calls while loading and rendering', () => {
    expect(home.calls).toHaveLength(0);
  });

  it('shows no speed number, no receipt promise, and none of the removed lines', () => {
    expect(text).not.toMatch(/\d\s*ms\b/i);
    expect(text).not.toMatch(/millisecond|latency/i);
    expect(text).not.toMatch(/receipt/i);
    expect(text).not.toMatch(/laya|jev|convai/i);
    expect(text).not.toMatch(/search(es|ing)? the web|web search/i);
    for (const gone of [
      'trustshell verify "paste your own claim"',
      'trustshell repid trinity-shofet',
      'After verify, copy the family host verdict line.',
      'Check any claim. Get a receipt. Your keys stay yours.',
      'Check a claim in the chat you already use',
      'trustshell status',
    ]) {
      expect(text).not.toContain(gone);
    }
  });
});

describe('/check is unchanged by the props the home page uses', () => {
  const check = render('../app/check/page');

  it('starts empty with Check disabled, shows no card, and sends nothing', () => {
    expect(check.calls).toHaveLength(0);
    const box = check.html.match(/<textarea\b[^>]*\bid="claim"[^>]*>([\s\S]*?)<\/textarea>/);
    expect(box?.[1]).toBe('');
    const submit = buttons(check.html).filter((b) => /type="submit"/.test(b));
    expect(submit).toHaveLength(1);
    expect(submit[0]).toMatch(/\sdisabled=""/);
    expect(check.html).not.toContain('data-testid="check-cards"');
    expect(words(check.html)).toContain('One sentence');
    expect(words(check.html).split(PRIVACY)).toHaveLength(2);
    expect(check.html).toMatch(/<details open="" class="[^"]*" data-testid="check-privacy-fold">/);
  });
});

describe('nothing in the form sends on its own (the source half)', () => {
  const form = readFileSync(join(ROOT, 'app/check/CheckForm.tsx'), 'utf8').replace(/\r/g, '');
  const hero = readFileSync(join(ROOT, 'components/home-install.tsx'), 'utf8').replace(/\r/g, '');

  const compareForm = readFileSync(join(ROOT, 'app/check/CompareForm.tsx'), 'utf8').replace(/\r/g, '');

  it('has no effect that could fire on load', () => {
    for (const src of [form, hero, compareForm]) {
      expect(src).not.toMatch(/\buse(Layout)?Effect\b/);
      expect(src).not.toMatch(/requestSubmit|\.submit\(\)|autoFocus/);
    }
  });

  it('calls classifyClaim in one place, reached only from a person\'s click: Check, a card, or Check again', () => {
    expect(form.match(/classifyClaim\(/g)).toHaveLength(1);
    const check = form.slice(form.indexOf('async function check('), form.indexOf('function onSubmit'));
    expect(check.match(/classifyClaim\(/g)).toHaveLength(1);
    // check() has exactly three callers, each a click handler.
    expect(form.match(/void check\(/g)).toHaveLength(3);
    const onSubmit = form.slice(form.indexOf('function onSubmit'), form.indexOf('function pick('));
    expect(onSubmit).toContain('void check(text)');
    const pick = form.slice(form.indexOf('function pick('), form.indexOf('function recheck('));
    expect(pick).toContain('void check(sample.text)');
    const recheck = form.slice(form.indexOf('function recheck('), form.indexOf('const meaning ='));
    expect(recheck).toContain('void check(combined)');
    // pick runs only from a card's onClick; recheck only from Check again or Enter in the answer box.
    expect(form.match(/onClick=\{\(\) => pick\(s\)\}/g)).toHaveLength(1);
    expect(form.match(/(=> |;\s*)recheck\(\)/g)).toHaveLength(2);
    expect(form).toMatch(/onClick=\{\(\) => recheck\(\)\}/);
    expect(form).toMatch(/if \(e\.key === 'Enter'\) \{\s*e\.preventDefault\(\);\s*recheck\(\);/);
  });

  it('Paste both sends two checks, only from its own submit', () => {
    // Exactly two classifyClaim calls, both inside checkBoth, and checkBoth is the form's onSubmit only.
    expect(compareForm.match(/classifyClaim\(/g)).toHaveLength(2);
    const both = compareForm.slice(compareForm.indexOf('async function checkBoth('), compareForm.indexOf('return ('));
    expect(both.match(/classifyClaim\(/g)).toHaveLength(2);
    expect(compareForm.match(/checkBoth\b/g)).toHaveLength(2);
    expect(compareForm).toContain('<form onSubmit={checkBoth}');
  });
});

describe('the social card speaks the same three words', () => {
  const card = readFileSync(join(ROOT, 'app/opengraph-image.tsx'), 'utf8');

  it('labels the outcomes Checks out, Caught, Not checked, with no speed number or receipt promise', () => {
    expect(card).toContain('Checks out · Caught · Not checked');
    expect(card).not.toContain('Measured · Not checked · Failed');
    expect(card).not.toMatch(/\d\s*ms\b|millisecond|latency/i);
    expect(card).not.toMatch(/receipt/i);
  });
});
