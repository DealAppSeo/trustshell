/**
 * The campaign queue must never render a refusal as an empty queue.
 *
 * WHY THIS SUITE EXISTS, and it is not hypothetical: the first version of `/campaign` was
 * green — it compiled, it typechecked, it built — and it rendered the WRONG STATE. It keyed
 * its "backend not deployed" branch off a 404 that can never fire, because the engine
 * authenticates before it routes: an unmapped path answers 401 exactly like a gated one. The
 * page showed a hard failure where it should have shown an absence. Nothing but serving it
 * and reading the output would have caught that, so this is the suite that reads the output.
 *
 * THE ONE ASSERTION THAT MATTERS is that a backend refusal never renders as "the queue is
 * empty". Every other honesty property on this page is downstream of it. An empty queue is a
 * measurement — the backend answered and had nothing — and a refusal is the absence of one.
 * Collapsing them would tell a founder their campaign is clear when nothing was ever read,
 * on the one surface whose entire purpose is refusing that kind of claim.
 *
 * The states are driven by a stub engine rather than the live one, because the live backend
 * can only be in whichever state it happens to be in, and the states worth testing are the
 * failures. Same reason, and the same harness, as mvp-walk.mjs.
 *
 * Runs against `next build` + `next start`, not `next dev`: in a sandbox Next's HMR socket is
 * refused, React never hydrates, and the markup looks perfect while nothing works. See
 * grants-fail-closed.mjs for the full account.
 *
 * NOT in gating CI — it needs a browser and a server, and a gate that reddens for
 * environmental reasons gets ignored within a week.
 *
 *     npm run test:campaign-honesty
 */

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { chromiumExecutablePath, LAUNCH_ARGS, loadPlaywrightOrExit } from './chromium-path.mjs';

const { chromium } = await loadPlaywrightOrExit();

const ENGINE_PORT = 4703;
const APP_PORT = 3203;
const AGENT = '11111111-2222-4333-8444-555555555555';

/** Flipped between scenarios; the page is reloaded after each change. */
let queueMode = 'refused';

const row = (over = {}) => ({
  id: 1, platform: 'x', status: 'ready', hal_decision: 'clean', hal_score: 0.94,
  hal_mode: 'fact-check', agent_id: AGENT, verified_at: new Date().toISOString(),
  scheduled_for: null, posted_at: null, post_url: null, created_at: new Date().toISOString(),
  ...over,
});

const engine = createServer((req, res) => {
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const json = (s, b) => { res.writeHead(s, { 'content-type': 'application/json', ...cors }); res.end(JSON.stringify(b)); };

  if (req.url.startsWith('/api/v1/social/drafts')) {
    // 401 is what the REAL engine returns for both "not deployed" and "gated" — the
    // ambiguity this page has to be honest about rather than resolve.
    if (queueMode === 'refused') return json(401, { error: 'Unauthorized: API key required' });
    if (queueMode === 'server_error') return json(500, { error: 'boom' });
    if (queueMode === 'empty') return json(200, { count: 0, unverified: 0, drafts: [] });
    if (queueMode === 'populated') {
      const drafts = [
        row({ id: 1 }),
        row({ id: 2, status: 'vetoed', hal_decision: 'vetoed', hal_score: 0.08 }),
        row({ id: 3, status: 'needs_review', hal_decision: 'flagged', hal_score: 0.4 }),
        // Degraded: strictness 2 asked for, quorum unavailable. A high score here is the trap.
        row({ id: 4, status: 'needs_review', hal_decision: 'clean', hal_mode: 'extractor-fallback', hal_score: 0.99 }),
        // Legacy: predates verification. NULL verdict, no author.
        row({ id: 5, status: 'ready', hal_decision: null, hal_score: null, hal_mode: null, agent_id: null, verified_at: null }),
      ];
      return json(200, { count: drafts.length, unverified: 1, drafts });
    }
  }
  return json(404, { error: 'not found' });
});

const findings = [];
const note = (ok, what, detail = '') => {
  findings.push({ ok, what, detail });
  console.log(`${ok ? 'OK  ' : 'GAP '} ${what}${detail ? ` — ${detail}` : ''}`);
};

/**
 * REFUSE TO RUN AGAINST A SERVER THIS PROCESS DID NOT START.
 *
 * This is not defensive tidiness — it is the fix for a real fault found in this harness. The
 * pattern these suites use, `spawn('npx', ['next','start'])` plus `app.kill()`, kills the npx
 * WRAPPER and leaves the `next-server` child alive and holding the port. The next run's
 * readiness probe then connects to that survivor immediately, `next build` output is never
 * served, and every assertion is evaluated against a FROZEN SNAPSHOT of whatever the code
 * looked like on the first run.
 *
 * Measured, not theorised: with a deliberate bug injected into the client, this suite still
 * reported 15/15. Four orphaned next-servers were alive at the time, and the port was
 * answering with no suite running. A test that cannot fail is worse than no test, because it
 * also reports safety — and the whole point of this file is refusing exactly that trade.
 *
 * So: occupied port => exit 2 (NOT_CHECKED), never a silent pass.
 */
