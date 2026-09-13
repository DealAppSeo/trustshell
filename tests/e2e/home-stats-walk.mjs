/**
 * Home-page live-stats guard: the "Trust leaderboard" widget must POPULATE, not hang.
 *
 * WHY THIS EXISTS. The homepage `LiveTrustScores` widget (components/live-trust-scores.tsx)
 * fetches the public repid-engine leaderboard endpoints CLIENT-SIDE (no keys, CORS-allowlisted)
 * and renders real numbers. Its three visible states are: "Loading live scores…", an error card
 * ("Couldn't reach the scoring engine"), or the populated snapshot. A field report (#58) had it
 * stuck on "Loading live scores…" — and the root cause named at the time (a legacy Supabase anon
 * key) did NOT apply, because this widget uses NO Supabase and NO key. SSR renders the "Loading…"
 * markup identically whether or not the client fetch ever resolves, so curl can never tell the
 * populated state from the stuck one. This clicks: it asserts the widget leaves the loading state
 * and shows the numbers the engine returned.
 *
 * The stub returns the FAITHFUL shapes of /api/v1/leaderboard/{models,agents} (verified against the
 * live endpoints 2026-09-13), so a real number from the response has to reach the DOM for the
 * assertions to pass. It proves the client path against a known-good shape — never that production
 * returns that shape; that is the separate live check, recorded in the PR that adds this.
 *
 * NOT in gating CI — needs a browser and a server, same as its siblings (see mvp-walk.mjs for the
 * full account of build-vs-probe and why these run against `next build` + `next start`). Playwright
 * absent → exit 2 = NOT_CHECKED; any gap → exit 1.
 *
 *     npm run test:home-stats-walk
 */

import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { chromiumExecutablePath, LAUNCH_ARGS, loadPlaywrightOrExit } from './chromium-path.mjs';

const { chromium } = await loadPlaywrightOrExit();

const ENGINE_PORT = 4703;
const APP_PORT = 3203;

// A real, checkable number from the agents board — it must appear in the rendered widget.
const TOP_AGENT = 'trinity-shofet';
const TOP_AGENT_REPID = 2177;

const seen = [];
const modelRow = (rank, id, cls, acc, composite) => ({
  rank, model_id: id, model: id, class: cls,
  accuracy: acc, brier: 0.2, latency_ms: 800, cost_per_1m: 2.5, composite,
});
const agentRow = (id, repid, verified) => ({
  agent_id: id, model: null, repid_total: repid, rounds_scored: 0,
  avg_accuracy: null, errors: 0, verified,
});

const engine = createServer((req, res) => {
  const path = req.url.split('?')[0];
  seen.push(`${req.method} ${path}`);
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const json = (s, b) => { res.writeHead(s, { 'content-type': 'application/json', ...cors }); res.end(JSON.stringify(b)); };

  if (path.endsWith('/api/v1/leaderboard/models')) {
    const perf = [modelRow(1, 'gpt-4o', 'FRONTIER', 0.91, 0.88), modelRow(2, 'claude', 'FRONTIER', 0.89, 0.86), modelRow(3, 'llama-3.3-70b', 'OPEN-FREE', 0.82, 0.90)];
    const value = [modelRow(1, 'llama-3.3-70b', 'OPEN-FREE', 0.82, 0.90), modelRow(2, 'gpt-4o', 'FRONTIER', 0.91, 0.88), modelRow(3, 'claude', 'FRONTIER', 0.89, 0.86)];
    return json(200, { metric: 'code-review-discrimination', last_updated: '2026-09-13T00:00:00Z',
      lenses: { performance: { label: 'Performance', ranked_by: 'accuracy', models: perf },
                value: { label: 'Value', ranked_by: 'composite', models: value } } });
  }
  if (path.endsWith('/api/v1/leaderboard/agents')) {
    return json(200, { total_agents: 12, last_updated: '2026-09-13T00:00:00Z',
      agents: [agentRow(TOP_AGENT, TOP_AGENT_REPID, true), agentRow('trinity-nexus', 1861, false), agentRow('trinity-orch', 1839, false)] });
  }
  // The homepage mounts other client widgets (on-chain / HAL stats). Answer them 200 so nothing on
  // the page errors in a way that could break hydration; their content is not what this suite asserts.
  return json(200, {});
});

const findings = [];
const note = (ok, what, detail = '') => {
  findings.push({ ok, what, detail });
  console.log(`${ok ? 'OK  ' : 'GAP '} ${what}${detail ? ` — ${detail}` : ''}`);
};

