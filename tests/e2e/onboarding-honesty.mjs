/**
 * Onboarding: when creating an agent FAILS, does the page say so?
 *
 * WHAT THIS GUARDS. `/agents` is the surface the top nav ("Agents") and the hero button both
 * point at — it is where a first-time visitor lands to create their first agent. Its submit
 * handler used to swallow every failure:
 *
 *   * `NEXT_PUBLIC_REPID_ENGINE_URL` unset  → POST to the literal string
 *                                             "undefined/api/v1/agents/register", which resolves
 *                                             against this origin, 404s as HTML, and throws in
 *                                             `res.json()` → `console.error`
 *   * 429 / 409 on a taken name             → `data.agent_id` falsy → the `if` simply did not run
 *   * 500, or any unparseable body          → same two paths
 *
 * In all of them the spinner stopped and the page returned to exactly the state it was in before
 * the click. **A failed create and an unclicked button were the same observable event.** That is
 * this project's recurring defect — NOT CHECKED rendered as though nothing needed checking — on
 * the one screen whose entire job is to get somebody onboarded.
 *
 * THE LOAD-BEARING ASSERTION is A5: after a failed create the page must be OBSERVABLY DIFFERENT
 * from before it. Every other check here could be satisfied by an error string that renders
 * off-screen or behind a collapsed panel; this one fails unless a human would see it. It is
 * written against the rendered text rather than the DOM for the same reason.
 *
 * WHY THE `!ENGINE` GUARD GETS ITS OWN BUILD (phase B). `next build` INLINES `NEXT_PUBLIC_*` by
 * static analysis, so "the engine URL is empty" is a property of the BUNDLE, not of the server
 * process — it cannot be simulated by changing an env var at runtime. Phase B rebuilds with the
 * value set to `''`, which is the state AGENTS.md describes as sending "every fetch to the empty
 * string".
 *
 * IT DOES NOT TEST AN UNSET VARIABLE, AND THAT IS NOT AN OVERSIGHT. This repo commits a tracked
 * `.env.production` supplying the value, so a production bundle of it cannot have the variable
 * unset — measured, when phase B's first draft deleted the variable and watched the page POST to
 * the real Railway host anyway. `tests/engine-url-inlined.test.ts` pins that file in gating CI.
 *
 * NOT WIRED INTO GATING CI, for the same reason as its sibling suites — it needs a browser and a
 * server. Run it on demand:
 *
 *     npm run test:onboarding-honesty
 *
 * It drives a STUBBED backend: it proves the page tells the truth about a known response shape,
 * never that production returns that shape.
 */

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { chromiumExecutablePath, LAUNCH_ARGS, loadPlaywrightOrExit } from './chromium-path.mjs';

const { chromium } = await loadPlaywrightOrExit();

const ENGINE_PORT = 4611;
const APP_PORT = 3108;

/**
 * 'ok' | 'taken' | 'boom' | 'garbage'
 *
 * `garbage` returns HTTP 200 with an HTML body — the shape a misrouted request actually takes
 * when it lands on a web server instead of the API. A stub that only ever returns well-formed
 * JSON cannot reproduce the original bug, which died inside `res.json()`.
 */
let registerMode = 'ok';
let registerCount = 0;

const engine = createServer((req, res) => {
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
  };
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    return res.end();
  }
  const json = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json', ...cors });
    res.end(JSON.stringify(body));
  };

  const url = req.url.split('?')[0];

  if (url === '/api/v1/agents/register') {
    registerCount += 1;
    if (registerMode === 'taken') return json(429, { error: 'agent name already registered' });
    if (registerMode === 'boom') return json(500, { error: 'internal error' });
    if (registerMode === 'garbage') {
      res.writeHead(200, { 'content-type': 'text/html', ...cors });
      return res.end('<!doctype html><html><body>not the api</body></html>');
    }
    return json(201, {
      agent_id: `agent-${registerCount}-0000-4000-8000-000000000000`,
      api_key: 'ts_live_stub',
    });
  }

  // The RepID read each agent card makes for itself.
  //
  // THE ENDPOINT AND THE FIELD NAMES ARE BOTH LOAD-BEARING, and this stub had them wrong on its
  // first run. `lib/agent-repid.ts` reads `GET /api/v1/agents/:id/card` and requires a NUMERIC
  // `repid`; anything else is `FAILED: bad_response` by design, because "a 200 whose body has no
  // repid is not a zero-scoring agent, it is a response shape we do not understand". Stubbing
  // `/api/v1/repid/:id` with `repid_score` therefore produced a card that said, correctly, that
  // it could not read the answer — and the suite caught it. A stub with a convenient shape
  // proves the test passes, not that the product works.
  if (/^\/api\/v1\/agents\/[^/]+\/card$/.test(url)) {
    return json(200, {
      repid: 1200,
      total_decisions: 4,
      last_active_at: new Date().toISOString(),
      provenance: { verifiable_share_of_gains: 0.9, summary: '90% of gains externally verifiable', sampled: false },
    });
  }

  return json(404, { error: 'not found' });
});