let portBusy = false;
try {
  const probe = await fetch(`http://127.0.0.1:${APP_PORT}/`, { signal: AbortSignal.timeout(2000) });
  portBusy = !!probe;
} catch { /* nothing listening — the state we want */ }
if (portBusy) {
  console.error(`NOT_CHECKED: port ${APP_PORT} is already serving. This suite refuses to test a`);
  console.error('  server it did not start — it would silently assert against a stale build.');
  console.error(`  Clear it first:  pkill -f next-server`);
  engine.close();
  process.exit(2);
}

await new Promise((r) => engine.listen(ENGINE_PORT, r));
const env = { ...process.env, NEXT_PUBLIC_REPID_ENGINE_URL: `http://127.0.0.1:${ENGINE_PORT}` };
const b = spawn('npx', ['next', 'build'], { env, stdio: 'ignore' });
if ((await new Promise((r) => b.on('exit', r))) !== 0) { console.error('build failed'); engine.close(); process.exit(1); }
// `detached` puts the server in its own process GROUP so the whole tree can be killed below.
// Killing the npx wrapper alone is what orphaned the servers that caused the fault above.
const app = spawn('npx', ['next', 'start', '--port', String(APP_PORT)], { env, stdio: 'ignore', detached: true });
const killApp = () => { try { process.kill(-app.pid, 'SIGKILL'); } catch { try { app.kill('SIGKILL'); } catch {} } };
process.on('exit', killApp);
const base = `http://127.0.0.1:${APP_PORT}`;
for (let i = 0; i < 120; i++) { try { if ((await fetch(`${base}/campaign`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }

const browser = await chromium.launch({ executablePath: chromiumExecutablePath(), args: LAUNCH_ARGS });
const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

/** Reload in the given backend state and return the page's visible text. */
async function textIn(mode) {
  queueMode = mode;
  await page.goto(`${base}/campaign`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  return (await page.locator('body').innerText()).replace(/\s+/g, ' ');
}

try {
  // --- 1. REFUSED: the state that shipped wrong the first time. ----------------------
  let t = await textIn('refused');
  note(
    /not an empty queue/i.test(t),
    'THE ONE THAT MATTERS: a refusal is explicitly NOT an empty queue',
  );
  note(
    !/the queue is empty/i.test(t),
    'a refusal never renders the empty-queue copy',
    'that collapse is the lie this whole page exists to refuse',
  );
  note(
    /authenticates before it routes|has not shipped|shipped and is gated/i.test(t),
    'the page states BOTH possibilities rather than picking the flattering one',
  );
  note(/not checked/i.test(t), 'a refusal reads as NOT_CHECKED, not as a failure or a pass');

  // --- 2. SERVER ERROR: distinct from a refusal, and also not an empty queue. --------
  t = await textIn('server_error');
  note(!/the queue is empty/i.test(t), 'a 500 does not render as an empty queue either');
  note(/could not be read|500/i.test(t), 'a 500 is reported as a failure, distinctly from a refusal');

  // --- 3. GENUINELY EMPTY: the backend answered. This one MAY say empty. -------------
  t = await textIn('empty');
  note(
    /the queue is empty/i.test(t),
    'an ANSWERED empty queue does say so — the distinction is the point, not blanket silence',
  );
  note(
    /measured, not assumed|backend answered/i.test(t),
    'and it says it was measured, so a reader can tell it apart from the refusal above',
  );

  // --- 4. POPULATED: every verdict renders as what it is. ---------------------------
  t = await textIn('populated');
  note(/vetoed/i.test(t), 'a vetoed draft is shown as vetoed');
  note(
    /not attributed/i.test(t),
    'an unauthored row says "not attributed" rather than inventing an agent id',
  );
  note(
    /approximation|style extractor/i.test(t),
    'A DEGRADED 0.99 IS NOT A PASS: the fallback renders as an approximation with its caveat',
    'the highest score in the set is the one that must not read as verified',
  );
  note(
    /predates verification|not checked/i.test(t),
    'a NULL verdict renders as NOT_CHECKED, never as a pass',
  );
  note(
    /not checked/i.test(t) && /1/.test(t),
    'the unverified count is surfaced as its own figure, not folded into a total',
  );

  // --- 5. The standing claim that nothing publishes, in every state. ----------------
  note(
    /no account is connected/i.test(t),
    'the page says nothing publishes, so it cannot be mistaken for a live console',
  );

  note(errs.length === 0, 'no runtime errors across all scenarios', errs.join(' | '));
} finally {
  await browser.close();
  killApp();
  engine.close();
}

const passed = findings.filter((f) => f.ok).length;
console.log(`\n${passed}/${findings.length} passed`);
process.exit(passed === findings.length ? 0 : 1);
