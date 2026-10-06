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
import { HOME_SAMPLES, SPEED_TRAP } from '../lib/home-samples';
const PRIVACY =
  'What you type is sent to our checkers, Groq and Cerebras. If one cannot answer, a backup checker takes its turn: Cloudflare Workers AI (Llama), or another listed in our privacy policy. It is not stored. Do not paste anything private.';
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

describe('home page is the check form, and rendering it sends nothing', () => {
  const home = render('../app/page');
  const text = words(home.html);

  it('makes zero fetch calls while loading and rendering', () => {
    expect(home.calls).toHaveLength(0);
  });

  it('renders Try to trick it: three cards ready to click, then an empty box for your own', () => {
    // Sean, 2026-10-06: the prefilled box under "The average is not 45" read as a canned demo.
    expect(home.html).toContain('data-testid="check-form"');
    expect(text).toContain('Try to trick it');
    expect(text).toContain('Two of these are wrong and one is right. Guess first, then pick one and watch two other AIs check it, live.');
    const box = home.html.match(/<textarea\b[^>]*\bid="claim"[^>]*>([\s\S]*?)<\/textarea>/);
    expect(box?.[1]).toBe('');
    expect(text).toContain('Or paste the answer you almost used');
    // The check form's own Check button. The folded "Paste both" form below it has its own.
    const checkForm = home.html.slice(home.html.indexOf('data-testid="check-form"'), home.html.indexOf('</form>'));
    const submit = buttons(checkForm).filter((b) => /type="submit"/.test(b));
    expect(submit).toHaveLength(1);
    expect(words(submit[0] ?? '')).toBe('Check');
    // Empty box: Check waits for text. The cards are the first thing to click.
    expect(submit[0]).toMatch(/\sdisabled=""/);
    expect(home.html.indexOf('data-testid="check-cards"')).toBeLessThan(home.html.indexOf('id="claim"'));
  });

  it('offers every measured card, each a type="button" that shows exactly the sentence it checks', () => {
    const samples = buttons(home.html).filter((b) => b.includes('data-testid="check-card"'));
    const decode = (v: string) => v.replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"');
    expect(samples.map((b) => decode(b.match(/data-sample="([^"]*)"/)?.[1] ?? ''))).toEqual(HOME_SAMPLES.map((x) => x.text));
    // A <button> in a form defaults to submit. Every one that is not Check must say type="button".
    for (const b of samples) expect(b).toMatch(/type="button"/);
    for (const [i, b] of samples.entries()) {
      expect(words(b)).toContain(HOME_SAMPLES[i]!.label);
      expect(b).toMatch(/aria-pressed="false"/);
      expect(b).not.toMatch(/\sdisabled=""/);
    }
    // Check submits. Sample swaps and the agent tabs are type="button" and do not.
    const tabs = buttons(home.html).filter((b) => b.includes('data-testid="agent-tab"'));
    expect(tabs).toHaveLength(3);
    for (const b of tabs) expect(b).toMatch(/type="button"/);
    // Plus "Check both" in the folded compare form (2026-10-06), its own submit in its own form.
    const compare = buttons(home.html).filter((b) => b.includes('data-testid="compare-submit"'));
    expect(compare).toHaveLength(1);
    expect(compare[0]).toMatch(/type="submit"/);
    expect(compare[0]).toMatch(/\sdisabled=""/);
    expect(buttons(home.html)).toHaveLength(1 + HOME_SAMPLES.length + tabs.length + compare.length);
  });

  it('keeps a card, and its why, only where production returned that label on every call', () => {
    // Measured 2026-10-06, five production POST /api/v1/classify calls each (the raw runs are in
    // docs/measurements/home-cards-2026-10-06.md): the price and the command came back veto every
    // time, the citation pass every time. Two wrong, one right, which is also a fact about the
    // sentences: the setup line says so because of what they say, not because of the checkers.
    const stored = HOME_SAMPLES.map((sample) => [sample.label, sample.why?.when ?? 'none']);
    expect(stored).toEqual([
      ['Before you pay', 'veto'],
      ['Before you cite it', 'pass'],
      ['Before you run it', 'veto'],
    ]);
    // Every card carries the record that put it there, and it agrees with its why.
    for (const sample of HOME_SAMPLES) {
      expect(sample.measured).toBeDefined();
      expect(sample.measured!.label).toBe(sample.why?.when);
      expect(sample.measured!.times).toBe(sample.measured!.of);
      expect(sample.measured!.of).toBeGreaterThanOrEqual(5);
      expect(sample.measured!.record).toMatch(/^https:\/\/github\.com\/DealAppSeo\/trustshell\/blob\/main\/docs\/measurements\//);
    }
  });

  it('renders no measured record before a check: guess first, then see the runs', () => {
    expect(home.html).not.toContain('data-testid="check-measured"');
    expect(text).not.toMatch(/When we measured this sentence/);
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

  it('says the pain, then the second sure answer, then the product, then the live example, then why it is the obvious one', () => {
    // Sean said GO 2026-10-05 for this order (Grok's structure, with the example made live), and on
    // 2026-10-06 for these lines: the pain is two sure answers that cannot both be right, and the
    // product is a second opinion where you see what each checker said.
    const ACT = "Or it sounds sure and it's wrong.";
    const PAIN = "Ask again, and it's just as sure the other way. Both can't be right.";
    const SOLUTION =
      'TrustShell gets you a second opinion before you build on it. Two other AIs check the answer, and you see what each one said: Checks out, Caught, or Not checked. If they disagree, it tells you instead of guessing.';
    const ANY = 'Works with whatever model you use.';
    const SETUP = 'Two of these are wrong and one is right. Guess first, then pick one and watch two other AIs check it, live.';
    const h1 = home.html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>\s*<(\w+)\b[^>]*>([\s\S]*?)<\/\2>/);
    expect(words(h1?.[1] ?? '')).toBe('AI lies.');
    expect(words(h1?.[3] ?? '')).toBe(ACT);
    const lines = text.split('\n');
    const at = (line: string) => lines.indexOf(line);
    expect(at('AI lies.')).toBeGreaterThan(-1);
    expect(at(ACT)).toBe(at('AI lies.') + 1);
    expect(at(PAIN)).toBe(at(ACT) + 1);
    expect(at(SOLUTION)).toBe(at(PAIN) + 1);
    expect(at(ANY)).toBe(at(SOLUTION) + 1);
    expect(at('Try to trick it')).toBe(at(ANY) + 1);
    expect(at(SETUP)).toBe(at('Try to trick it') + 1);
    expect(at('Or paste the answer you almost used')).toBeGreaterThan(at(SETUP));
    const wontCall = lines.findIndex((l) => l.startsWith('What it will not call:'));
    expect(wontCall).toBeGreaterThan(at('Or paste the answer you almost used'));
    const compare = at('Got two answers that disagree? Paste both');
    expect(compare).toBeGreaterThan(wontCall);
    const glass = at('The black box becomes a glass box: you see who checked it, and what they said.');
    expect(glass).toBeGreaterThan(compare);
    expect(at('No signup. No wallet. Leave whenever you want.')).toBeGreaterThan(glass);
    expect(at('Add it to the agent you already use')).toBeGreaterThan(glass);
    // The first screen makes no promise the code does not keep. The model that wrote a reply stakes
    // nothing today, and the portable record and any saving are not live or not measured. And it
    // never calls two models agreeing "the truth" (Sean, 2026-10-06: not a source of truth).
    const firstScreen = lines.slice(0, at('Add it to the agent you already use') + 1).join('\n');
    expect(firstScreen).not.toMatch(/receipt|autonomy|\bkeys?\b|\bHAL\b|\bstakes?\b|preferences|sav(e|es|ing) you money/i);
    expect(text).not.toMatch(/the truth comes out|source of truth|proves? (it|the truth)/i);
  });

  it('says what it will not call, with the runs and the date', () => {
    expect(text).toContain(
      'What it will not call: 2 famous quotes pinned on people who never said them came back Not checked 10 times out of 10 on 2026-10-06. Who said a line is something the checkers cannot look up, so they do not guess.',
    );
  });

  it('names what a wrong answer costs without a price, a plan, or a promise of one', () => {
    const cost = words(home.html.slice(home.html.indexOf('data-testid="home-cost"'), home.html.indexOf('id="add-agent"')));
    expect(cost).toContain('What a wrong answer really costs');
    expect(cost).toContain('The check is free. The miss is not.');
    expect(cost).toContain('Free to try. No signup, no wallet.');
    expect(cost).toContain('It never means the answer checks out.');
    expect(cost).not.toMatch(/\$\d|per month|\/mo\b|pricing|paid lane|comes later|plans?\b/i);
  });

  it('puts every door on screen 3, in order: Chrome, the MCP apps, the terminal, with real commands', () => {
    const add = home.html.indexOf('id="add-agent"');
    expect(add).toBeGreaterThan(home.html.indexOf('</form>'));
    const screen3 = words(home.html.slice(add, home.html.indexOf('id="where"')));
    const chrome = screen3.indexOf('In Chrome');
    const mcp = screen3.indexOf('In Claude Desktop, Cursor or Claude Code');
    const terminal = screen3.indexOf('In your terminal');
    expect(chrome).toBeGreaterThan(-1);
    expect(mcp).toBeGreaterThan(chrome);
    expect(terminal).toBeGreaterThan(mcp);
    expect(screen3).toContain(`npx @hyperdag/trustshell check "${SPEED_TRAP}"`);
    expect(screen3).toContain('npm i -g @hyperdag/trustshell@1.6.0');
    expect(screen3).toContain('trustshell-mcp');
    expect(screen3).toContain(NOT_YET);
    // Until the store listing is live the page says so, and offers the checked test build.
    // True before submission and during review alike; "in review" was not true until S12 is done.
    expect(screen3).toContain('Coming to the Chrome Web Store.');
    expect(screen3).not.toMatch(/in (Chrome Web Store )?review/i);
    expect(home.html).toContain('href="https://github.com/DealAppSeo/trustshell/releases/download/extension-latest/extension.zip"');
    expect(home.html).not.toContain('data-testid="add-to-chrome"');
  });

  it('names ChatGPT and Grok only where it is true: the Chrome stamp, and the apps that are not yet', () => {
    // The extension stamps both websites; their apps do not load MCP servers.
    expect(text.split(NOT_YET)).toHaveLength(2);
    const rest = text.split(NOT_YET).join('');
    expect(rest.match(/ChatGPT/g)).toHaveLength(1);
    expect(rest.match(/\bGrok\b/g)).toHaveLength(1);
    expect(rest).toContain('Every reply on ChatGPT, Claude, Gemini, Grok and DeepSeek gets a stamp');
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
  });
});

describe('nothing in the form sends on its own (the source half)', () => {
  const form = readFileSync(join(ROOT, 'app/check/CheckForm.tsx'), 'utf8').replace(/\r/g, '');
  const hero = readFileSync(join(ROOT, 'components/hero.tsx'), 'utf8').replace(/\r/g, '');

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
