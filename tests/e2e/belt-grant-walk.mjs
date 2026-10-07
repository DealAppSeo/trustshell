/**
 * The role + belt walk on /agents, in a real browser (Sean, 2026-10-07: agents get roles and tool
 * belts "exactly how a stranger would go through the exercise" — not assigned for them).
 *
 * A stranger creates two agents, picks one as their PAI, gives the other the CTO role with a belt
 * they chose tool by tool, sees it listed, and takes it away again. The stub engine enforces what
 * the real one does since repid-engine's grants change: the grantor must be the calling key's own
 * agent, by id. So a page that sent the wrong key, the wrong grantor, or no key at all fails here
 * the way it would fail in production.
 *
 * Also checked: a refusal from the engine is shown, not swallowed; an unreachable list reads "Not
 * checked", not "None yet"; gated tools are never offered; nothing scrolls sideways on a phone.
 *
 * Builds in-suite (NEXT_PUBLIC_* is inlined at build time) and runs against `next start`.
 * NOT in gating CI — needs a browser and a server.
 *
 *     npm run test:belt-grant-walk
 */
import { createServer } from 'node:http';
import { chromiumExecutablePath, LAUNCH_ARGS, loadPlaywrightOrExit, spawnNext } from './chromium-path.mjs';

const { chromium } = await loadPlaywrightOrExit();

const ENGINE_PORT = 4711;
const APP_PORT = 3211;

const agents = []; // { id, key, name }
const grants = [];
const seen = { mint: [], revoke: [] };
let mode = { mint: 'ok', list: 'ok' };

const uuid = (n) => `${String(n).repeat(8)}-1111-4111-8111-${String(n).repeat(12)}`.slice(0, 36);

const engine = createServer((req, res) => {
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    // Mirrors repid-engine src/index.ts allowedHeaders. If the page sent a header the real engine
    // does not allow, the preflight would fail there too.
    'access-control-allow-headers': 'Content-Type,Authorization,x-api-key,X-RepID-Version',
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const json = (status, body) => { res.writeHead(status, { 'content-type': 'application/json', ...cors }); res.end(JSON.stringify(body)); };
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : {};
    const url = req.url.split('?')[0];
    const key = req.headers['x-api-key'];
    const caller = agents.find((a) => a.key === key);

    if (req.method === 'POST' && url === '/api/v1/agents/register') {
      const a = { id: uuid(agents.length + 1), key: `k_walk_${agents.length + 1}`, name: body.name };
      agents.push(a);
      return json(200, { agent_id: a.id, api_key: a.key });
    }
    if (req.method === 'GET' && url === '/api/v1/grants') {
      if (mode.list === 'down') return json(503, { error: 'unavailable' });
      const p = new URL(req.url, 'http://x').searchParams.get('principal');
      return json(200, { grants: grants.filter((g) => g.grantor_agent_id === p || g.grantee_agent_id === p) });
    }
    if (req.method === 'POST' && url === '/api/v1/grants') {
      seen.mint.push({ key, body });
      if (!caller) return json(401, { error: 'Unauthorized: API key required' });
      if (body.grantor_agent_id !== caller.id) return json(403, { error: "Forbidden: grantor_agent_id must be this API key's own agent id" });
      if (mode.mint === 'refuse') return json(403, { ok: false, error: 'role ceiling refuses read:tool:github: stub refusal' });
      const now = Date.now();
      const g = {
        id: `e${grants.length}${'0'.repeat(7)}-1111-4111-8111-${'0'.repeat(12)}`,
        grantor_agent_id: body.grantor_agent_id, grantee_agent_id: body.grantee_agent_id, parent_grant_id: null, depth: 0,
        grant_class: body.grant_class, capabilities: body.capabilities, caveats: body.caveats, role: body.role, audit_for: body.audit_for,
        not_before: new Date(now).toISOString(), expires_at: new Date(now + body.ttl_seconds * 1000).toISOString(),
        revoked_at: null, revoked_by: null, mint_reason: 'stub', created_at: new Date(now).toISOString(),
        idempotency_key: body.idempotency_key, grantor_signature: null, grantor_wallet_address_used: null, signature_status: 'NOT_CHECKED',
        live: true, liveReason: 'stub',
      };
      grants.push(g);
      return json(201, { ok: true, grant: g });
    }
    const rv = url.match(/^\/api\/v1\/grants\/([^/]+)\/revoke$/);
    if (req.method === 'POST' && rv) {
      seen.revoke.push({ key, body, id: rv[1] });
      if (!caller || body.requested_by !== caller.id) return json(403, { error: 'Forbidden: requested_by must be this API key\'s own agent id' });
      const g = grants.find((x) => x.id === rv[1]);
      if (!g || g.grantor_agent_id !== body.requested_by) return json(403, { ok: false, error: 'only the grantor may revoke' });
      g.revoked_at = new Date().toISOString(); g.live = false;
      return json(200, { ok: true });
    }
    return json(404, { error: 'not found in stub' });
  });
});

