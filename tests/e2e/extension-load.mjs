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
 *   d. the other states on chatgpt, in real Chromium: a 500 whose body says pass paints Not checked;
 *      while the call is held the stamp says Checking with a pulsing dot that stops under
 *      prefers-reduced-motion; a call held past the 3 s cap ends Not checked, never Checks out.
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
import { LAUNCH_ARGS, loadPlaywrightOrExit } from './chromium-path.mjs';

const { chromium } = await loadPlaywrightOrExit();

const EXT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'extension');
const CLASSIFY = 'https://repid-engine-production.up.railway.app/api/v1/classify';
const CAUGHT = 'Caught\nGroq and Cerebras both said this is false.';
const CHECKING = 'Checking with Groq and Cerebras';
const SW_GLOBALS = ['trustshellRoute', 'trustshellVerify', 'trustshellPopup', 'trustshellLaya', 'trustshellSelect'];
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

function fixture(host) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${host.name} fixture</title></head>` +
    `<body><main><div data-message-author-role="user"><p>What is two plus two?</p></div>${host.reply}</main></body></html>`;
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
    const present = await sw.evaluate((names) => names.filter((n) => Boolean(globalThis[n])), SW_GLOBALS);
    const missing = SW_GLOBALS.filter((n) => !present.includes(n));
    check('every importScripts global is defined', missing.length === 0,
      missing.length ? `missing: ${missing.join(', ')}` : SW_GLOBALS.join(', '));

    // removeAll(create) is async; poll until the menu exists rather than racing it.
    const menu = await poll(() => sw.evaluate(() => new Promise((done) => {
      chrome.contextMenus.update('trustshell-check', {}, () => {
        const err = chrome.runtime.lastError;
        done(err ? '' : 'ok');
      });
    })), 5000);
    check("context menu 'trustshell-check' exists", menu === 'ok',
      menu === 'ok' ? 'contextMenus.update returned no lastError' : 'contextMenus.update set lastError — the menu was never created');

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
      check('B19 paints with paintLabel(["veto"]) on the clicked tab',
        b19.count === 1 && b19.isPaintLabel && b19.tabId === 1 && JSON.stringify(b19.args) === '["veto"]',
        `executeScript calls=${b19.count} func=paintLabel:${b19.isPaintLabel} tabId=${b19.tabId} args=${JSON.stringify(b19.args)}`);
    }
  } else {
    record('every importScripts global is defined', 'NOT_CHECKED', 'no service worker to ask');
    record("context menu 'trustshell-check' exists", 'NOT_CHECKED', 'no service worker to ask');
    record('B19 menu click returns veto', 'NOT_CHECKED', 'no service worker to ask');
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
      // laya.js stops waiting just past 3 s. Past the cap the claim is Not checked.
      const ended = await poll(async () => {
        const s = await readStamp(page);
        return s && s.word !== 'checking' ? s : null;
      }, 10000);
      check('chatgpt: a call held past the 3 s cap ends Not checked, never Checks out',
        Boolean(ended) && ended.text === 'Not checked',
        ended ? JSON.stringify(ended.text) : 'still checking after 10s');
    } catch (err) {
      record('chatgpt: while the call is out the stamp says Checking, checking in the tooltip', 'NOT_CHECKED', String(err && err.message).split('\n')[0]);
    }
    while (held.length) held.shift()();
    await page.close();
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
