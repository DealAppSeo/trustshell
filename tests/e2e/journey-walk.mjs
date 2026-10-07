/**
 * The stranger journey after B1-B4 (Sean's GO, 2026-10-07), in a real browser, against a stub engine
 * whose CORS is STRICT — the same request-header allow-list as repid-engine's
 * src/config/cors-headers.ts. Every earlier walk's stub allowed whatever it was sent, which is how
 * /bind shipped unable to work from any browser: production's preflight refused the x-hd-* headers
 * and nothing here could see it. This walk first reproduces that failure with the OLD list, then
 * runs the journey with the new one.
 *
 *   Start in the nav → /start answers → an agent made on /agents → /spend says to claim it first →
 *   /bind sends the agent's own key with the claim → /run shows and sends its job card.
 *
 * Builds in-suite; NOT in gating CI (needs a browser). Exit 0 all pass, 1 a failure, 2 not checked.
 *
 *     npm run test:journey-walk
 */
import { createServer } from 'node:http';
import { chromiumExecutablePath, LAUNCH_ARGS, loadPlaywrightOrExit, spawnNext } from './chromium-path.mjs';

const { chromium } = await loadPlaywrightOrExit();

const ENGINE_PORT = 4741;
const APP_PORT = 3241;
const AGENT_ID = '4d7c2a1e-5b3f-4e8a-9c6d-2f1a0b9e8d7c';
const OTHER_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const KEY = 'ts_live_journey_walk_key';
const OWNER = '0x1111111111111111111111111111111111111111';

// repid-engine src/config/cors-headers.ts as of the PR that adds it, and the list production
// served before it (measured 2026-10-07 with a preflight against the live engine).
const NEW_ALLOWED = ['content-type', 'authorization', 'x-api-key', 'x-repid-version', 'x-hd-wallet', 'x-hd-timestamp', 'x-hd-signature', 'x-agent-key', 'x-agent-gate-token', 'x-payment'];
const OLD_ALLOWED = ['content-type', 'authorization', 'x-api-key', 'x-repid-version'];
let allowed = OLD_ALLOWED;

let bound = false;
const binds = []; // headers + body of each bind POST that reached the engine
const asked = []; // prompts /llm/complete received

const CMO_GRANT = {
  id: 'g-cmo', grantor_agent_id: OTHER_ID, grantee_agent_id: AGENT_ID, parent_grant_id: null, depth: 0, grant_class: 'cold',
  capabilities: ['read:tool:google-analytics', 'read:tool:search-console'], caveats: [], role: 'cmo', audit_for: null,
  not_before: '2026-10-07T00:00:00Z', expires_at: '2026-11-06T00:00:00Z', revoked_at: null, revoked_by: null, mint_reason: 'walk',
  created_at: '2026-10-07T00:00:00Z', idempotency_key: null, grantor_signature: null, grantor_wallet_address_used: null,
  signature_status: 'NOT_CHECKED', live: true, liveReason: 'live',
};

