/**
 * The phone door: a stranger on a phone opens trustshell.dev/check, pastes one sentence and gets
 * pass, veto or not-checked, shown in the stranger words Checks out, Caught or Not checked (the
 * machine label stays on the page as data-label, the title and a small "label" line). NORTH
 * milestone 1 says "a stranger gets a real label on the phone"; this suite is that sentence made
 * executable.
 *
 * TWO MODES, AND THE DIFFERENCE MATTERS.
 *
 *   stubbed (default)  a local engine answers every classify call. Proves the PAGE tells the truth
 *                      about every answer shape, including the ones production rarely produces
 *                      (a 500, a hang past the timeout, a label outside the contract). Never proves
 *                      production returns any of them.
 *   --live             no stub. The bundle is built against the production engine and real Groq
 *                      and Cerebras votes decide. Proves the door works end to end today, for three
 *                      sentences whose answers are not in doubt. The text sent is those sentences.
 *
 *   --deployed[=URL]   no build and no local server: drives the page that is actually deployed
 *                      (default https://www.trustshell.dev/check) against whatever engine its
 *                      shipped bundle calls. --live proves the code works; this proves the thing a
 *                      stranger opens works. It also checks the bundle calls the production engine,
 *                      which catches a NEXT_PUBLIC_* that was missing when Vercel built it.
 *
 * Every case runs at a phone viewport (390 x 844), because a door nobody can use on a phone is not
 * the phone door.
 *
 * THE HOME PAGE IS /check MOVED UP (stubbed mode only). It is the same form, prefilled with a false
 * sentence and with a swap to a true one. The walk counts every fetch, XHR and beacon the page makes
 * (stubbed in the page and counted) and every request that reaches the engine: loading the page and
 * swapping the sample must send NOTHING, because crawlers and page loads must not spend the shared
 * checker budget. Clicking Check once is the positive control: it proves the counters can see a
 * request at all, so their zeros mean something. Not in --live or --deployed: the deployed home
 * page is whatever shipped last, and a live click would spend real budget.
 *
 *     npm run test:check-walk               # stubbed
 *     npm run test:check-walk -- --live     # production engine, this checkout's page
 *     npm run test:check-walk -- --deployed # production engine, the deployed page
 *
 * RECEIPT. With RECEIPT_DIR set, the run writes check-walk.<mode>.json there: every check with its
 * verdict, the git sha, the engine it talked to and the time. A green line in a log is not a
 * receipt; a file a stranger can read later is.
 *
 * Exit: 0 every check passed · 1 any failed · 2 NOT_CHECKED (no browser, a port already busy, or a live
 *       voter abstained — the route answered not-checked where a definite label was expected).
 */

import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromiumExecutablePath, LAUNCH_ARGS, loadPlaywrightOrExit } from './chromium-path.mjs';

const { chromium } = await loadPlaywrightOrExit();

const DEPLOYED_ARG = process.argv.find((a) => a === '--deployed' || a.startsWith('--deployed='));
const DEPLOYED = !!DEPLOYED_ARG;
const DEPLOYED_BASE = (DEPLOYED_ARG?.includes('=') ? DEPLOYED_ARG.slice('--deployed='.length) : 'https://www.trustshell.dev').replace(/\/+$/, '');
const LIVE = DEPLOYED || process.argv.includes('--live');
const MODE = DEPLOYED ? 'deployed' : LIVE ? 'live' : 'stubbed';
const ENGINE_PORT = 4611;
const APP_PORT = 3111;
const PROD_ENGINE = 'https://repid-engine-production.up.railway.app';
const ENGINE = LIVE ? (process.env.REPID_ENGINE_URL || PROD_ENGINE) : `http://127.0.0.1:${ENGINE_PORT}`;

// What the stub saw, so the suite can assert on the request the page actually sent.
const seen = [];