const results = [];
const check = (name, pass, note = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${note ? ` — ${note}` : ''}`);
};

let portBusy = false;
try { portBusy = !!(await fetch(`http://127.0.0.1:${APP_PORT}/`, { signal: AbortSignal.timeout(2000) })); } catch { /* free */ }
if (portBusy) {
  console.error(`NOT_CHECKED: port ${APP_PORT} is already serving; refusing to test a server this suite did not start.`);
  process.exit(2);
}

await new Promise((r) => engine.listen(ENGINE_PORT, r));
const env = { ...process.env, NEXT_PUBLIC_REPID_ENGINE_URL: `http://127.0.0.1:${ENGINE_PORT}` };
const b = spawnNext(['build'], { env, stdio: 'ignore' });
if ((await new Promise((r) => b.on('exit', r))) !== 0) { console.error('FATAL: next build failed'); engine.close(); process.exit(1); }
const app = spawnNext(['start', '--port', String(APP_PORT)], { env, stdio: 'ignore', detached: true });
const killApp = () => { try { process.kill(-app.pid, 'SIGKILL'); } catch { try { app.kill('SIGKILL'); } catch {} } };
process.on('exit', killApp);
const base = `http://127.0.0.1:${APP_PORT}`;
for (let i = 0; i < 120; i++) { try { if ((await fetch(`${base}/agents`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }

const browser = await chromium.launch({ executablePath: chromiumExecutablePath(), args: LAUNCH_ARGS });
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('dialog', (d) => d.accept());

const create = async (name) => {
  await page.getByPlaceholder('e.g. Support Copilot').fill(name);
  await page.getByRole('button', { name: /^Create Agent$/ }).click();
  await page.getByRole('heading', { name, exact: true }).waitFor({ timeout: 10_000 });
};

try {
  await page.goto(`${base}/agents`, { waitUntil: 'networkidle' });
  let body = await page.locator('body').innerText();
  check('with no agents, the panel explains what is needed instead of a dead form', /create a second agent/i.test(body));

  await create('Sean PAI');
  await create('Builder');
  const panel = page.getByRole('region', { name: 'Give an agent a role' });
  await panel.waitFor();
  body = await panel.innerText();
  check('the panel appears once there are two agents', /Who gives it \(your PAI\)/.test(body));
  check('it says plainly that it is not a gate yet', /does not ask it before each tool yet/.test(body));

  // Gated tools are never offered, for any role.
  const offered = {};
  for (const role of ['CMO', 'CFO', 'CTO']) {
    await panel.getByRole('button', { name: role, exact: true }).click();
    offered[role] = await panel.getByRole('checkbox').count();
  }
  const panelText = await panel.innerText();
  check('each role offers its starter tools as checkboxes', offered.CMO === 6 && offered.CFO === 6 && offered.CTO === 9, JSON.stringify(offered));
  check('no gated tool is offered', !/Postiz|Listmonk|AgentKit|x402|Lago|without --read-only/.test(panelText));

  // Choose: PAI gives Builder the CTO role, without gitleaks, for 7 days.
  await panel.getByLabel(/gitleaks/).uncheck();
  await panel.getByLabel('For how long').selectOption('7');
  await panel.getByRole('button', { name: /Give Builder the CTO role/ }).click();
  await panel.getByText('Roles Sean PAI has given').waitFor();
  await page.waitForTimeout(800);

  const m = seen.mint.at(-1);
  const pai = agents.find((a) => a.name === 'Sean PAI');
  const builder = agents.find((a) => a.name === 'Builder');
  check('the mint carries the PAI\'s own key', m?.key === pai?.key);
  check('the grantor is the PAI and the grantee is Builder, by id', m?.body.grantor_agent_id === pai?.id && m?.body.grantee_agent_id === builder?.id);
  check('it is a cold grant with the CTO role and a 7-day life', m?.body.grant_class === 'cold' && m?.body.role === 'cto' && m?.body.ttl_seconds === 7 * 86400);
  check('the belt is exactly what was ticked', JSON.stringify(m?.body.capabilities) === JSON.stringify(['read:tool:trustshell', 'read:tool:github', 'read:tool:git-filesystem', 'read:tool:postgres', 'read:tool:supabase', 'read:tool:grafana', 'read:tool:semgrep', 'read:tool:osv-scanner']), JSON.stringify(m?.body.capabilities));
  body = await panel.innerText();
  check('the given role is listed with its tools', /Builder\s*CTO/.test(body) && /github/.test(body) && !/gitleaks/.test(body.split('Roles Sean PAI has given')[1] ?? ''));

  // Take it away.
  await panel.getByRole('button', { name: 'Revoke' }).click();
  await page.waitForTimeout(1200);
  const r = seen.revoke.at(-1);
  check('revoke is asked as the PAI, with its key', r?.key === pai?.key && r?.body.requested_by === pai?.id);
  check('after revoking, the list is empty again', /None yet\./.test(await panel.innerText()));

  // A refusal is shown, not swallowed.
  mode.mint = 'refuse';
  await panel.getByRole('button', { name: /Give Builder the CTO role/ }).click();
  await panel.getByRole('alert').waitFor({ timeout: 5000 });
  check('an engine refusal is shown with its reason', /Not given\. The engine said: role ceiling refuses/.test(await panel.getByRole('alert').innerText()));

  // An unreachable list is NOT_CHECKED, never "None yet".
  mode = { mint: 'ok', list: 'down' };
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const after = await page.locator('body').innerText();
  check('an unreachable list reads Not checked, not None yet', /Not checked: could not reach the backend/.test(after) && !/None yet\./.test(after));

  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  // Name the widest offender, so a failure says what to fix rather than only that something is wide.
  const wide = await page.evaluate(() =>
    [...document.querySelectorAll('body *')]
      .filter((e) => {
        // Inside its own horizontal scroller (the step strip) is not page scroll.
        for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
          if (/auto|scroll|hidden|clip/.test(getComputedStyle(a).overflowX)) return false;
        }
        return true;
      })
      .map((e) => ({ e, r: e.getBoundingClientRect().right }))
      .filter((x) => x.r > window.innerWidth)
      .sort((a, b) => b.r - a.r)
      .slice(0, 1)
      .map((x) => `${x.e.tagName.toLowerCase()} "${(x.e.textContent || '').trim().slice(0, 50)}" right=${Math.round(x.r)}`)
      .join(''));
  check('nothing scrolls sideways at 390px', sw <= 390, `scrollWidth ${sw}${wide ? `; widest: ${wide}` : ''}`);
  check('no page errors', errs.length === 0, errs.join(' | '));
} catch (e) {
  check('walk completed without throwing', false, String(e?.message ?? e));
} finally {
  await browser.close();
  engine.close();
  killApp();
}

const failed = results.filter((x) => !x.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed === 0 ? 0 : 1);