// Refuse to test a server this process did not start (see mvp-walk.mjs for the orphan-server fault).
let __portBusy = false;
try {
  const __probe = await fetch(`http://127.0.0.1:${APP_PORT}/`, { signal: AbortSignal.timeout(2000) });
  __portBusy = !!__probe;
} catch { /* nothing listening — the state we want */ }
if (__portBusy) {
  console.error(`NOT_CHECKED: port ${APP_PORT} is already serving. This suite refuses to test a`);
  console.error('  server it did not start.  Clear it first:  pkill -f next-server');
  process.exit(2);
}

await new Promise((r) => engine.listen(ENGINE_PORT, r));
const ENGINE_URL = `http://127.0.0.1:${ENGINE_PORT}`;
// The widget reads NEXT_PUBLIC_REPID_ENGINE_URL (inlined at build). Point it at the stub.
const env = { ...process.env, NEXT_PUBLIC_REPID_ENGINE_URL: ENGINE_URL };

// Cross-platform so the operator (Windows) can run it, not only the Linux sandbox: npx.cmd needs a
// shell (Node 22 EINVAL on .cmd otherwise), the process-group kill is POSIX-only, and Turbopack
// panics on this worktree's junctioned node_modules so Windows builds with webpack.
const WIN = process.platform === 'win32';
const NPX = WIN ? 'npx.cmd' : 'npx';
const buildArgs = WIN ? ['next', 'build', '--webpack'] : ['next', 'build'];
const b = spawn(NPX, buildArgs, { env, stdio: 'ignore', shell: WIN });
if ((await new Promise((r) => b.on('exit', r))) !== 0) { console.error('build failed'); engine.close(); process.exit(1); }
const app = spawn(NPX, ['next', 'start', '--port', String(APP_PORT)], { env, stdio: 'ignore', detached: !WIN, shell: WIN });
const killApp = () => {
  if (WIN) { try { spawnSync('taskkill', ['/pid', String(app.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* best effort */ } return; }
  try { process.kill(-app.pid, 'SIGKILL'); } catch { try { app.kill('SIGKILL'); } catch {} }
};
process.on('exit', killApp);
const base = `http://127.0.0.1:${APP_PORT}`;
for (let i = 0; i < 120; i++) { try { if ((await fetch(`${base}/`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }

const browser = await chromium.launch({ executablePath: chromiumExecutablePath(), args: LAUNCH_ARGS });
const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

try {
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  // Give the client fetch + render a beat past networkidle.
  await page.waitForTimeout(2500);
  const section = page.locator('section:has-text("Trust leaderboard")');
  const txt = await section.innerText().catch(() => '(section not found)');

  note(seen.some((s) => s.includes('/leaderboard/models')) && seen.some((s) => s.includes('/leaderboard/agents')),
    'the widget fetched BOTH leaderboard endpoints', seen.filter((s) => s.includes('leaderboard')).length + ' calls');
  note(!/Loading live scores/i.test(txt),
    'the widget leaves the "Loading live scores…" state — it does not hang',
    /Loading live scores/i.test(txt) ? 'STILL STUCK' : '');
  note(!/Couldn.t reach the scoring engine/i.test(txt),
    'the widget does not show the engine-unreachable error card');
  note(txt.includes(TOP_AGENT) && txt.includes(TOP_AGENT_REPID.toLocaleString()),
    'a REAL number from the engine reaches the DOM (top agent + its RepID)',
    `looking for ${TOP_AGENT} / ${TOP_AGENT_REPID.toLocaleString()}`);
  note(/gpt-4o/i.test(txt) && /VALUE|acc/i.test(txt),
    'the model snapshot cards render their rows too');
  note(errs.length === 0, 'no runtime errors on the homepage', errs.slice(0, 3).join('; '));
} catch (e) {
  note(false, 'home-stats walk aborted', e.message.split('\n')[0]);
} finally {
  await browser.close(); killApp(); engine.close();
}

const gaps = findings.filter((f) => !f.ok);
console.log(`\n${findings.length - gaps.length}/${findings.length} OK`);
if (gaps.length) console.log('GAPS:\n' + gaps.map((g) => `  - ${g.what}${g.detail ? ` (${g.detail})` : ''}`).join('\n'));

// NOT_CHECKED and FAILED must never share an exit code with success. Gaps → exit 1.
if (gaps.length) process.exit(1);
