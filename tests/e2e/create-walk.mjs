/**
 * Path A end-to-end: the two doors to a first PAI, both against ONE stub engine.
 *
 * Path A is "create a PAI and see the harness work" — and it has exactly two entrances:
 *   1. the web page  `/create`      (app/create/page.tsx) — a browser, client-side path
 *   2. the CLI       `init-pai.mjs` (scripts/init-pai.mjs) — a Node subprocess via the SDK
 * This walks BOTH against the same stubbed backend, so the two doors are proven to open onto
 * the same behaviour: register once, HAL PASSes a true claim and VETOes a false one, a RepID
 * comes back, and a second PAI gets its OWN store rather than clobbering the first.
 *
 * WHY A BROWSER, NOT curl. `/create`'s value moments — the apiKey shown once, the VETO hero,
 * the RepID, the "what just happened" summary, the reset-to-a-second-PAI — all happen AFTER
 * React mounts, in onCreate(). SSR HTML renders identically whether or not React hydrates, so
 * curl can never tell you the click path is alive. This suite clicks. (See mvp-walk.mjs for the
 * full account of why these suites run against `next build` + `next start`, not `next dev`.)
 *
 * WHY init-pai IN THE SAME SUITE. The store-isolation unit test proves the writePrivate/DIR
 * mechanism deterministically; this proves the WHOLE CLI leg end-to-end — register → verify →
 * RepID → local files — and that a second TRUSTSHELL_HOME does not overwrite the first, exercised
 * through the real SDK against the stub. The SDK reads TRUSTSHELL_API_URL for its baseUrl, so
 * pointing that at the stub keeps this off production (NEXT_PUBLIC_REPID_ENGINE_URL is the PAGE's
 * knob; the SDK ignores it — a live init-pai hits prod and creates real agents).
 *
 * NOT in gating CI — it needs a browser and a server, same as its siblings. Playwright is not a
 * dependency; absent, this exits 2 = NOT_CHECKED rather than a stack trace. The stub is a
 * known-good response shape, never proof that production returns it — that is a separate check.
 *
 *     npm run test:create-walk
 */

import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromiumExecutablePath, LAUNCH_ARGS, loadPlaywrightOrExit } from './chromium-path.mjs';

const { chromium } = await loadPlaywrightOrExit();

const ENGINE_PORT = 4702;
const APP_PORT = 3202;
// A UUID, because the engine issues UUIDs and the page echoes the agent_id verbatim.
const AGENT_ID = 'b2d9f1e5-88c3-4a40-9f6b-3c7e1d05a842';
const API_KEY = 'ts_live_createwalk_shown_once';

const seen = [];
// The stub answers BOTH the page and the SDK: same /register, /hal/evaluate, /repid/:id, plus
// /health for TrustShell.init()'s reachability probe. HAL keys off the text so Rome VETOes.
const engine = createServer(async (req, res) => {
  seen.push(`${req.method} ${req.url.split('?')[0]}`);
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const json = (s, b) => { res.writeHead(s, { 'content-type': 'application/json', ...cors }); res.end(JSON.stringify(b)); };
  const u = req.url;

  if (u === '/health' || u.endsWith('/health')) return json(200, { status: 'ok' });

  if (u.includes('/agents/register')) {
    return json(201, {
      agent_id: AGENT_ID, api_key: API_KEY,
      starting_score: 200, repid: 200, tier: 'PROBATIONARY', erc8004_token_id: null,
    });
  }

  if (u.includes('/hal/evaluate')) {
    let body = '';
    for await (const c of req) body += c;
    const text = (() => { try { return JSON.parse(body).text || ''; } catch { return ''; } })();
    // Rome/Eiffel is the false claim → VETO; everything else (Paris) → clean/PASS.
    const vetoed = /eiffel|rome/i.test(text);
    return json(200, vetoed
      ? { decision: 'vetoed', hal_score: 0.92 }
      : { decision: 'clean', hal_score: 0.03 });
  }

  if (/\/api\/v1\/repid\/[^/]+$/.test(u.split('?')[0])) {
    return json(200, { repid_score: 200, tier: 'PROBATIONARY' });
  }

  return json(404, { error: 'not found' });
});

const findings = [];
const note = (ok, what, detail = '') => {
  findings.push({ ok, what, detail });
  console.log(`${ok ? 'OK  ' : 'GAP '} ${what}${detail ? ` — ${detail}` : ''}`);
};

