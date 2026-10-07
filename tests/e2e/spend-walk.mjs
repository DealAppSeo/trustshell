/**
 * "Let an agent spend", in a real browser (Sean, 2026-10-07: stake USDC, bind an agent so it can
 * trade up to that amount, then test those transactions). Testnet flow, stubbed chain.
 *
 * A stranger creates an agent, connects their wallet, sets a 5 USDC cap, has the agent pay 2,
 * is refused at 4 (over the 3 left), stops it with a cap of 0, and is refused again. The wallet is
 * a fake EIP-1193 provider whose transactions go to a stub chain that decodes `approve` and keeps
 * the allowance; the stub engine spends against that same allowance. So the cap the page sets is
 * the cap the "chain" enforces — the page cannot pass by displaying the right words.
 *
 * Also checked: a real send while the server has spending off is refused and says so; nothing
 * scrolls sideways at 390px; no page errors. Builds in-suite; NOT in gating CI.
 *
 *     npm run test:spend-walk
 */
import { createServer } from 'node:http';
import { chromiumExecutablePath, LAUNCH_ARGS, loadPlaywrightOrExit, spawnNext } from './chromium-path.mjs';

const { chromium } = await loadPlaywrightOrExit();

const ENGINE_PORT = 4731;
const APP_PORT = 3231;
const AGENT_ID = 'c3e0a2f6-99d4-4b51-8a7c-4d8f2e16b953';
const OWNER = '0x1111111111111111111111111111111111111111';
const AGENT_WALLET = '0x2222222222222222222222222222222222222222';
const PAYEE = '0x3333333333333333333333333333333333333333';
const USDC = 1_000_000n;

let allowance = 0n;
let spendingOn = false;
let txn = 0;
const approvals = [];
const sends = [];

const fmt = (v) => {
  const s = (Number(v) / 1e6).toString();
  return s.includes('.') ? s : `${s}.0`;
};

