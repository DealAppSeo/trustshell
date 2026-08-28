/**
 * The MVP walk: does the product hold together for a real first user?
 *
 * WHY THIS EXISTS. Every other suite here checks a component. This one checks the JOURNEY —
 * the exact path a founder takes on day one: answer the constitution interview, get a real
 * identity, ask the agent something, turn on Founder Mode, file a note, then go look at the
 * grants they issued and the passport they were promised. Components can each be correct
 * while the walk between them is broken, and the walk is what someone actually experiences.
 *
 * It also guards the honesty properties end-to-end, which is the part most likely to rot:
 * every answer arrives with a verdict rather than bare; Founder Mode states `actor=founder`
 * BEFORE you act, not after; filing confirms by kind AND admits there is no durable backend
 * yet; unsigned mint consent reads NOT_CHECKED rather than a tick; and — the one that matters
 * most — a passport lookup that FAILS is never rendered as "no agent found". Asserting
 * absence from a failed lookup is the same lie as an empty grants list standing in for an
 * unreachable service, and it is one refactor away at all times.
 *
 * TWO TRAPS, both of which produced a FALSE "product gap" on the first run. They are encoded
 * in the assertions now so they cost nobody else a diagnosis:
 *   1. Founder notes are typed into the box FIRST, then filed with a chip. Clicking the chip
 *      first hits a (correct) guard and the text then goes to chat instead.
 *   2. A 404 from the passport endpoint legitimately means the agent does not exist, and
 *      saying so is right. The failure worth testing is 503, which must read differently.
 *
 * Runs against `next build` + `next start`, not `next dev`: in a sandboxed environment Next's
 * HMR WebSocket is refused, React never hydrates, and every click silently does nothing while
 * the markup looks perfect. See tests/e2e/grants-fail-closed.mjs for the full account.
 *
 * NOT in gating CI — needs a browser and a server, and a gate that reddens for environmental
 * reasons gets ignored within a week (the reasoning is written into .github/workflows/check.yml).
 *
 *     npm run test:mvp-walk
 */

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { chromiumExecutablePath, LAUNCH_ARGS } from './chromium-path.mjs';