// Refuse to test a server this process did not start — otherwise we assert against a stale
// build. (The full account of the orphaned-next-server fault is in mvp-walk.mjs.)
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
// The PAGE reads NEXT_PUBLIC_REPID_ENGINE_URL (inlined at build); the SDK reads TRUSTSHELL_API_URL.
// Set both to the stub so neither door touches production.
const env = { ...process.env, NEXT_PUBLIC_REPID_ENGINE_URL: ENGINE_URL, TRUSTSHELL_API_URL: ENGINE_URL };

// Cross-platform: `npx` is `npx.cmd` on Windows, and the process-GROUP kill (`kill(-pid)`) is
// POSIX-only. The sibling suites assume the Linux sandbox; the operator runs Windows, so a suite
// that only runs on the OS nobody's on is a suite nobody can invoke.
// Node 22 refuses to spawn a .cmd without shell:true (EINVAL), so on Windows we shell out.
// On Windows this worktree's `node_modules` is a JUNCTION to repos/trustshell; Turbopack (the
// default builder) panics on a symlinked node_modules "out of the filesystem root", so build with
// webpack there. The Linux sandbox has a real node_modules and keeps the default builder.
const WIN = process.platform === 'win32';
const NPX = WIN ? 'npx.cmd' : 'npx';
const buildArgs = WIN ? ['next', 'build', '--webpack'] : ['next', 'build'];
const b = spawn(NPX, buildArgs, { env, stdio: 'ignore', shell: WIN });
if ((await new Promise((r) => b.on('exit', r))) !== 0) { console.error('build failed'); engine.close(); process.exit(1); }
const app = spawn(NPX, ['next', 'start', '--port', String(APP_PORT)], { env, stdio: 'ignore', detached: !WIN, shell: WIN });
const killApp = () => {
  // SYNCHRONOUS on Windows: killApp runs from a process 'exit' handler (e.g. if chromium.launch
  // throws before the try block), and an async spawn would never complete there — leaking a
  // next-server that then trips the port-busy guard on the next run. spawnSync finishes in-line.
  if (WIN) { try { spawnSync('taskkill', ['/pid', String(app.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* best effort */ } return; }
  try { process.kill(-app.pid, 'SIGKILL'); } catch { try { app.kill('SIGKILL'); } catch {} }
};
process.on('exit', killApp);
const base = `http://127.0.0.1:${APP_PORT}`;
for (let i = 0; i < 120; i++) { try { if ((await fetch(`${base}/create`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }

const browser = await chromium.launch({ executablePath: chromiumExecutablePath(), args: LAUNCH_ARGS });
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

try {
  // === DOOR 1: the /create web page ===================================================
  await page.goto(`${base}/create`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Empty-name guard is a CLIENT path (rejectEmptyName) — clicking Create with a blank field must
  // guide, not fire a request. curl cannot see this; a click can.
  await page.getByRole('button', { name: /^Create$/ }).click();
  await page.waitForTimeout(400);
  let body = await page.locator('body').innerText();
  note(/Give your PAI a name first/i.test(body), 'empty name is refused client-side with guidance');
  note(!seen.some((s) => s.includes('/agents/register')), 'and no register request fired on the empty submit');

  // Name it and create.
  await page.locator('[data-tour="name"]').fill('Atlas');
  await page.getByRole('button', { name: /^Create$/ }).click();
  await page.waitForTimeout(2500);
  body = await page.locator('body').innerText();

  note(seen.some((s) => s.includes('/agents/register')), 'Create hits the real register endpoint');
  note(body.includes(AGENT_ID), 'the agentId is shown after create');
  const keyText = await page.locator('[data-tour="key"]').innerText().catch(() => '');
  note(keyText.includes(API_KEY), 'the apiKey is shown', keyText ? '' : 'data-tour="key" not found');
  note(/Shown once/i.test(body) && /not be shown again/i.test(body),
    'the apiKey is disclosed as shown-once, not stored server-side');

  // The hero: Rome is false and must VETO. This is the moment the whole page exists for.
  const vetoText = await page.locator('[data-tour="veto"]').innerText().catch(() => '');
  note(/caught a false claim/i.test(vetoText),
    'the Rome VETO hero fires — a false claim is caught before the user acts on it',
    vetoText ? '' : 'data-tour="veto" not present (Rome did not VETO)');
  note(/Paris/i.test(body) && /Rome/i.test(body) && /VETO/.test(body) && /PASS/.test(body),
    'both checks are shown: Paris → PASS, Rome → VETO');
  note(seen.filter((s) => s.includes('/hal/evaluate')).length >= 2,
    'both HAL checks hit the real endpoint', `${seen.filter((s) => s.includes('/hal/evaluate')).length} calls`);

  note(/\b200\b/.test(body) && /PROBATIONARY/i.test(body), 'the RepID reads its live figure and tier');
  note(seen.some((s) => /\/repid\//.test(s)), 'the RepID read hit the real endpoint');
  note(/What just happened/i.test(body), 'the "what just happened" summary is shown');

  // The second-PAI button resets the page to a fresh name form (a NEW store, not tools on #1).
  await page.getByRole('button', { name: /Create a second PAI/i }).click();
  await page.waitForTimeout(500);
  note((await page.locator('[data-tour="name"]').count()) > 0 && (await page.locator('[data-tour="name"]').inputValue()) === '',
    'the second-PAI button resets to an empty name form — a fresh PAI, not more tools on #1');

  note(errs.length === 0, 'no runtime errors across the create-page walk', errs.slice(0, 3).join('; '));
} catch (e) {
  note(false, 'create-page walk aborted', e.message.split('\n')[0]);
} finally {
  await browser.close();
}

// === DOOR 2: the init-pai CLI, against the SAME stub ====================================
// Run twice with different TRUSTSHELL_HOME dirs and prove the second store does not clobber the
// first — the CLI end of the same guarantee the store-isolation unit test proves in isolation.
const runInitPai = (name, home) => new Promise((resolve) => {
  const out = [];
  const p = spawn('node', ['scripts/init-pai.mjs', '--name', name, '--answers', 'research|cheap|gpt'],
    { env: { ...env, TRUSTSHELL_HOME: home }, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', (d) => out.push(String(d)));
  p.stderr.on('data', (d) => out.push(String(d)));
  p.on('exit', (code) => resolve({ code, text: out.join('') }));
});

try {
  const root = mkdtempSync(join(tmpdir(), 'create-walk-'));
  const homeA = join(root, 'pai-a');
  const homeB = join(root, 'pai-b');

  const a = await runInitPai('Atlas', homeA);
  note(a.code === 0, 'init-pai exits 0 for the first PAI', `exit ${a.code}`);
  note(/verify Paris:\s*PASS/i.test(a.text), 'init-pai: Paris verifies PASS');
  note(/verify Rome:\s*VETO/i.test(a.text), 'init-pai: Rome verifies VETO — the CLI sees the same catch as the page');
  note(/RepID\s+200/i.test(a.text), 'init-pai: RepID comes back');
  note(existsSync(join(homeA, 'credentials.json')), 'init-pai writes credentials to its store');
  const credABefore = readFileSync(join(homeA, 'credentials.json'), 'utf8');
  const idA = JSON.parse(credABefore).agentId;

  const bRun = await runInitPai('Mercury', homeB);
  note(bRun.code === 0, 'init-pai exits 0 for a second PAI under a different TRUSTSHELL_HOME', `exit ${bRun.code}`);
  note(existsSync(join(homeB, 'credentials.json')), 'the second PAI writes to its OWN store');

  const credAAfter = readFileSync(join(homeA, 'credentials.json'), 'utf8');
  note(credAAfter === credABefore,
    'the first PAI\'s credentials are byte-identical after the second run — the second store did not clobber the first');
  const idB = JSON.parse(credAAfter === credABefore ? readFileSync(join(homeB, 'credentials.json'), 'utf8') : '{}').agentId;
  note(typeof idA === 'string' && typeof idB === 'string' && idA === AGENT_ID && idB === AGENT_ID,
    'both stores registered against the stub (same stub id), each in its own dir', `A=${idA} B=${idB}`);

  rmSync(root, { recursive: true, force: true });
} catch (e) {
  note(false, 'init-pai CLI leg aborted', e.message.split('\n')[0]);
} finally {
  killApp(); engine.close();
}

const gaps = findings.filter((f) => !f.ok);
console.log(`\n${findings.length - gaps.length}/${findings.length} OK`);
if (gaps.length) console.log('GAPS:\n' + gaps.map((g) => `  - ${g.what}${g.detail ? ` (${g.detail})` : ''}`).join('\n'));

// NOT_CHECKED and FAILED must never share an exit code with success. Gaps → exit 1.
if (gaps.length) process.exit(1);