const engine = createServer((req, res) => {
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'Content-Type,Authorization,x-api-key,X-RepID-Version',
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const json = (status, body) => { res.writeHead(status, { 'content-type': 'application/json', ...cors }); res.end(JSON.stringify(body)); };
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : {};
    const url = req.url.split('?')[0];
    if (req.method === 'POST' && url === '/api/v1/agents/register') return json(200, { agent_id: AGENT_ID, api_key: 'k_spend_walk' });

    // The stub CHAIN: the fake wallet posts its transactions here.
    if (req.method === 'POST' && url === '/__chain/tx') {
      const data = String(body.data);
      if (!data.startsWith('0x095ea7b3')) return json(400, { error: 'only approve is expected' });
      const spender = '0x' + data.slice(10 + 24, 10 + 64);
      const value = BigInt('0x' + data.slice(10 + 64, 10 + 128));
      approvals.push({ from: body.from, to: body.to, spender, value });
      if (spender.toLowerCase() === AGENT_WALLET) allowance = value;
      return json(200, { hash: `0x${String(++txn).padStart(64, '0')}` });
    }

    if (req.method === 'POST' && url === `/api/v1/agents/${AGENT_ID}/spend`) {
      if (req.headers['x-api-key'] !== 'k_spend_walk') return json(401, { error: 'Unauthorized' });
      const amount = BigInt(Math.round(Number(body.amount_usdc) * 1e6));
      const reads = { cap_usdc: fmt(allowance), owner_balance_usdc: '100.0', agent_eth: '10000000000000000', chain_id: 84532 };
      const dry = body.dry_run === true;
      if (!dry && !spendingOn) return json(403, { ok: false, code: 'spending_off', error: 'Agent spending is off on this server (AGENT_SPEND_ENABLED). A dry run still works. Nothing was sent.' });
      if (amount > allowance) {
        const error = allowance === 0n
          ? 'you have not approved this agent to spend any USDC (the cap is 0). Nothing was sent.'
          : `over the cap you approved: ${fmt(amount)} USDC asked, ${fmt(allowance)} USDC left. Nothing was sent.`;
        return json(dry ? 200 : 409, { ok: false, dry_run: dry, would_send: false, code: allowance === 0n ? 'over_cap' : 'over_cap', error, agent_wallet: AGENT_WALLET, reads });
      }
      if (dry) return json(200, { ok: true, dry_run: true, would_send: true, agent_wallet: AGENT_WALLET, reads });
      const before = allowance;
      allowance -= amount;
      sends.push({ to: body.to_address, amount });
      const hash = `0x${String(++txn).padStart(64, '0')}`;
      return json(200, { ok: true, tx_hash: hash, basescan_url: `https://sepolia.basescan.org/tx/${hash}`, amount_usdc: fmt(amount), cap_before_usdc: fmt(before), cap_after_usdc: fmt(allowance), agent_wallet: AGENT_WALLET, to: body.to_address, from_owner: body.owner_address });
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
for (let i = 0; i < 120; i++) { try { if ((await fetch(`${base}/spend`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }

const browser = await chromium.launch({ executablePath: chromiumExecutablePath(), args: LAUNCH_ARGS });
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
// The fake wallet: on Base Sepolia, one account, and every transaction goes to the stub chain.
await ctx.addInitScript(({ owner, chainUrl }) => {
  let connected = false;
  window.ethereum = {
    request: async ({ method, params }) => {
      if (method === 'eth_accounts') return connected ? [owner] : [];
      if (method === 'eth_requestAccounts') { connected = true; return [owner]; }
      if (method === 'eth_chainId') return '0x14a34';
      if (method === 'eth_sendTransaction') {
        const r = await fetch(chainUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params[0]) });
        return (await r.json()).hash;
      }
      if (method === 'eth_getTransactionReceipt') return { status: '0x1' };
      throw new Error(`fake wallet: ${method} not supported`);
    },
    on() {},
    removeListener() {},
  };
}, { owner: OWNER, chainUrl: `http://127.0.0.1:${ENGINE_PORT}/__chain/tx` });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

const step2 = () => page.getByRole('region', { name: '2. Set the cap' });
const step3 = () => page.getByRole('region', { name: '3. Have it pay' });
const payReply = async () => {
  await page.waitForTimeout(700);
  return step3().innerText();
};

try {
  await page.goto(`${base}/agents`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('e.g. Support Copilot').fill('Shopper');
  await page.getByRole('button', { name: /^Create Agent$/ }).click();
  await page.getByRole('heading', { name: 'Shopper', exact: true }).waitFor({ timeout: 10_000 });

  await page.goto(`${base}/spend`, { waitUntil: 'networkidle' });
  const intro = await page.locator('body').innerText();
  check('the page says it is test network only', /Test network only: Base Sepolia/.test(intro));
  await page.getByRole('button', { name: 'Connect wallet' }).click();
  await step2().getByText('Agent wallet').waitFor({ timeout: 10_000 });
  let s2 = await step2().innerText();
  check('step 2 names the agent\'s own wallet and a cap of 0', s2.toLowerCase().includes(AGENT_WALLET) && /Cap now\s*0\.0 USDC/.test(s2), s2.replace(/\n/g, ' | '));

  await step2().getByLabel('Cap (USDC)').fill('5');
  await step2().getByRole('button', { name: 'Set cap' }).click();
  await step2().getByRole('status').waitFor({ timeout: 10_000 });
  const a = approvals.at(-1);
  check('the wallet sent approve(agent wallet, 5 USDC) to USDC on Base Sepolia', a && a.spender === AGENT_WALLET && a.value === 5n * USDC && a.to === '0x036CbD53842c5426634e7929541eC2318f3dCF7e' && a.from.toLowerCase() === OWNER, JSON.stringify(a, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
  await page.waitForTimeout(600);
  s2 = await step2().innerText();
  check('the page reads the new cap back', /Cap now\s*5\.0 USDC/.test(s2) && /Confirmed\./.test(s2));

  await step3().getByLabel('Pay to (address)').fill(PAYEE);
  await step3().getByLabel('Amount (USDC)').fill('2');
  await step3().getByRole('button', { name: 'Check first' }).click();
  check('a dry run inside the cap says it would go through and sends nothing', /This would go through\. Nothing was sent\./.test(await payReply()) && sends.length === 0);

  await step3().getByRole('button', { name: 'Pay', exact: true }).click();
  check('a real send while spending is off is refused and says so', /Not paid: Agent spending is off/.test(await payReply()) && sends.length === 0);

  spendingOn = true;
  await step3().getByRole('button', { name: 'Pay', exact: true }).click();
  const paid = await payReply();
  check('with spending on, the agent pays 2 and the cap left is 3', /Paid 2\.0 USDC\. Cap left: 3\.0 USDC\./.test(paid) && sends.length === 1, paid.replace(/\n/g, ' | '));
  check('the receipt links to Basescan', (await step3().getByRole('link', { name: 'See it on Basescan' }).getAttribute('href'))?.startsWith('https://sepolia.basescan.org/tx/0x') === true);

  await step3().getByLabel('Amount (USDC)').fill('4');
  await step3().getByRole('button', { name: 'Pay', exact: true }).click();
  check('4 over the 3 left is refused before sending', /Not paid: over the cap you approved: 4\.0 USDC asked, 3\.0 USDC left/.test(await payReply()) && sends.length === 1);

  await step2().getByRole('button', { name: 'Stop it (cap 0)' }).click();
  await page.waitForTimeout(900);
  check('stop sends a real approve of 0', approvals.at(-1)?.value === 0n && /Cap now\s*0\.0 USDC/.test(await step2().innerText()));
  await step3().getByLabel('Amount (USDC)').fill('1');
  await step3().getByRole('button', { name: 'Check first' }).click();
  check('after stopping, even 1 would not go through', /This would not go through: you have not approved this agent/.test(await payReply()));

  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  check('nothing scrolls sideways at 390px', sw <= 390, `scrollWidth ${sw}`);
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