const results = [];
const check = (name, pass, note = '') => {
  results.push({ name, pass, note });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${note ? ` — ${note}` : ''}`);
};

async function waitForApp(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function buildAndStart(buildEnv, label) {
  const build = spawn('npx', ['next', 'build'], { env: buildEnv, stdio: 'ignore' });
  const buildCode = await new Promise((r) => build.on('exit', r));
  if (buildCode !== 0) {
    console.error(`FATAL: next build (${label}) exited ${buildCode}`);
    return null;
  }
  const app = spawn('npx', ['next', 'start', '--port', String(APP_PORT)], {
    env: buildEnv,
    stdio: 'ignore',
    detached: true,
  });
  const kill = () => {
    try { process.kill(-app.pid, 'SIGKILL'); } catch { try { app.kill('SIGKILL'); } catch { /* gone */ } }
  };
  if (!(await waitForApp(`http://127.0.0.1:${APP_PORT}/agents`))) {
    console.error(`FATAL: the app never became ready (${label})`);
    kill();
    return null;
  }
  return kill;
}

/** Fill the form and submit. Returns the page text immediately before the click. */
async function createAgent(page, name) {
  const before = await page.locator('body').innerText();
  await page.getByPlaceholder('e.g. Support Copilot').fill(name);
  await page.getByRole('button', { name: /create agent/i }).click();
  // The handler is async; wait for the button to settle out of its pending label.
  await page.waitForFunction(
    () => !/Registering/i.test(document.body.innerText),
    undefined,
    { timeout: 15_000 },
  ).catch(() => { /* asserted on below, not here */ });
  return before;
}

engine.listen(ENGINE_PORT);

// Refuse to run against a server this process did not start — `npx next start` + `.kill()`
// orphans the `next-server` child, which then holds the port and serves a FROZEN build to every
// later run. A suite that cannot fail also reports safety. Occupied port => 2 (NOT_CHECKED).
let portBusy = false;
try {
  portBusy = !!(await fetch(`http://127.0.0.1:${APP_PORT}/`, { signal: AbortSignal.timeout(2000) }));
} catch { /* nothing listening — the state we want */ }
if (portBusy) {
  console.error(`NOT_CHECKED: port ${APP_PORT} is already serving. This suite refuses to test a`);
  console.error('  server it did not start — it would silently assert against a stale build.');
  console.error('  Clear it first:  pkill -f next-server');
  engine.close();
  process.exit(2);
}