const engine = createServer((req, res) => {
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
  };
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    return res.end();
  }
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const json = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json', ...cors });
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'POST' || !req.url.startsWith('/api/v1/classify')) return json(404, { error: 'not found' });
    let body = {};
    try { body = JSON.parse(raw); } catch { /* recorded as-is below */ }
    seen.push(body);
    const text = String(body.text ?? '');
    if (/Paris/.test(text)) return json(200, { label: 'pass', latency_ms: 210 });
    if (/cheese/.test(text)) return json(200, { label: 'veto', latency_ms: 230, by: 'votes', voters: ['groq', 'cerebras'] });
    if (/^2 \+ 2 = 5$/.test(text)) return json(200, { label: 'veto', latency_ms: 1, by: 'arithmetic' });
    if (/Berlin/.test(text)) return json(200, { label: 'veto', latency_ms: 220 }); // the home page's false sample
    if (/pizza/i.test(text)) return json(200, { label: 'not-checked', latency_ms: 190 });
    if (/maybe-label/.test(text)) return json(200, { label: 'probably', latency_ms: 5 });
    if (/server-error/.test(text)) return json(500, { error: 'boom' });
    if (/bad-json/.test(text)) {
      res.writeHead(200, { 'content-type': 'application/json', ...cors });
      return res.end('pass');
    }
    if (/hang-forever/.test(text)) return; // never answers: the page must give up, not wait or pass
    return json(200, { label: 'not-checked', latency_ms: 1 });
  });
});

const results = [];
// pass: true | false | null (null = NOT_CHECKED: the check could not be decided here).
const check = (name, pass, note = '') => {
  results.push({ name, pass, note, verdict: pass === null ? 'NOT_CHECKED' : pass ? 'VERIFIED' : 'FAILED' });
  console.log(`${pass === null ? 'NOT_CHECKED' : pass ? 'PASS' : 'FAIL'}  ${name}${note ? ` — ${note}` : ''}`);
};