// Playwright is deliberately not a dependency of this package (CI does not run this suite, so
// declaring it would install a browser driver on every PR for no gating benefit). Absent, this
// exits 2 = NOT_CHECKED — "we did not look" — rather than a module-not-found stack trace.
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('NOT_CHECKED: this suite needs Playwright, which this package does not depend on.');
  console.error('  npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

const ENGINE_PORT = 4701;
const APP_PORT = 3201;
const AGENT_ID = 'pai-dogfood-agent-001';

const seen = [];
let passportMode = 'missing';
const engine = createServer((req, res) => {
  seen.push(`${req.method} ${req.url.split('?')[0]}`);
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const json = (s, b) => { res.writeHead(s, { 'content-type': 'application/json', ...cors }); res.end(JSON.stringify(b)); };
  const u = req.url;

  if (u.includes('/agents/register')) return json(200, { agent_id: AGENT_ID, api_key: 'k_dogfood_test' });
  if (u.includes('/llm/complete')) {
    return json(200, {
      answer: 'Three suppliers matched your criteria. I could not verify pricing for the third — its site was unreachable, so treat that row as unchecked.',
      provider: 'mock-tier0', model: 'mock-1', tier: 0,
      tokens_in: 42, tokens_out: 61, latency_ms: 180, cost_estimate_usd: 0,
    });
  }
  if (u.includes('/score-event')) return json(200, { delta: 0, hal_decision: 'clean', purpose_suppressed: true });
  if (u.includes('/gate/status')) return json(200, { enabled: true, verified: false, remaining: 4, limit: 5 });
  if (u.startsWith('/api/v1/grants?')) {
    const n = Date.now();
    return json(200, { grants: [{
      id: 'grant-dogfood-1', grantor_agent_id: AGENT_ID, grantee_agent_id: 'research-worker-01',
      parent_grant_id: null, depth: 0, grant_class: 'cold', capabilities: ['read:activity'],
      caveats: [{ type: 'maxCalls', limit: 25 }], role: 'Researcher / Data', audit_for: null,
      not_before: new Date(n - 3600e3).toISOString(), expires_at: new Date(n + 3600e3).toISOString(),
      revoked_at: null, revoked_by: null, mint_reason: 'dogfood', created_at: new Date(n - 3600e3).toISOString(),
      idempotency_key: null, grantor_signature: null, grantor_wallet_address_used: null,
      signature_status: 'NOT_CHECKED', live: true, liveReason: 'within window, not revoked',
    }] });
  }
  if (u.includes('/revoke')) return json(200, { ok: true });
  if (u.includes('/passport/')) return passportMode === 'down' ? json(503, { error: 'unavailable' }) : json(404, { error: 'not found' });
  return json(404, { error: 'not found' });
});

const findings = [];
const note = (ok, what, detail = '') => {
  findings.push({ ok, what, detail });
  console.log(`${ok ? 'OK  ' : 'GAP '} ${what}${detail ? ` — ${detail}` : ''}`);
};

/**
 * REFUSE TO RUN AGAINST A SERVER THIS PROCESS DID NOT START (added 2026-08-28).
 *
 * MEASURED FAULT, not defensive tidiness. `spawn('npx', ['next','start'])` + `app.kill()`
 * kills the npx WRAPPER and leaves the `next-server` child alive holding the port. The next
 * run's readiness probe connects to that survivor immediately, this run's `next build` output
 * is never served, and every assertion is evaluated against a FROZEN SNAPSHOT of whatever the
 * code looked like on the first run.
 *
 * Found by injecting a deliberate bug and watching a sibling suite still report all-pass.
 * Four orphaned next-servers were alive at the time and the port answered with no suite
 * running — one of them was stale enough to 404 on a page that exists. A suite that cannot
 * fail is worse than none, because it also reports safety.
 *
 * Occupied port => exit 2 (NOT_CHECKED). Never a silent pass.
 */
let __portBusy = false;
try {
  const __probe = await fetch(`http://127.0.0.1:${APP_PORT}/`, { signal: AbortSignal.timeout(2000) });
  __portBusy = !!__probe;
} catch { /* nothing listening — the state we want */ }
if (__portBusy) {
  console.error(`NOT_CHECKED: port ${APP_PORT} is already serving. This suite refuses to test a`);
  console.error('  server it did not start — it would silently assert against a stale build.');
  console.error('  Clear it first:  pkill -f next-server');
  process.exit(2);
}

await new Promise((r) => engine.listen(ENGINE_PORT, r));
const env = { ...process.env, NEXT_PUBLIC_REPID_ENGINE_URL: `http://127.0.0.1:${ENGINE_PORT}` };
const b = spawn('npx', ['next', 'build'], { env, stdio: 'ignore' });
if ((await new Promise((r) => b.on('exit', r))) !== 0) { console.error('build failed'); engine.close(); process.exit(1); }
// `detached` puts the server in its own process GROUP so the whole tree dies with killApp().
const app = spawn('npx', ['next', 'start', '--port', String(APP_PORT)], { env, stdio: 'ignore', detached: true });
const killApp = () => { try { process.kill(-app.pid, 'SIGKILL'); } catch { try { app.kill('SIGKILL'); } catch {} } };
process.on('exit', killApp);
const base = `http://127.0.0.1:${APP_PORT}`;
for (let i = 0; i < 120; i++) { try { if ((await fetch(`${base}/pai`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }

const browser = await chromium.launch({ executablePath: chromiumExecutablePath(), args: LAUNCH_ARGS });
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

try {
  await page.goto(`${base}/pai`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // --- The constitution interview, answered as a real person would.
  const answers = [
    'Find and compare suppliers for a small hardware run, and summarise what you find.',
    'Never spend money without asking me first. Never contact anyone claiming to be me.',
    'Tell me when you are not sure. I would rather have an unchecked answer flagged than a confident wrong one.',
  ];
  const box = page.getByPlaceholder(/Your answer/i);
  let answered = 0;
  for (const a of answers) {
    if (!(await box.count())) break;
    await box.fill(a);
    await page.getByRole('button', { name: /^Send$/ }).click();
    await page.waitForTimeout(1200);
    answered++;
  }
  note(answered === 3, `constitution interview accepts all ${answers.length} answers`, `answered ${answered}`);

  await page.waitForTimeout(2500);
  let body = await page.locator('body').innerText();
  note(/real identity now|Passport you can read/i.test(body), 'registration completes and the agent gets an identity');
  note(seen.some((s) => s.includes('/agents/register')), 'registration hit the real endpoint');

  // --- Ask it something. The answer must arrive WITH an honest verdict.
  const ask = page.getByPlaceholder(/Ask your agent/i);
  note((await ask.count()) > 0, 'chat becomes available after the interview');
  if (await ask.count()) {
    await ask.fill('Find me three suppliers and tell me what you could not verify.');
    await page.getByRole('button', { name: /^Send$/ }).click();
    await page.waitForTimeout(3000);
    body = await page.locator('body').innerText();
    note(/suppliers matched/i.test(body), 'the answer renders');
    note(/Measured|Not checked/i.test(body), 'the answer carries a trust verdict, not a bare reply');
    note(seen.some((s) => s.includes('/llm/complete')), 'the completion hit the real endpoint');
  }

  // --- Founder Mode: does filing actually tag as founder?
  await page.getByRole('button', { name: /Founder Mode/i }).click();
  await page.waitForTimeout(500);
  body = await page.locator('body').innerText();
  note(/actor=founder/i.test(body), 'Founder Mode states the tagging before you act');

  // Two properties that are pure regression risk: both were correct when written, and both
  // are the kind of thing a later edit undoes without any test noticing.
  const keylessCount = (body.match(/Agents don.t hold your keys/g) || []).length;
  note(keylessCount === 1, 'the keyless promise appears exactly once', `found ${keylessCount}`);

  const chatBox = await page.locator('text=/I.m your agent|suppliers matched/').first().boundingBox();
  const panelBox = await page.locator('text=Specified, not built').first().boundingBox();
  note(chatBox && panelBox && chatBox.y < panelBox.y,
    'on a phone the conversation sits above the founder tools',
    chatBox && panelBox ? `chat ${Math.round(chatBox.y)}px, panel ${Math.round(panelBox.y)}px` : 'not measurable');

  const bug = page.getByRole('button', { name: /Product bug/i });
  note((await bug.count()) > 0, 'a founder can file a product bug');
  if (await bug.count()) {
    // Correct order: the note goes in the box FIRST, then the chip files it. Getting this
    // backwards on the first pass produced a false "product gap" — worth encoding here.
    const fbox = page.getByPlaceholder(/Ask your agent|Your answer/i);
    await fbox.fill('The supplier table should show which rows are unverified.');
    await bug.first().click();
    await page.waitForTimeout(1200);
    body = await page.locator('body').innerText();
    note(/Filed as Product bug/i.test(body), 'the filed note is confirmed back by kind');
    note(/kept out of end-user telemetry/i.test(body), 'the confirmation states it is founder signal, not user telemetry');
    note(/no durable backend|this device only/i.test(body), 'the confirmation admits there is no durable backend yet');

    // And the empty-box case should guide, not silently no-op.
    await bug.first().click();
    await page.waitForTimeout(600);
    body = await page.locator('body').innerText();
    note(/Type the note in the box first/i.test(body), 'filing with an empty box explains what to do instead of failing silently');
  }

  // --- Grants: can a founder see and revoke authority?
  await page.goto(`${base}/grants/${AGENT_ID}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  body = await page.locator('body').innerText();
  note(/research-worker-01/.test(body), 'the grant is listed');
  note(/Not checked/i.test(body), 'unsigned mint consent reads NOT_CHECKED, not a tick');
  note((await page.getByRole('button', { name: /^Revoke$/i }).count()) > 0, 'the grantor is offered revoke');

  // --- Passport and Activity: the other two kernel surfaces.
  await page.goto(`${base}/passport/${AGENT_ID}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const pBody = await page.locator('body').innerText();
  // 404 legitimately means the agent does not exist, and saying so is correct.
  note(/no agent found/i.test(pBody), 'passport 404 says the agent does not exist');

  // The one that matters: unreachable must NOT read as "no such agent".
  passportMode = 'down';
  await page.goto(`${base}/passport/${AGENT_ID}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const dBody = await page.locator('body').innerText();
  note(!/no agent found/i.test(dBody),
    'passport 503 does NOT claim the agent is missing',
    'asserting absence from a failed lookup is the same lie as an empty grants list');
  note(/unavailable|unreachable|could not|try again/i.test(dBody),
    'passport 503 says it could not check');
  note(!/undefined|NaN|\[object/i.test(pBody), 'passport shows no undefined/NaN leakage');

  await page.goto(`${base}/history`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const hBody = await page.locator('body').innerText();
  note(/this device|local|browser/i.test(hBody), 'Activity says its history is device-local, not a global feed');

  note(errs.length === 0, 'no runtime errors across the whole walk', errs.slice(0, 3).join('; '));
} catch (e) {
  note(false, 'walk aborted', e.message.split('\n')[0]);
} finally {
  await browser.close(); killApp(); engine.close();
}

const gaps = findings.filter((f) => !f.ok);
console.log(`\n${findings.length - gaps.length}/${findings.length} OK`);
if (gaps.length) console.log('GAPS:\n' + gaps.map((g) => `  - ${g.what}${g.detail ? ` (${g.detail})` : ''}`).join('\n'));
