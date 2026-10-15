/**
 * The Chrome extension, loaded the way Chrome loads it: a real browser, the real manifest.
 *
 * WHY THIS EXISTS (B22, BUS note N-LOAD-SCOPE). Content scripts in one manifest entry share ONE
 * global scope, and so do the service worker's importScripts files. Twice on 2026-10-04 a
 * top-level `const api` in a second file broke loading — "Identifier 'api' has already been
 * declared" — while every unit test was green, because jest requires each file as its own module
 * and so never sees two of them in one scope. `tests/extension-manifest-load.test.ts` replays the
 * order in a vm context; this suite asks Chromium itself, which is the only loader that matters.
 *
 * WHAT IT CHECKS
 *   a. the service worker starts, every importScripts global exists, and the context menu
 *      'trustshell-check' was created
 *   b. B19: trustshellSelect.onMenuClick, inside the real worker, with a STUBBED classifier and a
 *      recording `scripting` stub — label veto, paintLabel injected with args ['veto']
 *   c. each of the five hosts: a fixture page served on the real host name via context.route, the
 *      classify endpoint stubbed to {"label":"veto"}, and the stamp must read `Caught` plus the
 *      voter line, with `veto` in its tooltip. A veto is the one label every file in the entry has
 *      to cooperate on: laya.js makes the call, classify.js returns it and owns the words, the host
 *      script paints it, toast.js adds the catch line. If any of them failed to load, the stamp
 *      reads Not checked or never appears.
 *   f. Your TrustShell: the record holds every host's stamp and no text, the Options page shows it
 *      live, a chat site switched off sends nothing, and Only when I click sends only on the click
 *   d. the other states on chatgpt, in real Chromium: a 500 whose body says pass paints Not checked;
 *      while the call is held the stamp says Checking with a pulsing dot that stops under
 *      prefers-reduced-motion; past 2.5 s it says why the wait is worth it; a call held past the
 *      6 s cap ends Not checked, never Checks out.
 *
 * NOTHING HERE TOUCHES PRODUCTION. Every request to the classify host is answered by a stub and
 * any other off-fixture request is aborted. So this proves the extension LOADS and WIRES; it does
 * not prove production returns that shape, and a minimal fixture DOM built from each script's own
 * selectors does not prove the live host still serves those selectors.
 *
 * EXIT CODES, this repo's three outcomes: 0 = every check VERIFIED, 1 = any FAILED,
 * 2 = nothing failed but at least one check is NOT_CHECKED (including: no Playwright at all).
 *
 *     PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npm run test:extension-e2e
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAUNCH_ARGS, chromiumExecutablePath, loadPlaywrightOrExit } from './chromium-path.mjs';
import { loadTsFixture } from './ts-fixtures.mjs';

const { chromium } = await loadPlaywrightOrExit();

const EXT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'extension');
const CLASSIFY = 'https://repid-engine-production.up.railway.app/api/v1/classify';
const CAUGHT = 'Caught\nChecked and found false.';
const SCRUBBED = 'Removed before sending: text that looked like a key or personal data. The result is about what was sent.';
const CHECKING = 'Asking two checkers';
const APPROX_LINE = 'Decided by approximate calculation, not exact. No model was asked.';
const OUT_OF_CONTRACT_LINE = 'Not checked: endpoint said what produced the label, out of contract (by / voters). This is not a pass.';
const CHECKING_LONGER = 'Still checking. Two checkers must agree.';
const SW_GLOBALS = ['trustshellSettings', 'trustshellScrub', 'trustshellLaya', 'trustshellClassify', 'trustshellSelect'];
const DECLARED = /has already been declared/i;

/**
 * One minimal assistant reply per host, built from the selectors each host script reads.
 * `toast` is whether that manifest entry loads toast.js (grok's entry does not).
 */
const HOSTS = [
  {
    name: 'chatgpt',
    url: 'https://chatgpt.com/c/e2e',
    toast: true,
    reply: '<div data-message-author-role="assistant"><p>Two plus two is five.</p></div>',
  },
  {
    name: 'claude',
    url: 'https://claude.ai/chat/e2e',
    toast: true,
    reply: '<div data-testid="assistant-message"><p>Two plus two is five.</p></div>',
  },
  {
    name: 'gemini',
    url: 'https://gemini.google.com/app/e2e',
    toast: true,
    reply: '<model-response><message-content class="model-response-text"><p>Two plus two is five.</p></message-content></model-response>',
  },
  {
    name: 'grok',
    url: 'https://grok.com/chat/e2e',
    toast: false,
    reply: '<div data-testid="assistant-message"><p>Two plus two is five.</p></div>',
  },
  {
    name: 'deepseek',
    url: 'https://chat.deepseek.com/a/chat/s/e2e',
    toast: true,
    reply: '<div class="ds-message"><div class="ds-markdown"><p>Two plus two is five.</p></div></div>',
  },
];