async function waitForApp(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

if (!LIVE) engine.listen(ENGINE_PORT);

const PAGE_URL = DEPLOYED ? `${DEPLOYED_BASE}/check` : `http://127.0.0.1:${APP_PORT}/check`;
let killApp = () => {};

// --deployed tests a bundle someone else built, so there is nothing to build or serve here.
if (!DEPLOYED) {
  // Build in-suite: NEXT_PUBLIC_* is inlined at build time, so the engine URL must be set for the
  // build, and the bundle under test is then the one that ships.
  const buildEnv = { ...process.env, NEXT_PUBLIC_REPID_ENGINE_URL: ENGINE };
  const build = spawn('npx', ['next', 'build'], { env: buildEnv, stdio: 'ignore' });
  const buildCode = await new Promise((r) => build.on('exit', r));
  if (buildCode !== 0) {
    console.error(`FATAL: next build exited ${buildCode}`);
    engine.close();
    process.exit(1);
  }

  let portBusy = false;
  try {
    portBusy = !!(await fetch(`http://127.0.0.1:${APP_PORT}/`, { signal: AbortSignal.timeout(2000) }));
  } catch { /* nothing listening — the state we want */ }
  if (portBusy) {
    console.error(`NOT_CHECKED: port ${APP_PORT} is already serving; this suite tests only a server it started.`);
    engine.close();
    process.exit(2);
  }

  const app = spawn('npx', ['next', 'start', '--port', String(APP_PORT)], { env: buildEnv, stdio: 'ignore', detached: true });
  killApp = () => { try { process.kill(-app.pid, 'SIGKILL'); } catch { try { app.kill('SIGKILL'); } catch {} } };
  process.on('exit', killApp);
}

// Which commit is the deployed page? The checkout's git sha says nothing about it.
let deployedCommit = null;
if (DEPLOYED) {
  try {
    const v = await (await fetch(`${DEPLOYED_BASE}/api/version`, { signal: AbortSignal.timeout(10_000), cache: 'no-store' })).json();
    deployedCommit = typeof v?.commit === 'string' ? v.commit : null;
  } catch { /* recorded as null: not known, not assumed */ }
}

// TRANSPORT. On a CI runner the browser calls production itself ("browser-direct"). In an agent
// sandbox it cannot do that within the product's 6 s timeout: through the sandbox relay Chromium's
// fetch took 7.9 s and then failed on retry, while curl to the same route answered in about 0.3 s
// [MEASURED 2026-10-04]. So with HTTPS_PROXY set, live mode intercepts the page's classify call and
// replays its exact body to production with curl ("relayed-by-runner"). The label shown is still
// production's own answer; only the hop from the browser is replaced, and the receipt says so.
// --deployed never relays: its point is the browser loading the real page and making the real call.
// Where the browser cannot reach the page at all, it says NOT_CHECKED instead.
const RELAY = LIVE && !DEPLOYED && !!process.env.HTTPS_PROXY;
const TRANSPORT = !LIVE ? 'stub' : RELAY ? 'relayed-by-runner' : 'browser-direct';
const launchOpts = { executablePath: chromiumExecutablePath(), args: LAUNCH_ARGS };

function relayToProduction(route) {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST,OPTIONS' };
  const req = route.request();
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  let out = '';
  try {
    out = execFileSync('curl', ['-sS', '--max-time', '6', '-X', 'POST', '-H', 'content-type: application/json',
      '--data-binary', req.postData() ?? '', '-w', '\n%{http_code}', req.url()], { encoding: 'utf8' });
  } catch {
    return route.abort('failed');
  }
  const cut = out.lastIndexOf('\n');
  return route.fulfill({ status: Number(out.slice(cut + 1)) || 502, headers: { ...cors, 'content-type': 'application/json' }, body: out.slice(0, cut) });
}

// One rolling budget window (60 s) plus a second. Overridable only so the retry path can be tested
// without a minute's wait.
const ABSTAIN_RETRY_MS = Number(process.env.CHECK_WALK_RETRY_MS) || 61_000;

// Thrown to stop the walk once a check has said NOT_CHECKED for everything after it.
class SkipRest extends Error {}

/**
 * Ask one sentence and return the MACHINE label (pass | veto | not-checked). The page shows the
 * stranger words and carries the machine label in data-label; a page built before that change
 * (an older deployment) showed the machine label as its text, so that is the fallback.
 */
async function ask(page, sentence) {
  await page.fill('#claim', sentence);
  await page.click('button[type=submit]');
  // The form clears the last answer on submit. Wait for that, so asking the same sentence again
  // can never read the previous label.
  await page.waitForSelector('[data-testid=check-label]', { state: 'detached', timeout: 5_000 }).catch(() => {});
  await page.waitForSelector('[data-testid=check-label], [data-testid=check-error]', { timeout: 20_000 });
  const node = page.locator('[data-testid=check-label]');
  const label = (await node.getAttribute('data-label').catch(() => null)) ?? (await node.textContent().catch(() => null));
  return label?.trim() ?? null;
}

/** What the last answer SHOWED: the words, the tooltip, the cause line when the page decided. */
async function shown(page) {
  return page.evaluate(() => {
    const q = (id) => document.querySelector(`[data-testid=${id}]`);
    const label = q('check-label');
    const why = q('check-why');
    const card = q('check-result');
    return {
      words: label?.textContent?.trim() ?? null,
      title: label?.getAttribute('title') ?? null,
      machine: q('check-machine-label')?.textContent?.trim() ?? null,
      cause: why?.getAttribute('data-cause') ?? null,
      why: why?.textContent?.trim() ?? null,
      source: card?.getAttribute('data-source') ?? null,
      card: card?.textContent ?? '',
    };
  });
}

const FALSE_SAMPLE = 'The Eiffel Tower is in Berlin.';
const TRUE_SAMPLE = 'Paris is the capital of France.';
const NOT_YET = 'ChatGPT and Grok: not yet.';

/** Count every way the page could send something: fetch, XHR and beacon, wrapped before any script runs. */
function countSends() {
  window.__sent = [];
  const f = window.fetch;
  window.fetch = function (...a) {
    window.__sent.push(`fetch ${String(a[0]?.url ?? a[0])}`);
    return f.apply(this, a);
  };
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u, ...rest) {
    window.__sent.push(`xhr ${u}`);
    return open.call(this, m, u, ...rest);
  };
  if (navigator.sendBeacon) {
    const beacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (u, d) => {
      window.__sent.push(`beacon ${u}`);
      return beacon(u, d);
    };
  }
}

