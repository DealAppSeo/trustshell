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
    // Check submits. Sample swaps and the agent tabs are type="button" and do not.
    const tabs = buttons(home.html).filter((b) => b.includes('data-testid="agent-tab"'));
    expect(tabs).toHaveLength(3);
    for (const b of tabs) expect(b).toMatch(/type="button"/);
    expect(buttons(home.html)).toHaveLength(1 + HOME_SAMPLES.length + tabs.length);
  });

  it('keeps a why only where production returned that label on every call', () => {
    // Measured 2026-10-05. Three production POST /api/v1/classify calls each:
    // the speed trap and the test result came back veto; the missing dollar and
    // the 40 mph sentence came back not-checked. Those two carry no why.
    // A sample with no why counts as not-checked. There is no stored pass.
    const stored = HOME_SAMPLES.map((sample) => [sample.label, sample.why?.when ?? 'not-checked']);
    expect(stored).toEqual([
      ['a speed trap', 'veto'],
      ['the missing dollar', 'not-checked'],
      ['a test result', 'veto'],
      ['the 40 mph line', 'not-checked'],
      ['an opinion', 'not-checked'],
    ]);
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

  it('says the pain, then what TrustShell is, then the solution, then the live example, then why it is the obvious one', () => {
    // Sean said GO 2026-10-05 for this order (Grok's structure, with the example made live).
    // Sean, 2026-10-05: the headline is "AI lies.", and the next line is his, worded to what is live.
    const HARNESS = 'TrustShell is a portable trust harness. Your agent can use any model, with no vendor lock-in, and a wrong answer gets caught before it costs you.';
    const SOLUTION = 'Before you ship it, cite it, or let an agent act on it, two checkers read it. You see what they said: Checks out, Caught, or Not checked.';
    const h1 = home.html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>\s*<(\w+)\b[^>]*>([\s\S]*?)<\/\2>/);
    expect(words(h1?.[1] ?? '')).toBe('AI lies.');
    expect(words(h1?.[3] ?? '')).toBe('Now it has to answer to other models, so the truth comes out.');
    const lines = text.split('\n');
    const at = (line: string) => lines.indexOf(line);
    expect(at('AI lies.')).toBeGreaterThan(-1);
    expect(at('Now it has to answer to other models, so the truth comes out.')).toBe(at('AI lies.') + 1);
    expect(at(HARNESS)).toBe(at('Now it has to answer to other models, so the truth comes out.') + 1);
    expect(at(SOLUTION)).toBe(at(HARNESS) + 1);
    expect(at('A sure answer. The average is not 45. Press Check.')).toBe(at(SOLUTION) + 1);
    expect(at('One sentence')).toBeGreaterThan(at(SOLUTION));
    const glass = at('The black box becomes a glass box: you see who checked it, and what they said.');
    expect(glass).toBeGreaterThan(at('One sentence'));
    expect(at('No signup. No wallet. Leave whenever you want.')).toBeGreaterThan(glass);
    expect(at('Add it to the AI you already use')).toBeGreaterThan(glass);
    // The first screen makes no promise the code does not keep. The model that wrote a reply stakes
    // nothing today, and the portable record and any saving are not live or not measured.
    const firstScreen = lines.slice(0, at('Add it to the AI you already use') + 1).join('\n');
    expect(firstScreen).not.toMatch(/receipt|autonomy|\bkeys?\b|\bHAL\b|\bstakes?\b|preferences|sav(e|es|ing) you money/i);
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