let browser;
let killApp;
try {
  browser = await chromium.launch({ executablePath: chromiumExecutablePath(), args: LAUNCH_ARGS });

  // ============================================================ PHASE A — engine URL present
  const withEngine = { ...process.env, NEXT_PUBLIC_REPID_ENGINE_URL: `http://127.0.0.1:${ENGINE_PORT}` };
  killApp = await buildAndStart(withEngine, 'phase A');
  if (!killApp) process.exit(1);

  // A fresh context per phase: agents live in IndexedDB, so a shared one would carry rows
  // between phases and make "no agent was added" unreadable.
  let ctx = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
  let page = await ctx.newPage();

  // ---------------------------------------------------------------- A1. the happy path
  registerMode = 'ok';
  await page.goto(`http://127.0.0.1:${APP_PORT}/agents`, { waitUntil: 'domcontentloaded' });
  await createAgent(page, 'Honest Agent');
  await page.waitForFunction(() => /Honest Agent/.test(document.body.innerText), undefined, { timeout: 15_000 })
    .catch(() => { /* asserted below */ });
  let body = await page.locator('body').innerText();

  check('a successful create adds the agent to the list', body.includes('Honest Agent'));
  check('and no error is shown on the happy path', !/Nothing was created|is taken|Register failed/i.test(body));
  check(
    'the new agent shows a RepID, not just a name',
    /RepID/i.test(body) && /1,200|1200/.test(body),
    'the card looks itself up; a create that cannot be seen to have worked is half an onboarding',
  );

  // ---------------------------------------------------------------- A2. the name is taken
  registerMode = 'taken';
  await createAgent(page, 'Taken Name');
  body = await page.locator('body').innerText();

  check(
    'a 429 says the name is taken, in words',
    /That name is taken/i.test(body),
    'the old handler read only `data.agent_id`, so 429 and 409 were indistinguishable from success-with-no-id',
  );
  check('and the taken name was NOT added to the list', !body.includes('Taken Name') || !/Runs in this browser/.test(body.split('Taken Name')[1] ?? ''));

  // ---------------------------------------------------------------- A3. the engine errors
  registerMode = 'boom';
  const beforeBoom = await createAgent(page, 'Boom Agent');
  body = await page.locator('body').innerText();

  check('a 500 surfaces a failure to the person who clicked', /Register failed|internal error|Could not reach/i.test(body));
  check('a 500 does not add an agent', !body.includes('Boom Agent'));

  // ------------------------------------------- A5 (THE LOAD-BEARING ONE, asserted on A3's click)
  check(
    'THE LOAD-BEARING ONE: a failed create leaves the page OBSERVABLY different from before it',
    body !== beforeBoom,
    'before the fix these two strings were identical: a failed create and an unclicked button were the same event',
  );

  // ---------------------------------------------------------------- A4. an unparseable body
  registerMode = 'garbage';
  await createAgent(page, 'Garbage Agent');
  body = await page.locator('body').innerText();

  check(
    'a 200 with an HTML body is reported, not swallowed',
    /Register failed|Could not reach|Nothing was created/i.test(body),
    'this is the shape the original bug died on — `res.json()` throwing inside a bare catch',
  );
  check('and it does not add an agent either', !body.includes('Garbage Agent'));

  if (process.env.SHOT_DIR) {
    await page.screenshot({ path: `${process.env.SHOT_DIR}/onboarding-failure-visible.png`, fullPage: true });
  }

  await ctx.close();
  killApp();
  killApp = null;

  // ======================================== PHASE B — engine URL EMPTY IN THE BUNDLE
  //
  // SET TO '', NOT DELETED, AND THE REASON IS A MEASUREMENT THIS SUITE MADE.
  //
  // The first version of this phase deleted the variable from the spawn environment and expected
  // the guard to fire. It did not: the page POSTed to
  // `https://repid-engine-production.up.railway.app/api/v1/agents/register`. **This repo commits
  // a tracked `.env.production` that sets the variable**, and `next build` loads it — so deleting
  // it from the spawn env removes nothing. A production bundle of THIS repo can never have the
  // variable unset, which is a good property and also means the unset case is not the one to
  // test here.
  //
  // An explicitly empty value in `process.env` DOES take precedence over `.env.production`, and
  // `''` is what `!ENGINE` is actually guarding: AGENTS.md records a run where a bundle built
  // without the variable "sends every fetch to the empty string" and eight assertions failed in
  // a way that read as "the pages are broken". That is the state reproduced below.
  //
  // The complementary invariant — that `.env.production` keeps supplying a real URL, so this
  // state cannot ship — is pinned in gating CI by `tests/engine-url-inlined.test.ts`, because it
  // is a fact about a file and does not need a browser to check.
  const withoutEngine = { ...process.env, NEXT_PUBLIC_REPID_ENGINE_URL: '' };
  killApp = await buildAndStart(withoutEngine, 'phase B');
  if (!killApp) process.exit(1);

  ctx = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
  page = await ctx.newPage();

  // Any request the page makes to THIS origin's register path is the old bug: the template
  // literal `${undefined}/api/v1/agents/register` resolves here. The guard must short-circuit
  // before a request is made at all.
  const strayRegisterRequests = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/v1/agents/register')) strayRegisterRequests.push(r.url());
  });

  registerMode = 'ok';   // irrelevant — nothing should reach the stub
  const registerCountBeforeB = registerCount;
  await page.goto(`http://127.0.0.1:${APP_PORT}/agents`, { waitUntil: 'domcontentloaded' });
  const beforeB = await createAgent(page, 'Unconfigured Deploy');
  body = await page.locator('body').innerText();

  check(
    'an empty engine URL names the variable instead of appearing to work',
    /NEXT_PUBLIC_REPID_ENGINE_URL/.test(body),
    'the operator can act on a variable name; they cannot act on a button that does nothing',
  );
  check('an empty engine URL says nothing was created', /Nothing was created/i.test(body));
  check('and the page is observably different from before the click', body !== beforeB);
  check('no agent was added', !body.includes('Unconfigured Deploy') || !/ID copied|Runs in this browser/.test(body.split('Unconfigured Deploy')[1] ?? ''));
  check(
    'the guard short-circuits: NO register request was issued at all',
    strayRegisterRequests.length === 0,
    `saw ${strayRegisterRequests.length}: ${strayRegisterRequests.join(', ')}`,
  );
  check(
    'and nothing reached the stub engine either',
    registerCount === registerCountBeforeB,
    `stub saw ${registerCount - registerCountBeforeB} register call(s)`,
  );

  if (process.env.SHOT_DIR) {
    await page.screenshot({ path: `${process.env.SHOT_DIR}/onboarding-unconfigured.png`, fullPage: true });
  }

  await ctx.close();
} finally {
  if (browser) await browser.close();
  if (killApp) killApp();
  engine.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
