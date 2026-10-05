/**
 * The home page IS /check moved up: the same CheckForm, prefilled with a false sentence, with a
 * swap to a true one. Prefill and swap send NOTHING: a request leaves only when a person clicks
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
import { HOME_SAMPLES, SPEED_TRAP } from '../lib/home-samples';
const PRIVACY =
  'What you type is sent to our checkers, Groq and Cerebras. It is not stored. Do not paste anything private.';
const NOT_YET = 'ChatGPT and Grok: not yet.';

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

describe('home page is the check form, and rendering it sends nothing', () => {
  const home = render('../app/page');
  const text = words(home.html);

  it('makes zero fetch calls while loading and rendering', () => {
    expect(home.calls).toHaveLength(0);
  });

  it('renders the check form prefilled with the speed trap, Check ready to click', () => {
    expect(home.html).toContain('data-testid="check-form"');
    const box = home.html.match(/<textarea\b[^>]*\bid="claim"[^>]*>([\s\S]*?)<\/textarea>/);
    expect(box?.[1]).toBe(SPEED_TRAP);
    const submit = buttons(home.html).filter((b) => /type="submit"/.test(b));
    expect(submit).toHaveLength(1);
    expect(words(submit[0] ?? '')).toBe('Check');
    expect(submit[0]).not.toMatch(/\sdisabled=""/); // the attribute, not the disabled: classes
  });

  it('offers every measured sample as a swap, and no swap control can submit the form', () => {
    const samples = buttons(home.html).filter((b) => b.includes('data-testid="check-sample"'));
    const decode = (v: string) => v.replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"');
    expect(samples.map((b) => decode(b.match(/data-sample="([^"]*)"/)?.[1] ?? ''))).toEqual(HOME_SAMPLES.map((x) => x.text));
    // A <button> in a form defaults to submit. Every one that is not Check must say type="button".
    for (const b of samples) expect(b).toMatch(/type="button"/);
    expect(samples[0]).toMatch(/aria-pressed="true"/);
    for (const b of samples.slice(1)) expect(b).toMatch(/aria-pressed="false"/);
    // Check plus the samples: no other button competes with Check.
    expect(buttons(home.html)).toHaveLength(1 + HOME_SAMPLES.length);
  });

  it('teaches all three answers: at least one sample each for Caught, Checks out and Not checked', () => {
    const expected = HOME_SAMPLES.map((x) => x.why?.when ?? 'not-checked');
    expect(expected).toEqual(expect.arrayContaining(['veto', 'pass', 'not-checked']));
  });

  it('renders no explanation before a check: a why line appears only after the checkers answer', () => {
    expect(home.html).not.toContain('data-testid="check-why-sample"');
    for (const x of HOME_SAMPLES) if (x.why) expect(text).not.toContain(x.why.text);
  });

  it('puts the privacy sentence, once, above the Check button', () => {
    expect(text.split(PRIVACY)).toHaveLength(2);
    const privacyAt = home.html.indexOf('id="check-privacy"');
    expect(privacyAt).toBeGreaterThan(-1);
    expect(privacyAt).toBeLessThan(home.html.indexOf('type="submit"'));
  });

  it('says the headline, then Act when they pass., then the plain line', () => {
    const h1 = home.html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>\s*<(\w+)\b[^>]*>([\s\S]*?)<\/\2>/);
    expect(words(h1?.[1] ?? '')).toBe('Every answer gets checks you can see.');
    expect(words(h1?.[3] ?? '')).toBe('Act when they pass.');
    const lines = text.split('\n');
    const at = (line: string) => lines.indexOf(line);
    expect(at('Every answer gets checks you can see.')).toBeGreaterThan(-1);
    expect(at('Act when they pass.')).toBe(at('Every answer gets checks you can see.') + 1);
    expect(at('Paste something an AI told you. See if it checks out.')).toBe(at('Act when they pass.') + 1);
    expect(at('No signup. No wallet. Leave whenever you want.')).toBeGreaterThan(-1);
    expect(at('No signup. No wallet. Leave whenever you want.')).toBeLessThan(at('One sentence'));
  });

  it('shows the two quiet next steps below the form, with real commands', () => {
    const formEnd = home.html.indexOf('</form>');
    const after = words(home.html.slice(formEnd));
    expect(after).toContain('Use it in your terminal');
    expect(after).toContain(`npx @hyperdag/trustshell check "${SPEED_TRAP}"`);
    expect(after).toContain('Add it to your agent');
    expect(after).toContain('For Claude Desktop and Cursor.');
    const steps = home.html.slice(formEnd).match(/<ol\b[^>]*>([\s\S]*?)<\/ol>/)?.[1] ?? '';
    const items = steps.match(/<li\b/g) ?? [];
    expect(items).toHaveLength(3);
    expect(words(steps)).toContain('npm i -g @hyperdag/trustshell@1.6.0');
    expect(words(steps)).toContain('trustshell-mcp');
    expect(words(steps)).toContain('{ "mcpServers": { "trustshell": { "command": "trustshell-mcp" } } }');
    expect(words(steps)).toContain('Restart the app.');
    expect(after).toContain(NOT_YET);
  });

  it('names ChatGPT and Grok only to say not yet', () => {
    expect(text.split(NOT_YET)).toHaveLength(2);
    const rest = text.replace(NOT_YET, '');
    expect(rest).not.toMatch(/ChatGPT|\bGrok\b/);
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

  it('starts empty with Check disabled, shows no sample control, and sends nothing', () => {
    expect(check.calls).toHaveLength(0);
    const box = check.html.match(/<textarea\b[^>]*\bid="claim"[^>]*>([\s\S]*?)<\/textarea>/);
    expect(box?.[1]).toBe('');
    const submit = buttons(check.html).filter((b) => /type="submit"/.test(b));
    expect(submit).toHaveLength(1);
    expect(submit[0]).toMatch(/\sdisabled=""/);
    expect(check.html).not.toContain('data-testid="check-samples"');
    expect(words(check.html).split(PRIVACY)).toHaveLength(2);
  });
});

describe('nothing in the form sends on its own (the source half)', () => {
  const form = readFileSync(join(ROOT, 'app/check/CheckForm.tsx'), 'utf8').replace(/\r/g, '');
  const hero = readFileSync(join(ROOT, 'components/hero.tsx'), 'utf8').replace(/\r/g, '');

  it('has no effect that could fire on load', () => {
    for (const src of [form, hero]) {
      expect(src).not.toMatch(/\buse(Layout)?Effect\b/);
      expect(src).not.toMatch(/requestSubmit|\.submit\(\)|autoFocus/);
    }
  });

  it('calls classifyClaim only from a person\'s click: onSubmit, and recheck after they answer the one question', () => {
    expect(form.match(/classifyClaim\(/g)).toHaveLength(2);
    const onSubmit = form.slice(form.indexOf('async function onSubmit'), form.indexOf('async function recheck'));
    expect(onSubmit.match(/classifyClaim\(/g)).toHaveLength(1);
    const recheck = form.slice(form.indexOf('async function recheck'), form.indexOf('const meaning ='));
    expect(recheck.match(/classifyClaim\(/g)).toHaveLength(1);
    // recheck runs only from the Check again click or Enter in the answer box, never on its own.
    expect(form.match(/void recheck\(\)/g)).toHaveLength(2);
    expect(form).toMatch(/onClick=\{\(\) => void recheck\(\)\}/);
    expect(form).toMatch(/if \(e\.key === 'Enter'\) \{\s*e\.preventDefault\(\);\s*void recheck\(\);/);
    const swap = form.slice(form.indexOf('function swapIn'), form.indexOf('async function onSubmit'));
    expect(swap).toContain('setText(sample)');
    expect(swap).not.toMatch(/classifyClaim|fetch|submit|setBusy/i);
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