/** The home page: /check moved up. Prefill and swap send nothing; one click on Check sends one request. */
async function walkHome(browser, phone, pageErrors) {
  const HOME_URL = `http://127.0.0.1:${APP_PORT}/`;
  const home = await phone.newPage();
  home.on('pageerror', (e) => pageErrors.push(`home: ${e}`));
  await home.addInitScript(countSends);
  const engineHits = [];
  home.on('request', (r) => { if (r.url().startsWith(ENGINE)) engineHits.push(`${r.method()} ${r.url()}`); });
  const sent = () => home.evaluate(() => window.__sent.slice());
  const before = seen.length;
  const quiet = async () => {
    const s = await sent();
    return { ok: s.length === 0 && engineHits.length === 0 && seen.length === before, note: JSON.stringify({ sent: s, engineHits, engineSaw: seen.length - before }) };
  };

  await home.goto(HOME_URL, { waitUntil: 'networkidle' });
  check('home: the check form is prefilled with the false sample', (await home.inputValue('#claim')) === FALSE_SAMPLE);
  let q = await quiet();
  check('home: loading the page sends no request (fetch, XHR and beacon counted, engine counted)', q.ok, q.note);

  const privacyBox = await home.locator('#check-privacy').boundingBox().catch(() => null);
  const buttonBox = await home.locator('button[type=submit]').boundingBox().catch(() => null);
  check('home: the privacy line sits above the Check button', Boolean(privacyBox && buttonBox) && privacyBox.y + privacyBox.height <= buttonBox.y,
    `privacy ${privacyBox ? Math.round(privacyBox.y) : 'missing'} / button ${buttonBox ? Math.round(buttonBox.y) : 'missing'}`);
  check('home: Check is ready to click on the prefilled sentence', !(await home.locator('button[type=submit]').isDisabled()));
  check('home: no sideways scroll on a 390px phone', (await home.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) === false);
  const text = await home.locator('body').innerText();
  check('home: ChatGPT and Grok appear only in the not-yet line', text.split(NOT_YET).length === 2 && !/ChatGPT|\bGrok\b/.test(text.replace(NOT_YET, '')));
  check('home: no number followed by ms anywhere on the page', !/\d\s*ms\b/i.test(text), (text.match(/[^\n]*\d\s*ms\b[^\n]*/i) ?? [''])[0]);
  check('home: the old hero lines are gone', !/Get a receipt|family host verdict|paste your own claim|trinity-shofet|Check a claim in the chat|trustshell status/.test(text));
  if (process.env.SHOT_DIR) await home.screenshot({ path: join(process.env.SHOT_DIR, 'home-stubbed-390.png'), fullPage: true });

  await home.click(`[data-testid=check-sample][data-sample="${TRUE_SAMPLE}"]`);
  await home.waitForTimeout(500);
  await home.waitForLoadState('networkidle');
  check('home: the swap puts the true sample in the box', (await home.inputValue('#claim')) === TRUE_SAMPLE);
  q = await quiet();
  check('home: swapping the sample sends no request', q.ok, q.note);
  await home.click(`[data-testid=check-sample][data-sample="${FALSE_SAMPLE}"]`);
  check('home: the swap back restores the false sample', (await home.inputValue('#claim')) === FALSE_SAMPLE);

  // Positive control: the counters above must be able to see a request, or their zeros prove nothing.
  await home.click('button[type=submit]');
  await home.waitForSelector('[data-testid=check-label], [data-testid=check-error]', { timeout: 20_000 });
  const card = await shown(home);
  const posts = engineHits.filter((h) => h.startsWith('POST '));
  const fetches = (await sent()).filter((s) => s.includes('/api/v1/classify'));
  check('home: clicking Check sends exactly one request, with the box text, and shows Caught',
    posts.length === 1 && fetches.length === 1 && seen.length === before + 1 && seen.at(-1)?.text === FALSE_SAMPLE &&
      card.words === 'Caught' && card.title === 'veto' && /veto/.test(card.machine ?? ''),
    JSON.stringify({ posts, fetches, sentText: seen.at(-1)?.text, card }));
  if (process.env.SHOT_DIR) await home.screenshot({ path: join(process.env.SHOT_DIR, 'home-stubbed-390-caught.png'), fullPage: true });

  // The answer belonged to the false sentence; after a swap it must not stand next to the true one.
  await home.click(`[data-testid=check-sample][data-sample="${TRUE_SAMPLE}"]`);
  await home.waitForTimeout(500);
  const stale = await home.locator('[data-testid=check-result]').count();
  check('home: a swap after an answer clears it and sends nothing more', stale === 0 && seen.length === before + 1 &&
    engineHits.filter((h) => h.startsWith('POST ')).length === 1, JSON.stringify({ stale, engineSaw: seen.length - before }));
  await home.close();

  const wide = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const desk = await wide.newPage();
  desk.on('pageerror', (e) => pageErrors.push(`home 1440: ${e}`));
  await desk.addInitScript(countSends);
  await desk.goto(HOME_URL, { waitUntil: 'networkidle' });
  const deskSent = await desk.evaluate(() => window.__sent.slice());
  check('home: at 1440px, no sideways scroll and nothing sent on load',
    (await desk.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) === false && deskSent.length === 0, JSON.stringify(deskSent));
  if (process.env.SHOT_DIR) await desk.screenshot({ path: join(process.env.SHOT_DIR, 'home-stubbed-1440.png'), fullPage: true });
  await wide.close();
}