const engine = createServer((req, res) => {
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
    'access-control-allow-headers': allowed.join(','),
    'access-control-expose-headers': 'x-taste-remaining',
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const json = (status, body) => { res.writeHead(status, { 'content-type': 'application/json', ...cors }); res.end(JSON.stringify(body)); };
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : {};
    const [url, query = ''] = req.url.split('?');
    const q = new URLSearchParams(query);
    if (req.method === 'POST' && url === '/api/v1/agents/register') return json(200, { agent_id: AGENT_ID, api_key: KEY });
    if (req.method === 'GET' && url === '/api/v1/grants') return json(200, { principal: q.get('principal'), grants: q.get('principal') === AGENT_ID ? [CMO_GRANT] : [] });
    if (req.method === 'POST' && url === '/api/v1/llm/complete') {
      asked.push(body.prompt);
      return json(200, { answer: 'I read your traffic and search data.', provider: 'stub', model: 'stub-1', tier: 0, tokens_in: 10, tokens_out: 8, latency_ms: 5, cost_estimate_usd: 0 });
    }
    if (req.method === 'POST' && url === `/api/v1/agents/${AGENT_ID}/score-event`) return json(200, { delta: 0, hal_decision: 'passed' });
    if (req.method === 'GET' && url.endsWith('/owner')) return json(200, bound ? { owned: true, owner: { kind: 'builder', wallet: OWNER } } : { owned: false, owner: null, linked_account: null });
    if (req.method === 'GET' && url === '/api/v1/human/bind/message') {
      return json(200, { message: `HyperDAG — bind agent to human\n\nwallet: ${q.get('wallet')}\nagent:  ${q.get('agent_id')}\nscope:  ownership\n\nSigning this proves you control this wallet and claims ownership of this agent.\nIt moves no funds and grants no spending authority.`, scope: 'ownership' });
    }
    if (req.method === 'POST' && url === '/api/v1/human/bind') {
      if (!req.headers['x-hd-signature']) {
        return json(401, { error: 'signature_required', sign_this: 'HyperDAG — authenticated request\nmethod: POST\npath:   /api/v1/human/bind\nwallet: <your wallet>\ntime:   <ISO timestamp>' });
      }
      binds.push({ agentKey: req.headers['x-agent-key'] ?? null, wallet: req.headers['x-hd-wallet'], body });
      if (req.headers['x-agent-key'] !== KEY) return json(400, { ok: false, reason: 'agent_key_required', detail: 'needs the key' });
      bound = true;
      return json(201, { ok: true, detail: 'Bound.', binding: { agent_id: body.agent_id, owner_kind: 'builder', scope: 'ownership', bound_at: 'now' } });
    }
    if (req.method === 'POST' && url === `/api/v1/agents/${AGENT_ID}/spend`) {
      if (!bound) return json(200, { ok: false, dry_run: true, would_send: false, code: 'not_bound', error: 'Nobody has bound this agent yet.' });
      return json(200, { ok: true, dry_run: true, would_send: true, agent_wallet: '0x2222222222222222222222222222222222222222', reads: { cap_usdc: '0.0', owner_balance_usdc: '10.0', agent_eth: '1000', chain_id: 84532 } });
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
for (let i = 0; i < 120; i++) { try { if ((await fetch(`${base}/start`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }

const browser = await chromium.launch({ executablePath: chromiumExecutablePath(), args: LAUNCH_ARGS });
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
await ctx.addInitScript(({ owner }) => {
  let connected = false;
  window.ethereum = {
    request: async ({ method }) => {
      if (method === 'eth_accounts') return connected ? [owner] : [];
      if (method === 'eth_requestAccounts') { connected = true; return [owner]; }
      if (method === 'eth_chainId') return '0x14a34';
      if (method === 'personal_sign') return '0x' + '11'.repeat(65);
      throw new Error(`fake wallet: ${method} not supported`);
    },
    on() {},
    removeListener() {},
  };
}, { owner: OWNER });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const sideways = async () => page.evaluate(() => document.documentElement.scrollWidth);

try {
  // ── Start: in the nav, two questions, one plan ──
  const wide = await browser.newPage({ viewport: { width: 768, height: 800 } });
  await wide.goto(`${base}/`, { waitUntil: 'networkidle' });
  const startLink = wide.getByRole('navigation').getByRole('link', { name: 'Start', exact: true });
  check('Start is in the nav at 768px', await startLink.isVisible());
  const navSw = await wide.evaluate(() => document.documentElement.scrollWidth);
  check('the five-link nav does not overflow at 768px', navSw <= 768, `scrollWidth ${navSw}`);
  await startLink.click();
  await wide.waitForURL(`${base}/start`);
  check('Start leads to /start', true);
  await wide.close();

  await page.goto(`${base}/start`, { waitUntil: 'networkidle' });
  check('/start asks where first, and not the second question yet', (await page.getByRole('heading', { name: 'Where do you already talk to AI?' }).isVisible()) && !(await page.getByText('A fresh agent, or one you already have?').isVisible()));
  await page.getByRole('button', { name: 'A terminal' }).click();
  let text = await page.locator('main').innerText();
  check('a terminal pick shows the measured check and its output', /average speed for the trip is 45 mph/.test(text) && /That run exited 1\./.test(text));
  await page.getByRole('button', { name: /Start a fresh agent/ }).click();
  text = await page.locator('main').innerText();
  check('terminal + fresh: the plan says how to make an agent in the terminal and then claim it', /init --pai/.test(text) && /Claim it/.test(text));
  await page.getByRole('button', { name: 'Claude Desktop' }).click();
  await page.getByRole('button', { name: /Link one I already have/ }).click();
  text = await page.locator('main').innerText();
  check('Claude Desktop + own: the MCP paste, and "not built yet" said out loud', /trustshell-mcp/.test(text) && /not built yet/.test(text));
  check('/start does not scroll sideways at 390px', (await sideways()) <= 390);

  // ── An agent made in this browser ──
  await page.goto(`${base}/agents`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('e.g. Support Copilot').fill('Nova');
  await page.getByRole('button', { name: /^Create Agent$/ }).click();
  await page.getByRole('heading', { name: 'Nova', exact: true }).waitFor({ timeout: 10_000 });

  // ── /spend before the claim ──
  await page.goto(`${base}/spend`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Connect wallet' }).click();
  await page.getByText('Nobody has claimed this agent yet').waitFor({ timeout: 10_000 });
  check('/spend says to claim the agent first, with a link', (await page.getByRole('link', { name: 'claim it with this wallet' }).getAttribute('href')) === '/bind');

  // ── /bind with the OLD allow-list: the production failure, reproduced ──
  const openClaim = async () => {
    await page.getByRole('button', { name: 'Connect wallet' }).click();
    await page.getByRole('button', { name: 'Sign and claim' }).waitFor({ timeout: 10_000 });
    for (let i = 0; i < 20 && !(await page.getByRole('button', { name: 'Sign and claim' }).isEnabled()); i++) await page.waitForTimeout(250);
  };
  await page.goto(`${base}/bind`, { waitUntil: 'networkidle' });
  await openClaim();
  await page.getByRole('button', { name: 'Sign and claim' }).click();
  await page.waitForTimeout(1500);
  text = await page.locator('body').innerText();
  check('REPRODUCED: with the old CORS list the claim never reaches the engine', binds.length === 0 && /Could not reach the engine/.test(text), text.slice(0, 120).replace(/\n/g, ' | '));

  // ── /bind with the new list ──
  allowed = NEW_ALLOWED;
  await page.reload({ waitUntil: 'networkidle' });
  await openClaim();
  await page.getByRole('button', { name: 'Sign and claim' }).click();
  for (let i = 0; i < 20 && binds.length === 0; i++) await page.waitForTimeout(250);
  check('with the new list the claim reaches the engine, carrying the agent\'s own key', binds.length === 1 && binds[0].agentKey === KEY && binds[0].wallet?.toLowerCase() === OWNER, JSON.stringify(binds[0] ?? null));
  check('the key travels in a header, never in the body', binds[0] && !JSON.stringify(binds[0].body).includes(KEY));
  await page.waitForTimeout(800);
  check('the claim is recorded', bound);

  // An agent from another device: the page asks for its key and will not claim without it.
  await page.goto(`${base}/bind`, { waitUntil: 'networkidle' });
  await page.getByText('Claim an agent from another device').click();
  await page.getByLabel('Agent ID').fill(OTHER_ID);
  const keyField = page.getByLabel("This agent's key");
  await keyField.waitFor({ timeout: 10_000 });
  check('a pasted agent ID asks for that agent\'s key', await keyField.isVisible());

  // ── /run: its job card, shown and sent ──
  await page.goto(`${base}/run/${AGENT_ID}`, { waitUntil: 'networkidle' });
  const job = page.getByRole('region', { name: 'Its job' });
  await job.getByText(/working as CMO/).waitFor({ timeout: 10_000 });
  const jobText = await job.innerText();
  check('/run shows its job: CMO, the belt purpose and its tools, until when', /working as CMO for your owner/.test(jobText) && /Tools you may use, read-only, until 2026-11-06/.test(jobText), jobText.slice(0, 160).replace(/\n/g, ' | '));
  await page.getByPlaceholder('Enter prompt here...').fill('What can you do for me?');
  await page.getByRole('button', { name: 'Run prompt' }).click();
  for (let i = 0; i < 20 && asked.length === 0; i++) await page.waitForTimeout(250);
  check('the question goes out with the job card first', asked.length === 1 && asked[0].startsWith('## Your job') && asked[0].endsWith('What can you do for me?'), String(asked[0] ?? '').slice(0, 80));
  check('/run does not scroll sideways at 390px', (await sideways()) <= 390);

  check('no page errors', errs.length === 0, errs.join(' | '));
} catch (e) {
  check('walk completed without throwing', false, String(e?.message ?? e));
} finally {
  await browser.close();
  engine.close();
  killApp();
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