/** @type {Array<{name: string, outcome: 'VERIFIED'|'NOT_CHECKED'|'FAILED', note: string}>} */
const results = [];
function record(name, outcome, note = '') {
  results.push({ name, outcome, note });
  console.log(`${outcome.padEnd(11)} ${name}${note ? ` — ${note}` : ''}`);
}
function check(name, ok, note = '') {
  record(name, ok ? 'VERIFIED' : 'FAILED', note);
}

/** Section e swaps in a reply carrying sensitive values; null means each host's own reply. */
let replyOverride = null;

function fixture(host) {
  const reply = replyOverride ? replyOverride(host) : host.reply;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${host.name} fixture</title></head>` +
    `<body><main><div data-message-author-role="user"><p>What is two plus two?</p></div>${reply}</main></body></html>`;
}

async function poll(fn, ms = 10000, step = 200) {
  const until = Date.now() + ms;
  let last;
  while (Date.now() < until) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, step));
  }
  return last;
}

const userDataDir = mkdtempSync(join(tmpdir(), 'trustshell-ext-e2e-'));
let context;
try {
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      // PLAYWRIGHT_CHROMIUM / the sandbox path, as every other browser suite honours. Without it this
      // suite could only use the one build its Playwright version names, and said NOT_CHECKED beside
      // an installed Chromium.
      executablePath: chromiumExecutablePath(),
      headless: true,
      args: [...LAUNCH_ARGS, `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    });
  } catch (err) {
    // No browser is not a failure of the extension; it is an absent measurement.
    console.error(`NOT_CHECKED: Chromium did not launch: ${String(err && err.message).split('\n')[0]}`);
    console.error('  In CI: npx playwright install --with-deps chromium. In a sandbox: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers.');
    process.exit(2);
  }

  // Every classify call is answered here. Nothing reaches production.
  // classifyMode picks the answer: 'veto' (section c), 'error' (a 500 whose body says pass) or
  // 'hold' (never answers, so the stamp must say Checking, then Not checked past the cap).
  const classifyCalls = [];
  const classifyBodies = [];
  let classifyMode = 'veto';
  const held = [];
  await context.route(CLASSIFY, async (route) => {
    const req = route.request();
    const cors = {
      'access-control-allow-origin': req.headers()['origin'] || '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
    };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    classifyCalls.push(req.url());
    classifyBodies.push(req.postData() || '');
    if (classifyMode === 'hold') {
      await new Promise((release) => held.push(release));
      return route.abort().catch(() => {});
    }
    if (classifyMode === 'error') {
      return route.fulfill({
        status: 500,
        headers: { ...cors, 'content-type': 'application/json' },
        body: JSON.stringify({ label: 'pass', latency_ms: 1 }),
      });
    }
    if (classifyMode === 'votes') {
      return route.fulfill({
        status: 200,
        headers: { ...cors, 'content-type': 'application/json' },
        body: JSON.stringify({ label: 'veto', latency_ms: 1, by: 'votes', voters: ['groq', 'cerebras'] }),
      });
    }
    if (classifyMode === 'approx' || classifyMode === 'unknown-by') {
      // The engine's approximate arithmetic (repid-engine classify.ts :567), and a `by` no contract lists.
      const body = classifyMode === 'approx'
        ? { label: 'veto', latency_ms: 0, by: 'arithmetic-approx' }
        : { label: 'pass', latency_ms: 0, by: 'arithmetic-fuzzy' };
      return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    }
    if (classifyMode === 'standin') {
      // Cerebras gave no answer and OpenRouter stood in: it received the text, but did not decide.
      return route.fulfill({
        status: 200,
        headers: { ...cors, 'content-type': 'application/json' },
        body: JSON.stringify({
          label: 'veto',
          latency_ms: 1,
          by: 'votes',
          voters: ['groq', 'cerebras', 'openrouter'],
          deciders: ['groq', 'openrouter'],
        }),
      });
    }
    return route.fulfill({
      status: 200,
      headers: { ...cors, 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'veto', latency_ms: 1 }),
    });
  });
  for (const host of HOSTS) {
    const origin = new URL(host.url).origin;
    await context.route(`${origin}/**`, (route) => {
      const req = route.request();
      if (req.resourceType() === 'document') {
        return route.fulfill({ status: 200, contentType: 'text/html', body: fixture(host) });
      }
      return route.abort();
    });
  }

  // ---- a. service worker --------------------------------------------------------------------
  let sw = context.serviceWorkers()[0];
  if (!sw) {
    try {
      sw = await context.waitForEvent('serviceworker', { timeout: 15000 });
    } catch {
      sw = undefined;
    }
  }
  check('service worker started', Boolean(sw),
    sw ? new URL(sw.url()).pathname : 'no worker in 15s — importScripts threw (a redeclared name does exactly this) or the manifest is invalid');

  if (sw) {
    // The worker can be handed over before its top-level script has run, so one evaluate may see
    // an empty scope: CI on 2026-10-05 reported every global missing, then chrome.contextMenus
    // undefined, 170 ms after start, on a PR that touched nothing in extension/. Poll instead. A
    // script that threw (the redeclared-name case) never defines them, so this still fails.
    let present = [];
    await poll(async () => {
      present = await sw.evaluate((names) => names.filter((n) => Boolean(globalThis[n])), SW_GLOBALS);
      return present.length === SW_GLOBALS.length;
    });
    const missing = SW_GLOBALS.filter((n) => !present.includes(n));
    check('every importScripts global is defined', missing.length === 0,
      missing.length ? `missing: ${missing.join(', ')}` : SW_GLOBALS.join(', '));

    // removeAll(create) is async; poll until the menu exists rather than racing it.
    const menu = await poll(() => sw.evaluate(() => new Promise((done) => {
      if (!chrome.contextMenus) return done('');
      chrome.contextMenus.update('trustshell-check', {}, () => {
        const err = chrome.runtime.lastError;
        done(err ? '' : 'ok');
      });
    })), 5000);
    check("context menu 'trustshell-check' exists", menu === 'ok',
      menu === 'ok' ? 'contextMenus.update returned no lastError' : 'contextMenus.update set lastError — the menu was never created');

    // The toolbar icon's popup is an extension page, not a content script. Opening it by the
    // extension id is how Chromium shows default_popup without a real toolbar click.
    const popupPage = await context.newPage();
    const popupErrors = [];
    popupPage.on('pageerror', (err) => popupErrors.push(String(err && err.message)));
    try {
      const extId = new URL(sw.url()).host;
      await popupPage.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'load', timeout: 15000 });
      const info = await popupPage.evaluate(() => {
        const text = document.body ? document.body.innerText : '';
        const words = text.split(/\s+/).filter(Boolean);
        return {
          words: words.length,
          text,
          line: Boolean(document.getElementById('popup-line')),
          form: Boolean(document.getElementById('agent-form')),
        };
      });
      check('toolbar popup opens',
        info.form && !info.line && info.words > 0 && info.words < 80 &&
          info.text.includes('Groq and Cerebras') &&
          info.text.includes('once on screen (or only when you click)') &&
          info.text.includes('It computes a whole equation itself') &&
          info.text.includes('not stored') &&
          info.text.includes('Do not paste secrets') &&
          info.text.includes('Check with TrustShell') &&
          info.text.includes('RepID') &&
          popupErrors.length === 0,
        `${info.words} words, line=${info.line}, errors=${popupErrors.slice(0, 2).join(' | ') || 'none'}`);
    } catch (err) {
      record('toolbar popup opens', 'NOT_CHECKED', String(err && err.message).split('\n')[0]);
    }
    await popupPage.close();

    // ---- b. B19: onMenuClick inside the worker, nothing real called ------------------------
    const b19 = await sw.evaluate(async () => {
      const calls = [];
      const deps = {
        laya: { callLaya: async () => ({ label: 'veto', latency_ms: 1 }) },
        scripting: { executeScript: async (opts) => { calls.push(opts); return []; } },
      };
      const api = globalThis.trustshellSelect;
      if (!api || typeof api.onMenuClick !== 'function') return { error: 'trustshellSelect.onMenuClick missing' };
      const out = await api.onMenuClick({ selectionText: 'x' }, { id: 1 }, deps);
      const first = calls[0];
      return {
        label: out && out.label,
        shown: out && out.shown,
        count: calls.length,
        tabId: first && first.target && first.target.tabId,
        isPaintLabel: Boolean(first && first.func === api.paintLabel),
        args: first && first.args,
      };
    });
    if (b19.error) {
      check('B19 menu click returns veto', false, b19.error);
    } else {
      check('B19 menu click returns veto', b19.label === 'veto' && b19.shown === 'veto', `label=${b19.label} shown=${b19.shown}`);
      // The toast text comes from classify.js inside the worker, so this also proves it loaded there.
      check('B19 paints the stamp words, with veto as the tooltip label, on the clicked tab',
        b19.count === 1 && b19.isPaintLabel && b19.tabId === 1 &&
          JSON.stringify(b19.args) === JSON.stringify(['Caught\nChecked and found false.', 'veto']),
        `executeScript calls=${b19.count} func=paintLabel:${b19.isPaintLabel} tabId=${b19.tabId} args=${JSON.stringify(b19.args)}`);
    }
  } else {
    record('every importScripts global is defined', 'NOT_CHECKED', 'no service worker to ask');
    record("context menu 'trustshell-check' exists", 'NOT_CHECKED', 'no service worker to ask');
    record('B19 menu click returns veto', 'NOT_CHECKED', 'no service worker to ask');
    record('toolbar popup opens', 'NOT_CHECKED', 'no service worker to ask');
  }

  // ---- c. content scripts on the five hosts ---------------------------------------------------
  for (const host of HOSTS) {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (err) => errors.push(String(err && err.message)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    const before = classifyCalls.length;
    try {
      await page.goto(host.url, { waitUntil: 'load', timeout: 15000 });
    } catch (err) {
      record(`${host.name}: stamp paints veto`, 'NOT_CHECKED', `fixture page did not load: ${String(err && err.message).split('\n')[0]}`);
      await page.close();
      continue;
    }
    // classify.js waits ~1s for the reply to stop changing before it calls.
    const stamp = await poll(() => page.evaluate(() => {
      const node = document.getElementById('trustshell-stamp');
      if (!node) return null;
      const word = (node.dataset && node.dataset.stamp) || '';
      return word === 'veto' ? { word, text: node.textContent, title: node.title } : null;
    }), 10000).catch(() => null);
    const seen = stamp || await page.evaluate(() => {
      const node = document.getElementById('trustshell-stamp');
      return node ? { word: node.dataset.stamp, text: node.textContent, title: node.title } : null;
    }).catch(() => null);
    const called = classifyCalls.length - before;
    const declared = errors.filter((e) => DECLARED.test(e));

    check(`${host.name}: stamp paints Caught with the voter line, veto in the tooltip`,
      Boolean(stamp) && stamp.text === CAUGHT && stamp.title === 'veto',
      seen ? `#trustshell-stamp = ${JSON.stringify(seen.text)} title=${JSON.stringify(seen.title)}, classify calls = ${called}`
        : `no #trustshell-stamp in 10s, classify calls = ${called} — a script in this entry did not run`);
    if (host.toast) {
      const toast = await page.evaluate(() => {
        const node = document.getElementById('trustshell-toast');
        return node ? node.textContent : '';
      }).catch(() => '');
      check(`${host.name}: veto toast shown (toast.js loaded)`, Boolean(toast), toast ? JSON.stringify(toast) : 'no #trustshell-toast');
    }
    check(`${host.name}: no redeclared name, no page error`, declared.length === 0 && errors.length === 0,
      errors.length ? errors.slice(0, 3).join(' | ') : 'none');
    if (host.name === 'chatgpt') {
      const leaked = await page.evaluate(() => document.body && document.body.innerText.includes('Do not paste secrets')).catch(() => null);
      check('chatgpt: the toolbar popup is not injected into the page', leaked === false,
        leaked === null ? 'could not read the page' : leaked ? 'popup copy is on the host page' : 'host page has no popup copy');
    }
    await page.close();
  }

  // ---- d. the other states, on chatgpt ---------------------------------------------------------
  const chatgpt = HOSTS[0];
  const readStamp = (page) => page.evaluate(() => {
    const node = document.getElementById('trustshell-stamp');
    if (!node) return null;
    const dot = getComputedStyle(node, '::before');
    return {
      word: node.dataset.stamp,
      text: node.textContent,
      title: node.title,
      dot: dot.animationName,
      pointer: getComputedStyle(node).pointerEvents,
    };
  }).catch(() => null);

  {
    classifyMode = 'error';
    const page = await context.newPage();
    try {
      await page.goto(chatgpt.url, { waitUntil: 'load', timeout: 15000 });
      const done = await poll(async () => {
        const s = await readStamp(page);
        return s && s.word !== 'checking' ? s : null;
      }, 10000);
      check('chatgpt: a 500 whose body says pass paints Not checked, never Checks out',
        Boolean(done) && done.text === 'Not checked' && done.title === 'not-checked',
        done ? `${JSON.stringify(done.text)} title=${JSON.stringify(done.title)}` : 'no settled stamp in 10s');
    } catch (err) {
      record('chatgpt: a 500 whose body says pass paints Not checked, never Checks out', 'NOT_CHECKED', String(err && err.message).split('\n')[0]);
    }
    await page.close();
  }

  {
    classifyMode = 'hold';
    const page = await context.newPage();
    try {
      await page.goto(chatgpt.url, { waitUntil: 'load', timeout: 15000 });
      const checking = await poll(async () => {
        const s = await readStamp(page);
        return s && s.word === 'checking' ? s : null;
      }, 5000, 50);
      check('chatgpt: while the call is out the stamp says Checking, checking in the tooltip',
        Boolean(checking) && checking.text === CHECKING && checking.title === 'checking',
        checking ? JSON.stringify(checking.text) : 'never saw the checking state');
      check('chatgpt: the checking dot pulses', Boolean(checking) && checking.dot === 'trustshell-stamp-pulse',
        checking ? `::before animation-name = ${checking.dot}` : 'never saw the checking state');
      check('chatgpt: the stamp takes the pointer, so its tooltip can show', Boolean(checking) && checking.pointer !== 'none',
        checking ? `pointer-events = ${checking.pointer}` : 'never saw the checking state');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const still = await readStamp(page);
      check('chatgpt: under prefers-reduced-motion the dot does not pulse',
        Boolean(still) && still.word === 'checking' && still.dot === 'none',
        still ? `word=${still.word} ::before animation-name = ${still.dot}` : 'no stamp');
      // Latency as opportunity: past 2.5 s the Checking stamp says why the wait is worth it.
      const longer = await poll(async () => {
        const s = await readStamp(page);
        return s && s.word === 'checking' && s.text === CHECKING_LONGER ? s : null;
      }, 5000, 100);
      check('chatgpt: past 2.5 s the Checking stamp says two checkers must agree',
        Boolean(longer), longer ? JSON.stringify(longer.text) : 'never saw the longer checking line');
      // laya.js stops waiting just past 6 s. Past the cap the claim is Not checked.
      const ended = await poll(async () => {
        const s = await readStamp(page);
        return s && s.word !== 'checking' ? s : null;
      }, 12000);
      check('chatgpt: a call held past the 6 s cap ends Not checked, never Checks out',
        Boolean(ended) && ended.text === 'Not checked',
        ended ? JSON.stringify(ended.text) : 'still checking after 12s');
    } catch (err) {
      record('chatgpt: while the call is out the stamp says Checking, checking in the tooltip', 'NOT_CHECKED', String(err && err.message).split('\n')[0]);
    }
    while (held.length) held.shift()();
    await page.close();
  }

  // ---- f. the line under the stamp says who answered, when the endpoint says ---------------------
  {
    classifyMode = 'votes';
    replyOverride = () => '<div data-message-author-role="assistant"><p>The Moon is made of cheese.</p></div>';
    const page = await context.newPage();
    try {
      await page.goto(chatgpt.url, { waitUntil: 'load', timeout: 15000 });
      const line = await poll(() => page.evaluate(() => {
        const node = document.getElementById('trustshell-check-line');
        return node && node.textContent ? node.textContent : null;
      }), 10000).catch(() => null);
      check('chatgpt: a vote answer puts the voters in the line under the stamp',
        line === 'Groq and Cerebras both said false.', JSON.stringify(line));
    } catch (err) {
      record('chatgpt: a vote answer puts the voters in the line under the stamp', 'NOT_CHECKED', String(err && err.message).split('\n')[0]);
    }
    replyOverride = null;
    classifyMode = 'veto';
    await page.close();
  }
  {
    classifyMode = 'standin';
    replyOverride = () => '<div data-message-author-role="assistant"><p>The Sun orbits the Earth.</p></div>';
    const page = await context.newPage();
    try {
      await page.goto(chatgpt.url, { waitUntil: 'load', timeout: 15000 });
      const line = await poll(() => page.evaluate(() => {
        const node = document.getElementById('trustshell-check-line');
        return node && node.textContent ? node.textContent : null;
      }), 10000).catch(() => null);
      check('chatgpt: when a backup stood in, the line names the two that decided, not everyone asked',
        line === 'Groq and OpenRouter both said false.', JSON.stringify(line));
    } catch (err) {
      record('chatgpt: when a backup stood in, the line names the two that decided, not everyone asked', 'NOT_CHECKED', String(err && err.message).split('\n')[0]);
    }
    replyOverride = null;
    classifyMode = 'veto';
    await page.close();
  }

  // ---- f2. arithmetic-approx is Caught with the approximate line; an unknown `by` is Not checked and says why
  for (const [mode, reply, wantStamp, wantLine, toastWanted] of [
    ['approx', '2 ^ 0.5 = 1.5', CAUGHT, APPROX_LINE, true],
    ['unknown-by', '2 ^ 0.5 = 1.414', 'Not checked', OUT_OF_CONTRACT_LINE, false],
  ]) {
    classifyMode = mode;
    replyOverride = () => `<div data-message-author-role="assistant"><p>${reply}</p></div>`;
    const page = await context.newPage();
    const name = mode === 'approx'
      ? 'chatgpt: an approximate-arithmetic veto is Caught, with the approximate line and the Caught toast'
      : 'chatgpt: an unknown by is Not checked, and the line says it was out of contract';
    try {
      await page.goto(chatgpt.url, { waitUntil: 'load', timeout: 15000 });
      const seen = await poll(() => page.evaluate(() => {
        const stamp = document.getElementById('trustshell-stamp');
        const line = document.getElementById('trustshell-check-line');
        const toast = document.getElementById('trustshell-toast');
        if (!stamp || !line) return null;
        return { stamp: stamp.textContent, line: line.textContent, toast: toast ? toast.textContent : '' };
      }), 10000).catch(() => null);
      check(name,
        Boolean(seen) && seen.stamp === wantStamp && seen.line === wantLine && Boolean(seen.toast) === toastWanted,
        JSON.stringify(seen));
    } catch (err) {
      record(name, 'NOT_CHECKED', String(err && err.message).split('\n')[0]);
    }
    replyOverride = null;
    classifyMode = 'veto';
    await page.close();
  }

  // ---- e. the reply is scrubbed before it leaves the browser ----------------------------------
  // scrub.js must load before laya.js in the real manifest, or laya.js sends nothing. Values are
  // fake and assembled here so this file never holds a scanner-shaped string.
  {
    classifyMode = 'veto';
    const email = 'jane.doe' + '@example.com';
    const awsId = 'AKIA' + 'IOSFODNN7EXAMPLE';
    replyOverride = () =>
      `<div data-message-author-role="assistant"><p>Two plus two is five. Mail ${email} with key ${awsId}.</p></div>`;
    const page = await context.newPage();
    const before = classifyBodies.length;
    try {
      await page.goto(chatgpt.url, { waitUntil: 'load', timeout: 15000 });
      const sent = await poll(() => classifyBodies.length > before ? classifyBodies[classifyBodies.length - 1] : null, 10000);
      if (!sent) {
        record('chatgpt: the classify request carries no email and no AWS key', 'NOT_CHECKED', 'no classify call in 10s');
      } else {
        let text = '';
        try { text = String(JSON.parse(sent).text || ''); } catch { text = ''; }
        check('chatgpt: the classify request carries no email and no AWS key',
          !sent.includes(email) && !sent.includes(awsId),
          `body has email=${sent.includes(email)} awsKey=${sent.includes(awsId)}`);
        check('chatgpt: the claim itself survives the scrub', text.includes('Two plus two is five.'), JSON.stringify(text));
        // The CLI says when it removed something (src/lib/claim.ts SCRUBBED_LINE); so must the stamp.
        const line = await poll(() => page.evaluate(() => {
          const node = document.getElementById('trustshell-check-line');
          return node && node.textContent ? node.textContent : null;
        }), 10000).catch(() => null);
        check('chatgpt: the line under the stamp says something was removed before sending',
          typeof line === 'string' && line.endsWith(SCRUBBED), JSON.stringify(line));
      }
    } catch (err) {
      record('chatgpt: the classify request carries no email and no AWS key', 'NOT_CHECKED', String(err && err.message).split('\n')[0]);
    }
    replyOverride = null;
    await page.close();
  }

  // ---- e2. every secret shape in the shared corpus, through the REAL auto-classify path ---------
  // XC1 (2026-10-12) found whsec_, a bare AWS secret, ya29., seed phrases, xprv/xpub, WIF keys, a
  // Solana keypair array and api_secret= values going out verbatim. The reply below carries ALL of them
  // (the corpus is tests/fixtures/scrub-corpus.ts, loaded here so there is one copy of the values).
  {
    classifyMode = 'veto';
    const { SENSITIVE } = loadTsFixture(resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/scrub-corpus.ts'));
    replyOverride = () =>
      `<div data-message-author-role="assistant"><p>Two plus two is five.</p>${SENSITIVE.map((r) => `<p>${String(r.text).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`).join('')}</div>`;
    const page = await context.newPage();
    const before = classifyBodies.length;
    try {
      await page.goto(chatgpt.url, { waitUntil: 'load', timeout: 15000 });
      const sent = await poll(() => classifyBodies.length > before ? classifyBodies[classifyBodies.length - 1] : null, 10000);
      if (!sent) {
        record('chatgpt: no secret shape in the corpus reaches the classify request', 'NOT_CHECKED', 'no classify call in 10s');
      } else {
        let text = '';
        try { text = String(JSON.parse(sent).text || ''); } catch { text = ''; }
        const leaked = SENSITIVE.filter((r) => text.includes(r.secret)).map((r) => r.kind);
        check(`chatgpt: none of the ${SENSITIVE.length} secret shapes in the corpus reaches the classify request`, leaked.length === 0, `leaked: ${leaked.join(', ') || 'none'}`);
        check('chatgpt: the claim itself survives the corpus scrub', text.includes('Two plus two is five.'), JSON.stringify(text.slice(0, 80)));
      }
    } catch (err) {
      record('chatgpt: no secret shape in the corpus reaches the classify request', 'NOT_CHECKED', String(err && err.message).split('\n')[0]);
    }
    replyOverride = null;
    await page.close();
  }

  // ---- f. Your TrustShell: the Options page, where it checks, when, and the record ------------
  // Settings are written the way the Options page writes them (chrome.storage.local), from the
  // service worker. Every stamp painted above is already in the record, so it is checked first.
  if (sw) {
    const extId = new URL(sw.url()).host;
    const setSettings = (value) => sw.evaluate((v) => new Promise((done) => {
      if (v === null) chrome.storage.local.remove('settings', () => done(true));
      else chrome.storage.local.set({ settings: v }, () => done(true));
    }), value);
    const getRecord = () => sw.evaluate(() => new Promise((done) => chrome.storage.local.get(['record'], (v) => done(v.record || null))));
    const ALL_ON = { chatgpt: true, claude: true, gemini: true, grok: true, deepseek: true };

    const rec = await poll(async () => {
      const r = await getRecord();
      return r && r.counts && r.counts.veto >= 5 ? r : null;
    }, 5000);
    const sites = new Set(((rec && rec.recent) || []).map((e) => e.site));
    check('the record holds the stamps painted on each chat site, from each tab\'s own URL',
      Boolean(rec) && ['chatgpt', 'claude', 'gemini', 'grok', 'deepseek'].every((x) => sites.has(x)),
      rec ? `counts=${JSON.stringify(rec.counts)} sites=${[...sites].join(',')}` : 'no record in storage');
    const stored = JSON.stringify(rec || {});
    check('the record holds no reply text', !/Two plus two|Moon|cheese|Sun orbits|example\.com/.test(stored), `${stored.length} bytes`);

    // The Options page, opened the way the popup link opens it.
    const options = await context.newPage();
    const optionErrors = [];
    options.on('pageerror', (err) => optionErrors.push(String(err && err.message)));
    try {
      await options.goto(`chrome-extension://${extId}/options.html`, { waitUntil: 'load', timeout: 15000 });
      const view = await poll(() => options.evaluate(() => {
        const last = document.getElementById('record-last');
        const items = document.querySelectorAll('#record-recent li').length;
        return last && last.textContent && items > 0
          ? {
              last: last.textContent,
              items,
              counts: document.getElementById('record-counts').textContent,
              boxes: [...document.querySelectorAll('input[name="site"]')].filter((b) => b.checked).length,
              auto: document.querySelector('input[name="mode"][value="auto"]').checked,
              key: Boolean(document.querySelector('input[type="password"], input[name="key"], input[name="route"]')),
            }
          : null;
      }), 5000);
      check('Options page: the record, every site on, automatically, and no key or route box',
        Boolean(view) && /^Last stamp: /.test(view.last) && view.boxes === 5 && view.auto && !view.key && optionErrors.length === 0,
        view ? `${view.counts} | ${view.last} | ${view.items} rows` : `not rendered; errors: ${optionErrors.join('; ')}`);

      // Live: a stamp painted in another tab appears here without a reload, with who decided.
      classifyMode = 'votes';
      replyOverride = () => '<div data-message-author-role="assistant"><p>Paris is the capital of Spain.</p></div>';
      const tab = await context.newPage();
      await tab.goto(chatgpt.url, { waitUntil: 'load', timeout: 15000 });
      const live = await poll(() => options.evaluate(() => {
        const t = document.getElementById('record-last').textContent || '';
        return t.includes('Groq and Cerebras both said false.') ? t : null;
      }), 10000);
      check('Options page: a stamp in another tab shows here live, with who decided',
        Boolean(live), JSON.stringify(live));
      await tab.close();
    } catch (err) {
      record('Options page: the record, every site on, automatically, and no key or route box', 'NOT_CHECKED', String(err && err.message).split('\n')[0]);
    }
    replyOverride = null;
    classifyMode = 'veto';

    // Where it checks: chatgpt switched off sends nothing and shows no stamp.
    {
      await setSettings({ sites: { ...ALL_ON, chatgpt: false }, mode: 'auto' });
      const before = classifyCalls.length;
      const page = await context.newPage();
      try {
        await page.goto(chatgpt.url, { waitUntil: 'load', timeout: 15000 });
        await new Promise((r) => setTimeout(r, 3000));
        const stamp = await page.evaluate(() => Boolean(document.getElementById('trustshell-stamp')));
        check('a chat site switched off sends nothing and shows no stamp',
          !stamp && classifyCalls.length === before, `stamp=${stamp} classify calls=${classifyCalls.length - before}`);
      } catch (err) {
        record('a chat site switched off sends nothing and shows no stamp', 'NOT_CHECKED', String(err && err.message).split('\n')[0]);
      }
      await page.close();
    }

    // When it checks: Only when I click offers the reply, sends nothing, then checks on the click.
    // On every host: grok's own draw once bypassed the path that honours this.
    await setSettings({ sites: ALL_ON, mode: 'click' });
    for (const host of HOSTS) {
      replyOverride = (h) => h.reply.replace('Two plus two is five.', `Two plus two is five, said ${h.name}.`);
      const before = classifyCalls.length;
      const page = await context.newPage();
      try {
        await page.goto(host.url, { waitUntil: 'load', timeout: 15000 });
        const offered = await poll(() => page.evaluate(() => {
          const s = document.getElementById('trustshell-stamp');
          return s && s.textContent === 'Check this reply' ? s.getAttribute('role') : null;
        }), 8000);
        await new Promise((r) => setTimeout(r, 1500));
        check(`${host.name}: Only when I click offers Check this reply, as a button, and sends nothing`,
          offered === 'button' && classifyCalls.length === before, `role=${offered} classify calls=${classifyCalls.length - before}`);
        await page.click('#trustshell-stamp');
        const after = await poll(() => page.evaluate(() => {
          const s = document.getElementById('trustshell-stamp');
          return s && s.dataset.stamp === 'veto' ? s.textContent : null;
        }), 10000);
        check(`${host.name}: Only when I click sends the reply once, on the click, and the stamp reads Caught`,
          after === CAUGHT && classifyCalls.length === before + 1, `${JSON.stringify(after)} classify calls=${classifyCalls.length - before}`);
      } catch (err) {
        record(`${host.name}: Only when I click offers Check this reply, as a button, and sends nothing`, 'NOT_CHECKED', String(err && err.message).split('\n')[0]);
      }
      replyOverride = null;
      await page.close();
    }

    // X-2b: a mode the code does not recognise is ask-first, never auto-send. Each stored value below
    // used to fall through to automatic sending (mode === 'click' ? click : auto), so a person who had
    // chosen "Only when I click" was reverted by a wrong-case spelling or a migration, with no click.
    for (const [why, value] of [
      ['a wrong-case "Click"', { sites: ALL_ON, mode: 'Click' }],
      ['a stray mode word', { sites: ALL_ON, mode: 'manual' }],
      ['a null mode', { sites: ALL_ON, mode: null }],
      ['a mode key that was dropped', { sites: ALL_ON }],
      ['settings that are not an object', 'auto'],
    ]) {
      await setSettings(value);
      const before = classifyCalls.length;
      const page = await context.newPage();
      try {
        await page.goto(chatgpt.url, { waitUntil: 'load', timeout: 15000 });
        const offered = await poll(() => page.evaluate(() => {
          const s = document.getElementById('trustshell-stamp');
          return s && s.textContent === 'Check this reply' ? s.getAttribute('role') : null;
        }), 8000);
        await new Promise((r) => setTimeout(r, 1500));
        check(`chatgpt: ${why} is ask-first, offers Check this reply and sends nothing`,
          offered === 'button' && classifyCalls.length === before, `role=${offered} classify calls=${classifyCalls.length - before}`);
      } catch (err) {
        record(`chatgpt: ${why} is ask-first, offers Check this reply and sends nothing`, 'NOT_CHECKED', String(err && err.message).split('\n')[0]);
      }
      await page.close();
    }
    // Control, so the block above cannot pass by the extension simply being broken: with NOTHING stored the
    // reply is still checked automatically. That default (X-2a) is Sean's call and this change leaves it alone.
    await setSettings(null);
    {
      const before = classifyCalls.length;
      const page = await context.newPage();
      try {
        await page.goto(chatgpt.url, { waitUntil: 'load', timeout: 15000 });
        const stamp = await poll(() => page.evaluate(() => {
          const s = document.getElementById('trustshell-stamp');
          return s && s.dataset.stamp === 'veto' ? s.textContent : null;
        }), 10000);
        check('control: with nothing stored the reply is still checked automatically (X-2a is unchanged)',
          stamp === CAUGHT && classifyCalls.length === before + 1, `${JSON.stringify(stamp)} classify calls=${classifyCalls.length - before}`);
      } catch (err) {
        record('control: with nothing stored the reply is still checked automatically (X-2a is unchanged)', 'NOT_CHECKED', String(err && err.message).split('\n')[0]);
      }
      await page.close();
    }
    await setSettings(null);
  } else {
    record('Your TrustShell: Options page, site switch, click mode', 'NOT_CHECKED', 'no service worker');
  }
} finally {
  if (context) await context.close().catch(() => {});
  rmSync(userDataDir, { recursive: true, force: true });
}

const failed = results.filter((r) => r.outcome === 'FAILED');
const notChecked = results.filter((r) => r.outcome === 'NOT_CHECKED');
const verified = results.length - failed.length - notChecked.length;
console.log(`\n${verified} VERIFIED, ${notChecked.length} NOT_CHECKED, ${failed.length} FAILED (of ${results.length})`);
process.exit(failed.length ? 1 : notChecked.length ? 2 : 0);