let browser;
try {
  if (!DEPLOYED && !(await waitForApp(PAGE_URL))) {
    console.error('FATAL: the app never became ready');
    process.exit(1);
  }
  browser = await chromium.launch(launchOpts);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  if (RELAY) await page.route(`${ENGINE}/api/v1/classify`, relayToProduction);
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  const netFailures = [];
  page.on('requestfailed', (r) => netFailures.push(`${r.method()} ${r.url()} ${r.failure()?.errorText ?? ''}`));
  const classifyCalls = [];
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/api/v1/classify')) classifyCalls.push(r.url()); });

  let response;
  try {
    response = await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 45_000 });
  } catch (e) {
    if (!DEPLOYED) throw e;
    // The browser never got an answer from the host: nothing about the page was observed.
    check('the deployed page loads in this browser', null, `${PAGE_URL}: ${String(e).split('\n')[0]}`);
    throw new SkipRest();
  }
  if (DEPLOYED) {
    const status = response?.status() ?? null;
    check('the deployed page answers 200', status === 200, `${PAGE_URL} → ${status ?? 'no response'}`);
    if (status !== 200) throw new SkipRest(); // a 404 page has no form to walk; that one FAILED says it
  }
  const body = await page.locator('body').innerText();
  check('the page names all three answers in the stranger words', ['Checks out', 'Caught', 'Not checked'].every((w) => body.includes(w)));
  check('the privacy line names where the text goes', /sent to our checkers, Groq and Cerebras/.test(body));
  const privacyBox = await page.locator('#check-privacy').boundingBox().catch(() => null);
  const buttonBox = await page.locator('button[type=submit]').boundingBox().catch(() => null);
  check('the privacy line sits above the Check button', Boolean(privacyBox && buttonBox) && privacyBox.y + privacyBox.height <= buttonBox.y,
    `privacy ${privacyBox ? Math.round(privacyBox.y) : 'missing'} / button ${buttonBox ? Math.round(buttonBox.y) : 'missing'}`);
  check('Check is disabled until something is typed', await page.locator('button[type=submit]').isDisabled());
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check('no sideways scroll on a 390px phone', overflow === false);

  if (LIVE) {
    for (const [sentence, want] of [
      ['Paris is the capital of France.', 'pass'],
      ['The Moon is made of cheese.', 'veto'],
      ['Pizza is the best food.', 'not-checked'],
    ]) {
      let got = await ask(page, sentence);
      // A voter that abstains (per-minute budget, timeout) makes the route answer not-checked. That
      // is the product being honest, so it is NOT_CHECKED here, never PASS and never FAIL. A WRONG
      // label (pass for the false sentence, anything but not-checked for the opinion) is a FAIL.
      //
      // ONE RETRY, after the budget window. Cerebras gets 4 calls in a rolling 60 s
      // (repid-engine src/classify/free-votes.ts), and the daily job runs --live and --deployed
      // back to back, so the second walk abstained on its own budget the first time it ran in CI
      // (run 37232890795). Only an abstention is retried; a wrong label is never asked again.
      let retried = '';
      if (got === 'not-checked' && want !== 'not-checked') {
        await page.waitForTimeout(ABSTAIN_RETRY_MS);
        const again = await ask(page, sentence);
        retried = ` (abstained, then asked again after ${Math.round(ABSTAIN_RETRY_MS / 1000)} s)`;
        got = again;
      }
      const abstained = got === 'not-checked' && want !== 'not-checked';
      check(`live: "${sentence}" gives ${want}`, abstained ? null : got === want,
        `got ${got}${retried}${abstained ? ' (abstained twice: see /api/v1/classify/stats)' : ''}${netFailures.length ? `; network: ${netFailures.join(' | ')}` : ''}`);
    }
    if (DEPLOYED) {
      // An unset NEXT_PUBLIC_REPID_ENGINE_URL at build time does not fail the build; the bundle just
      // calls whatever the fallback was. Name the engine the shipped page actually called.
      const want = `${ENGINE}/api/v1/classify`;
      check('the deployed page calls the production engine', classifyCalls.length > 0 && classifyCalls.every((u) => u === want),
        classifyCalls.length ? [...new Set(classifyCalls)].join(', ') : 'no classify call was made');
    }
  } else {
    // A network failure has to come from the browser's side; the stub server cannot fake one.
    await page.route(`${ENGINE}/api/v1/classify`, (route) =>
      /network-down/.test(route.request().postData() ?? '') ? route.abort('failed') : route.continue());

    let got = await ask(page, 'Paris is the capital of France.');
    let card = await shown(page);
    check('pass shows Checks out, with pass as the machine label', got === 'pass' && card.words === 'Checks out' && card.title === 'pass' && /pass/.test(card.machine ?? ''),
      JSON.stringify(card));
    check('the answer carries no speed number', card.card !== '' && !/\d|\bms\b/.test(card.card), JSON.stringify(card.card));
    const sent = seen.at(-1) ?? {};
    check(
      'the request is the shared contract: the text and the three labels',
      sent.text === 'Paris is the capital of France.' &&
        JSON.stringify(sent.labels) === JSON.stringify(['pass', 'veto', 'not-checked']),
      JSON.stringify(sent),
    );
    got = await ask(page, 'The Moon is made of cheese.');
    card = await shown(page);
    check('veto shows Caught and says both checkers said false', got === 'veto' && card.words === 'Caught' && card.title === 'veto' &&
      card.card.includes('Checked and found false.'), JSON.stringify(card));
    const pathText = () => page.locator('[data-testid=check-path]').textContent().catch(() => null);
    check('a vote answer names the voters that answered', (await pathText()) === 'Groq and Cerebras both said false.', String(await pathText()));
    got = await ask(page, '2 + 2 = 5');
    check('an arithmetic answer says no model was asked', got === 'veto' &&
      (await pathText()) === 'Decided by exact calculation. No model was asked.', String(await pathText()));
    got = await ask(page, 'Paris is the capital of France.');
    check('an answer that does not say what produced it gets no path line', got === 'pass' &&
      (await page.locator('[data-testid=check-path]').count()) === 0);
    got = await ask(page, 'Pizza is the best food.');
    card = await shown(page);
    check('the checkers\' own not-checked shows Not checked and says it was not decided', got === 'not-checked' &&
      card.words === 'Not checked' && card.source === 'checkers' && card.cause === null && /Not decided/.test(card.card), JSON.stringify(card));

    // Every not-checked the PAGE decided says which, and none of them ever shows Checks out.
    for (const [sentence, cause, name] of [
      ['maybe-label', 'body', 'a label outside the contract'],
      ['bad-json', 'body', 'a body that is not JSON'],
      ['server-error', 'http', 'a server error'],
      ['network-down', 'network', 'a network failure'],
      ['hang-forever', 'timeout', 'a checker that never answers (after the timeout)'],
    ]) {
      got = await ask(page, sentence);
      card = await shown(page);
      check(`${name} is Not checked and names its cause (${cause}), never Checks out`,
        got === 'not-checked' && card.words === 'Not checked' && card.title === 'not-checked' && card.source === 'local' &&
          card.cause === cause && !/Not decided/.test(card.card) && !card.card.includes('Checks out'),
        JSON.stringify(card));
    }
    await ask(page, 'My key is sb_secret_abcdefghijklmnop and Paris is in France.');
    const last = String(seen.at(-1)?.text ?? '');
    check('a pasted secret is scrubbed before it leaves the phone', last.includes('Paris') && !last.includes('sb_secret_abcdefghijklmnop'), last);
    const scrubbedLine = await page.locator('[data-testid=check-scrubbed]').textContent().catch(() => null);
    check('the answer says something was removed before sending', /Removed before sending/.test(scrubbedLine ?? ''), String(scrubbedLine));
    const email = 'jane.doe' + '@example.com';
    await ask(page, `Write to ${email}: Paris is in France.`);
    const mailed = String(seen.at(-1)?.text ?? '');
    check('a pasted email is scrubbed before it leaves the phone', mailed.includes('Paris') && !mailed.includes(email), mailed);
    await ask(page, 'Paris is the capital of France.');
    check('a clean sentence shows no removed-before-sending line', (await page.locator('[data-testid=check-scrubbed]').count()) === 0);

    await walkHome(browser, context, pageErrors);
  }
  check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

  if (process.env.SHOT_DIR) {
    await page.screenshot({ path: join(process.env.SHOT_DIR, `check-${MODE}.png`), fullPage: true });
  }
} catch (e) {
  if (!(e instanceof SkipRest)) throw e;
} finally {
  if (browser) await browser.close();
  killApp();
  engine.close();
}

const failed = results.filter((r) => r.pass === false);
const unchecked = results.filter((r) => r.pass === null);
console.log(`\n${results.length - failed.length - unchecked.length}/${results.length} checks passed, ${unchecked.length} not checked (${MODE}, page ${PAGE_URL}${DEPLOYED ? ` @ ${deployedCommit ?? 'unknown commit'}` : ''}, engine ${ENGINE}, transport ${TRANSPORT})`);

if (process.env.RECEIPT_DIR) {
  let sha = null;
  try { sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* not a checkout */ }
  mkdirSync(process.env.RECEIPT_DIR, { recursive: true });
  writeFileSync(
    join(process.env.RECEIPT_DIR, `check-walk.${MODE}.json`),
    JSON.stringify({ suite: 'check-walk', mode: MODE, transport: TRANSPORT, engine: ENGINE, page: PAGE_URL,
      ...(DEPLOYED ? { deployed_commit: deployedCommit } : {}), git_sha: sha, ran_at: new Date().toISOString(),
      verdict: failed.length ? 'FAILED' : unchecked.length ? 'NOT_CHECKED' : 'VERIFIED', checks: results }, null, 2) + '\n',
  );
}
process.exit(failed.length ? 1 : unchecked.length ? 2 : 0);
