/**
 * The phone door: a stranger on a phone opens trustshell.dev/check, pastes one sentence and gets
 * pass, veto or not-checked. NORTH milestone 1 says "a stranger gets a real label on the phone";
 * this suite is that sentence made executable.
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
    if (/cheese/.test(text)) return json(200, { label: 'veto', latency_ms: 230 });
    if (/pizza/i.test(text)) return json(200, { label: 'not-checked', latency_ms: 190 });
    if (/maybe-label/.test(text)) return json(200, { label: 'probably', latency_ms: 5 });
    if (/server-error/.test(text)) return json(500, { error: 'boom' });
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

// Thrown to stop the walk once a check has said NOT_CHECKED for everything after it.
class SkipRest extends Error {}

async function ask(page, sentence) {
  await page.fill('#claim', sentence);
  await page.click('button[type=submit]');
  await page.waitForSelector('[data-testid=check-label], [data-testid=check-error]', { timeout: 20_000 });
  const label = await page.locator('[data-testid=check-label]').textContent().catch(() => null);
  return label?.trim() ?? null;
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
  check('the page names all three answers', ['pass', 'veto', 'not-checked'].every((w) => body.includes(w)));
  check('the privacy line names where the text goes', /sent to our checkers, Groq and Cerebras/.test(body));
  check('Check is disabled until something is typed', await page.locator('button[type=submit]').isDisabled());
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check('no sideways scroll on a 390px phone', overflow === false);

  if (LIVE) {
    for (const [sentence, want] of [
      ['Paris is the capital of France.', 'pass'],
      ['The Moon is made of cheese.', 'veto'],
      ['Pizza is the best food.', 'not-checked'],
    ]) {
      const got = await ask(page, sentence);
      // A voter that abstains (per-minute budget, timeout) makes the route answer not-checked. That
      // is the product being honest, so it is NOT_CHECKED here, never PASS and never FAIL. A WRONG
      // label (pass for the false sentence, anything but not-checked for the opinion) is a FAIL.
      const abstained = got === 'not-checked' && want !== 'not-checked';
      check(`live: "${sentence}" gives ${want}`, abstained ? null : got === want,
        `got ${got}${abstained ? ' (abstained: see /api/v1/classify/stats)' : ''}${netFailures.length ? `; network: ${netFailures.join(' | ')}` : ''}`);
    }
    if (DEPLOYED) {
      // An unset NEXT_PUBLIC_REPID_ENGINE_URL at build time does not fail the build; the bundle just
      // calls whatever the fallback was. Name the engine the shipped page actually called.
      const want = `${ENGINE}/api/v1/classify`;
      check('the deployed page calls the production engine', classifyCalls.length > 0 && classifyCalls.every((u) => u === want),
        classifyCalls.length ? [...new Set(classifyCalls)].join(', ') : 'no classify call was made');
    }
  } else {
    check('pass shows pass', (await ask(page, 'Paris is the capital of France.')) === 'pass');
    const sent = seen.at(-1) ?? {};
    check(
      'the request is the shared contract: the text and the three labels',
      sent.text === 'Paris is the capital of France.' &&
        JSON.stringify(sent.labels) === JSON.stringify(['pass', 'veto', 'not-checked']),
      JSON.stringify(sent),
    );
    check('veto shows veto', (await ask(page, 'The Moon is made of cheese.')) === 'veto');
    check('not-checked shows not-checked', (await ask(page, 'Pizza is the best food.')) === 'not-checked');
    check('a label outside the contract is not-checked, never shown as given', (await ask(page, 'maybe-label')) === 'not-checked');
    check('a server error is not-checked, never pass', (await ask(page, 'server-error')) === 'not-checked');
    check('a checker that never answers is not-checked after the timeout', (await ask(page, 'hang-forever')) === 'not-checked');
    await ask(page, 'My key is sb_secret_abcdefghijklmnop and Paris is in France.');
    const last = String(seen.at(-1)?.text ?? '');
    check('a pasted secret is scrubbed before it leaves the phone', last.includes('Paris') && !last.includes('sb_secret_abcdefghijklmnop'), last);
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
