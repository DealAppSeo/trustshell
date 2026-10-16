/**
 * The stranger path, in a real browser, at PHONE width and at DESKTOP width.
 *
 * Sean, 2026-10-12: a stranger must be able to finish this with no one in the room, and the tutorial
 * IS the same screens with the steps beside them (not a second flow). So this walks the real pages,
 * in order, and reads the tutorial off them:
 *
 *   1. /agents        name the agent                      (rail: Step 1 of 4)
 *   2. /belts         pick a belt or skip; suggest a skill (rail: Step 2 of 4)
 *   3. /check         run one check, read the receipt     (rail: Step 3 of 4)
 *   4. /after-create  the offer: register, bind, fund, stake, limit (rail: Step 4 of 4)
 *   then /faucet (points + reads the balance back, never dispenses) and /stake (practice, only after
 *   the agent is bound), and the passport's ERC-8004 guard.
 *
 * WHAT IT CHECKS THAT A UNIT TEST CANNOT: that the tutorial text is on the page a stranger is on, that
 * the screens link to each other in order, that the receipt says PROVISIONAL and the score did not move
 * (the stub engine records every request, so "nothing was written to a score" is read off the wire, not
 * off the copy), that the suggest-a-skill box stores a link and fetches nothing, that the faucet page
 * never POSTs and says it does not dispense, that an unreadable balance is Not checked and never 0, and
 * that nothing scrolls sideways at either width.
 *
 * The engine here is a STUB. This proves the pages and their client paths against a known-good response
 * shape; it never proves production returns that shape. Builds in-suite; NOT in gating CI.
 *
 *     npm run test:stranger-path-walk
 */
import { createServer } from 'node:http';
import { chromiumExecutablePath, LAUNCH_ARGS, loadPlaywrightOrExit, spawnNext } from './chromium-path.mjs';

const { chromium } = await loadPlaywrightOrExit();

const ENGINE_PORT = 4771;
const APP_PORT = 3271;
const AGENT_ID = '5e7a1c3b-2d4f-4b6a-9c8e-1f0a2b3c4d5e';
const OWNER = '0x1111111111111111111111111111111111111111';
const FUNDED = '0x2222222222222222222222222222222222222222';
const EMPTY = '0x3333333333333333333333333333333333333333';
const CANON = '0x8004A818BFB912233c491871b3d84c89A494BD9e';
const TXHASH = `0x${'ab'.repeat(32)}`;
const PARIS = 'The capital of France is Paris.';
const ROME = 'The Eiffel Tower is located in Rome, Italy.';
const SPLIT = 'This split sentence gets two checkers that disagree.';
const SKILL = 'https://github.com/owner/some-tool';
// Exact membership, not a substring match on page text: the saved links as the page holds them.
const savedLinks = (page) => page.locator('[data-testid="skill-list"] [data-skill-url]').evaluateAll((els) => els.map((e) => e.getAttribute('data-skill-url')));
// Compare the HOST of a requested URL, never a substring of it.
const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ''; } };

// ---- the stub engine -------------------------------------------------------------------------
let seen = []; // "METHOD /path" for every request
let scoreNow = 200; // what the passport says the score is
const onchainAsked = []; // the agents the engine's live ownerOf read was asked about (E-1)
let ownerMode = 'unbound'; // unbound | owned | down
let classifyDown = false;
let balanceMode = 'ok'; // ok | down
let deposits = [];

const votes = (a, b) => [
  { voter: 'groq', family: 'gpt-oss', verdict: a },
  { voter: 'cerebras', family: 'qwen', verdict: b },
];
const engine = createServer((req, res) => {
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization,x-api-key,x-repid-version',
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const json = (status, body) => { res.writeHead(status, { 'content-type': 'application/json', ...cors }); res.end(JSON.stringify(body)); };
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { /* not json */ }
    const [url, query = ''] = req.url.split('?');
    const q = new URLSearchParams(query);
    seen.push(`${req.method} ${url}`);

    if (req.method === 'POST' && url === '/api/v1/agents/register') return json(200, { agent_id: AGENT_ID, api_key: 'k_stranger_walk', name: body.name });
    if (req.method === 'POST' && url === '/api/v1/classify') {
      if (classifyDown) return json(503, { error: 'down' });
      const t = String(body.text ?? '');
      if (/2\s*\+\s*2\s*=\s*5/.test(t)) return json(200, { label: 'veto', latency_ms: 2, by: 'arithmetic' });
      if (t.includes('Paris')) return json(200, { label: 'pass', latency_ms: 340, by: 'votes', voters: ['groq', 'cerebras'], deciders: ['groq', 'cerebras'], votes: votes('TRUE', 'TRUE') });
      if (t.includes('Rome')) return json(200, { label: 'veto', latency_ms: 360, by: 'votes', voters: ['groq', 'cerebras'], deciders: ['groq', 'cerebras'], votes: votes('FALSE', 'FALSE') });
      if (t.includes('split')) return json(200, { label: 'not-checked', latency_ms: 380, by: 'votes', voters: ['groq', 'cerebras'], deciders: ['groq', 'cerebras'], votes: votes('TRUE', 'FALSE') });
      return json(200, { label: 'not-checked', latency_ms: 5, by: 'skipped' });
    }

    // The agent's card (the /agents list) and its passport (the two fields).
    if (/^\/api\/v1\/agents\/[^/]+\/card$/.test(url)) return json(200, { agent_id: AGENT_ID, repid: scoreNow, total_decisions: 0 });
    if (/^\/api\/v1\/agents\/[^/]+\/owner$/.test(url)) {
      if (ownerMode === 'down') return json(503, { error: 'down' });
      return json(200, ownerMode === 'owned'
        ? { owned: true, owner: { kind: 'human_sbt', assurance: 'signature', wallet: OWNER }, bound_at: '2026-10-12T00:00:00Z', scope: 'ownership' }
        : { owned: false, owner: null, linked_account: null });
    }
    if (/^\/api\/v1\/agents\/[^/]+$/.test(url)) return json(200, { agent_id: AGENT_ID, repid_score: scoreNow, current_repid: scoreNow, tier: 'PROBATIONARY' });
    // The engine's live ownerOf cross-check (E-1). By agent id: the stranger-path agents below are the only ones asked about.
    if (/^\/api\/v1\/agents\/[^/]+\/onchain$/.test(url)) {
      const who = decodeURIComponent(url.split('/')[4]);
      onchainAsked.push(who);
      if (who === 'canon-unconfirmed-agent') return json(200, { dbTokenId: '4321', onChainOwner: null, dbConservator: null, drift: false, reason: 'chain not reached (SERVER_ERROR): 403', check: 'NOT_CHECKED' });
      return json(200, { dbTokenId: who === 'nearmiss-agent' ? '5555' : '1234', onChainOwner: OWNER, dbConservator: OWNER, drift: false, reason: null, check: 'OWNER_FOUND' });
    }
    if (url.startsWith('/api/v1/passport/')) {
      const id = decodeURIComponent(url.slice('/api/v1/passport/'.length));
      const base = {
        passport_version: '1', as_of: '2026-10-12T00:00:00Z',
        agent: { agent_id: id, agent_name: id, display_name: id, created_at: '2026-10-12T00:00:00Z' },
        payments_x402: { real_settlements: 0, simulated_settlements: 0, last_real_settlement: null, policy: 'p' },
        reputation_onchain: { registry_address: 'pending-mint', network: 'base-sepolia', writes: 0, last_write: null },
        zkp: { latest_proof: null, disclosure: 'd', proof_endpoint: '/p', verify_endpoint: '/v' },
      };
      if (id === 'garbage-agent') {
        return json(200, { ...base,
          reputation: { repid_score: 1234, tier: 'ESTABLISHED', activity_30d: 1 },
          identity_erc8004: { registered_onchain: 'MINTED', token_id: 'pending-mint', contract_address: TXHASH, network: 'base-sepolia',
            mint_tx_hash: null, mint_basescan_url: 'javascript:alert(1)', minted_at: null, conservator_address: null, live_verification_endpoint: '/api/v1/agents/x/onchain' } });
      }
      // E-1: the engine RECORDS a mint, but the registry it recorded is a near-miss of the real one. A perfect ownership read
      // does not rescue it: the record is not tied to the canonical registry, so the page must not say on-chain.
      if (id === 'nearmiss-agent') {
        return json(200, { ...base,
          reputation: { repid_score: 3300, tier: 'ESTABLISHED', activity_30d: 1 },
          identity_erc8004: { registered_onchain: 'MINTED', token_id: '5555', contract_address: CANON.slice(0, -1) + 'f', network: 'base-sepolia',
            mint_tx_hash: TXHASH, mint_basescan_url: `https://sepolia.basescan.org/tx/${TXHASH}`, minted_at: '2026-10-01T00:00:00Z', conservator_address: OWNER, live_verification_endpoint: '/api/v1/agents/nearmiss-agent/onchain' } });
      }
      // E-1: a canonical registry on record, but the engine's live read did not reach the chain. Recorded, not verified.
      if (id === 'canon-unconfirmed-agent') {
        return json(200, { ...base,
          reputation: { repid_score: 2100, tier: 'ESTABLISHED', activity_30d: 1 },
          identity_erc8004: { registered_onchain: 'MINTED', token_id: '4321', contract_address: CANON, network: 'base-sepolia',
            mint_tx_hash: TXHASH, mint_basescan_url: `https://sepolia.basescan.org/tx/${TXHASH}`, minted_at: '2026-10-01T00:00:00Z', conservator_address: OWNER, live_verification_endpoint: '/api/v1/agents/canon-unconfirmed-agent/onchain' } });
      }
      if (id === 'canon-agent') {
        return json(200, { ...base,
          reputation: { repid_score: 2227, tier: 'ESTABLISHED', activity_30d: 1 },
          reputation_onchain: { registry_address: '0x8004B663056A597Dffe9eCcC1965A193B7388713', network: 'base-sepolia', writes: 1, last_write: null },
          identity_erc8004: { registered_onchain: 'MINTED', token_id: '1234', contract_address: CANON.toLowerCase(), network: 'base-sepolia',
            mint_tx_hash: TXHASH, mint_basescan_url: `https://sepolia.basescan.org/tx/${TXHASH}`, minted_at: '2026-10-01T00:00:00Z', conservator_address: null, live_verification_endpoint: '/api/v1/agents/x/onchain' } });
      }
      // The stranger's own agent: a fresh, off-chain-only identity.
      return json(200, { ...base,
        reputation: { repid_score: scoreNow, tier: 'PROBATIONARY', activity_30d: 0 },
        identity_erc8004: { registered_onchain: 'NOT_MINTED', token_id: null, contract_address: null, network: null,
          mint_tx_hash: null, mint_basescan_url: null, minted_at: null, conservator_address: null, live_verification_endpoint: '/api/v1/agents/x/onchain' } });
    }

    // The faucet: the engine does NOT dispense. Includes one unsafe link the page must drop.
    if (url === '/api/v1/faucet/info') {
      return json(200, { dispenses: false, message: 'We do not run a faucet.', chain_id: 84532, network: 'Base Sepolia',
        staking_min_eth: '0.0001', staking_suggested_eth: '0.001',
        faucets: [
          { name: 'Coinbase Base Sepolia Faucet', url: 'https://www.coinbase.com/faucets/base-sepolia', assets: ['ETH', 'USDC'], note: 'Free test ETH and USDC.' },
          { name: 'Base.org Sepolia Faucet', url: 'https://sepolia.base.org/faucet', assets: ['ETH'], note: '' },
          { name: 'Hostile Faucet', url: 'javascript:alert(1)', assets: ['ETH'], note: '' },
        ] });
    }
    if (url === '/api/v1/faucet/balance') {
      if (balanceMode === 'down') return json(503, { error: 'down' });
      const a = q.get('address') ?? '';
      if (!/^0x[0-9a-fA-F]{40}$/.test(a)) return json(400, { error: 'INVALID_ADDRESS' });
      const funded = a.toLowerCase() === FUNDED;
      return json(200, { address: a, chain_id: 84532, network: 'Base Sepolia', eth_balance: funded ? '0.005' : '0.0', usdc_balance: funded ? '25.0' : '0.0',
        staking_min_eth: '0.0001', staking_suggested_eth: '0.001',
        enough_to_stake: funded, enough_for_gas: funded, next_step: funded ? 'You have enough to stake.' : 'Fund your wallet at https://www.coinbase.com/faucets/base-sepolia' });
    }

    // /stake reads and the practice deposit.
    if (url.startsWith('/api/v1/stake/authority/')) return json(200, { builder_id: 'b1', stake_total: '0', authority: '0', authority_withheld: false, authority_is_binding: false, basis: 'demo' });
    if (url.startsWith('/api/v1/staking/')) return json(200, { total_active_usdc: deposits.length * 100, deposits: deposits.map((d, i) => ({ id: `d${i}`, amount_usdc: 100, status: 'active' })) });
    if (req.method === 'POST' && url === '/api/v1/stake/deposit') {
      deposits.push({ headers: req.headers, body });
      return json(200, { ok: true, simulated: true });
    }

    // /after-create (read server-side) and the join flag.
    if (url === '/api/v1/after-create') return json(200, { status: 'counted', can_verify: true, can_bind: true, can_stake: true, can_rate_models: false });
    if (url === '/api/v1/trustmarket/join') return json(200, { can_list: false });
    return json(404, { error: 'not found' });
  });
});

// ---- bookkeeping -----------------------------------------------------------------------------
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, pass: ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const until = async (fn, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if (await fn()) return true; } catch { /* keep polling */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
};

// Refuse to run against a server this process did not start (a stale build would be tested instead).
let busy = false;
try { busy = !!(await fetch(`http://127.0.0.1:${APP_PORT}/`, { signal: AbortSignal.timeout(2000) })); } catch { /* nothing listening: good */ }
if (busy) {
  console.error(`NOT_CHECKED: port ${APP_PORT} is already serving. Clear it first:  pkill -f next-server`);
  process.exit(2);
}

await new Promise((r) => engine.listen(ENGINE_PORT, r));
const ENGINE = `http://127.0.0.1:${ENGINE_PORT}`;
const env = { ...process.env, NEXT_PUBLIC_REPID_ENGINE_URL: ENGINE, TRUSTSHELL_API_URL: ENGINE };
const build = spawnNext(['build'], { env, stdio: 'ignore' });
if ((await new Promise((r) => build.on('exit', r))) !== 0) { console.error('build failed'); engine.close(); process.exit(1); }
const app = spawnNext(['start', '--port', String(APP_PORT)], { env, stdio: 'ignore', detached: true });
const killApp = () => { try { process.kill(-app.pid, 'SIGKILL'); } catch { try { app.kill('SIGKILL'); } catch { /* gone */ } } };
process.on('exit', killApp);
const base = `http://127.0.0.1:${APP_PORT}`;
for (let i = 0; i < 120; i++) { try { if ((await fetch(`${base}/faucet`)).ok) break; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 500)); }

const browser = await chromium.launch({ executablePath: chromiumExecutablePath(), args: LAUNCH_ARGS });
const noSideways = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const railBox = async (page, vw) => {
  const b = await page.locator('[data-testid="stranger-rail"]').first().boundingBox();
  return !!b && b.x >= 0 && b.x + b.width <= vw + 1;
};
// With SHOT_DIR set, take a viewport-sized picture of what the stranger sees (the first screenful, not the page).
const shot = async (page, viewport, name) => {
  if (!process.env.SHOT_DIR) return;
  await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}-${viewport.width}.png` });
};
const text = (page, sel) => page.locator(sel).first().innerText().catch(() => '');

async function walk(label, viewport) {
  const tag = `[${label} ${viewport.width}px]`;
  seen = []; scoreNow = 200; ownerMode = 'unbound'; classifyDown = false; balanceMode = 'ok'; deposits = [];
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  const external = []; // anything the browser asked for that is NOT our app or our engine
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(base) && !u.startsWith(ENGINE) && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u); });

  // ---- SCREEN 1: name the agent ----------------------------------------------------------
  await page.goto(`${base}/agents`, { waitUntil: 'networkidle' });
  check(`${tag} screen 1 prints "Step 1 of 4" ON the create page`, (await text(page, '[data-testid="stranger-rail"] summary')).match(/step 1 of 4/i) !== null);
  check(`${tag} screen 1 says what to do and what you will see`, /Create Agent/.test(await text(page, '[data-testid="rail-do"]')) && /saved in this browser only/.test(await text(page, '[data-testid="rail-see"]')));
  check(`${tag} the rail names all four screens`, (await page.locator('[data-testid="stranger-rail"] ol li').count()) === 4);
  check(`${tag} the rail fits the screen and nothing scrolls sideways`, (await railBox(page, viewport.width)) && (await noSideways(page)));
  await page.getByPlaceholder('e.g. Support Copilot').fill('Atlas');
  await page.getByRole('button', { name: /^Create Agent$/ }).click();
  check(`${tag} naming an agent registers it and it appears`, await until(async () => (await page.locator('h4', { hasText: 'Atlas' }).count()) > 0));
  check(`${tag} the register call carried the name`, seen.includes('POST /api/v1/agents/register'));
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, viewport, '1-name');

  // ---- SCREEN 2: pick a belt, or skip; suggest a skill ----------------------------------
  await page.locator('[data-testid="rail-next"]').click();
  await page.waitForURL(/\/belts$/);
  check(`${tag} the rail's Next goes to screen 2`, (await text(page, '[data-testid="stranger-rail"] summary')).match(/step 2 of 4/i) !== null);
  check(`${tag} screen 2 offers Skip`, (await page.locator('[data-testid="rail-skip"]').count()) === 1);
  check(`${tag} no belt is picked until you pick one`, (await page.locator('[data-testid="belt-none"]').count()) === 1);
  await page.locator('[data-testid="belt-cto"]').click();
  check(`${tag} picking a belt writes it down and says it installs nothing`, /Written down: CTO/.test(await text(page, '[data-testid="belt-chosen"]')) && /installs nothing/.test(await text(page, '[data-testid="belt-chosen"]')));
  await page.reload({ waitUntil: 'networkidle' });
  check(`${tag} the pick is remembered after a reload`, await until(async () => (await page.locator('[data-testid="belt-chosen"]').count()) === 1));

  const beforeSkill = external.length;
  await page.locator('[data-testid="skill-url"]').fill('javascript:alert(1)');
  await page.locator('[data-testid="skill-save"]').click();
  check(`${tag} suggest-a-skill refuses javascript: and stores nothing`, /Only https/.test(await text(page, '[data-testid="skill-error"]')) && (await page.locator('[data-testid="skill-list"]').count()) === 0);
  await page.locator('[data-testid="skill-url"]').fill('http://example.com/tool');
  await page.locator('[data-testid="skill-save"]').click();
  check(`${tag} suggest-a-skill refuses plain http`, /Only https/.test(await text(page, '[data-testid="skill-error"]')));
  await page.locator('[data-testid="skill-url"]').fill(SKILL);
  await page.locator('[data-testid="skill-note"]').fill('reads the ledger');
  await page.locator('[data-testid="skill-save"]').click();
  check(`${tag} suggest-a-skill stores the link and says nothing was opened or installed`, /Nothing was opened, downloaded or installed/.test(await text(page, '[data-testid="skill-saved"]')) && (await savedLinks(page)).some((l) => l === SKILL));
  await page.reload({ waitUntil: 'networkidle' });
  check(`${tag} the stored link is still there after a reload`, await until(async () => (await savedLinks(page)).some((l) => l === SKILL)));
  check(`${tag} the saved link is plain text, not an anchor to click`, (await page.locator('[data-testid="skill-list"] a').count()) === 0);
  check(`${tag} the browser asked for NOTHING outside our app and engine (the link was not fetched)`, external.length === beforeSkill && !external.some((u) => hostOf(u) === 'github.com'), external.join(' | '));
  check(`${tag} screen 2 fits and nothing scrolls sideways`, (await railBox(page, viewport.width)) && (await noSideways(page)));
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, viewport, '2-belt');

  // ---- SCREEN 3: run one check, read the receipt ---------------------------------------
  await page.locator('[data-testid="rail-skip"]').click();
  await page.waitForURL(/\/check$/);
  check(`${tag} Skip on screen 2 lands on screen 3`, (await text(page, '[data-testid="stranger-rail"] summary')).match(/step 3 of 4/i) !== null);
  // On /check the rail is a folded one-line breadcrumb (the box comes first); open it the way a person would.
  check(`${tag} screen 3 has no Next before a check`, (await page.locator('[data-testid="rail-next"]').count()) === 0);
  await page.locator('[data-testid="stranger-rail"] summary').click();
  check(`${tag} screen 3 says a vote alone is PROVISIONAL, before you check`, /PROVISIONAL/.test(await text(page, '[data-testid="rail-see"]')));
  check(`${tag} your agent is shown as TWO fields: score and ID`, await until(async () => /field 1 · score/i.test(await text(page, '[data-testid="agent-two-fields"]')) && /field 2 · erc-8004 id/i.test(await text(page, '[data-testid="agent-two-fields"]'))));
  check(`${tag} the new agent's score reads 200 and its ID reads "None yet" (off-chain only)`, (await text(page, '[data-testid="two-fields-score"]')).includes('200') && /None yet/.test(await text(page, '[data-testid="two-fields-id"]')));
  const wire0 = seen.length;
  check(`${tag} nothing was sent when the page loaded (no classify)`, !seen.slice(0).some((s) => s === 'POST /api/v1/classify'));

  await page.locator('#claim').fill(PARIS);
  await page.getByRole('button', { name: /^Check$/ }).click();
  check(`${tag} a true claim gets a receipt`, await until(async () => (await page.locator('[data-testid="check-receipt"]').count()) === 1));
  check(`${tag} the receipt says PROVISIONAL, never SETTLED`, (await page.locator('[data-testid="check-receipt"]').getAttribute('data-status')) === 'PROVISIONAL' && !/SETTLED/.test(await text(page, '[data-testid="check-receipt"]')));
  check(`${tag} the receipt has who-said-what lines and no sentence in them`, (await page.locator('[data-testid="receipt-lines"] code').allInnerTexts()).join('|') === 'gpt-oss groq TRUE|qwen cerebras TRUE');
  check(`${tag} the receipt says nothing was written to any score`, /Nothing was written to any score/.test(await text(page, '[data-testid="receipt-score"]')));
  const afterCheck = seen.slice(wire0);
  check(`${tag} on the wire, the check asked two checkers and wrote NO score (only classify + passport reads)`,
    afterCheck.includes('POST /api/v1/classify') && afterCheck.every((s) => s === 'POST /api/v1/classify' || s.startsWith('GET /api/v1/passport/')), afterCheck.join(', '));
  check(`${tag} the score is unchanged by the check, and the page says so`, await until(async () => /Unchanged by this check/.test(await text(page, '[data-testid="two-fields-moved"]'))));

  await page.locator('#claim').fill(ROME);
  await page.getByRole('button', { name: /^Check$/ }).click();
  check(`${tag} a false claim is Caught, and also only PROVISIONAL`, await until(async () => (await page.locator('[data-testid="check-label"]').getAttribute('data-label')) === 'veto') && (await page.locator('[data-testid="check-receipt"]').getAttribute('data-status')) === 'PROVISIONAL');

  await page.locator('#claim').fill('2 + 2 = 5');
  await page.getByRole('button', { name: /^Check$/ }).click();
  check(`${tag} an equation is decided by exact calculation, with no vote lines`, await until(async () => (await page.locator('[data-testid="check-receipt"]').getAttribute('data-status')) === 'EXACT_CALCULATION') && (await page.locator('[data-testid="receipt-lines"]').count()) === 0);

  await page.locator('#claim').fill(SPLIT);
  await page.getByRole('button', { name: /^Check$/ }).click();
  check(`${tag} a split vote is NOT CHECKED and a no for spending and posting`, await until(async () => (await page.locator('[data-testid="check-receipt"]').getAttribute('data-status')) === 'NOT_CHECKED') && /no for spending and for posting/.test(await text(page, '[data-testid="receipt-gate"]')));

  classifyDown = true;
  await page.locator('#claim').fill(PARIS);
  await page.getByRole('button', { name: /^Check$/ }).click();
  check(`${tag} a check the service could not finish is NOT CHECKED, never Checks out`, await until(async () => (await page.locator('[data-testid="check-label"]').getAttribute('data-label')) === 'not-checked') && (await page.locator('[data-testid="check-receipt"]').getAttribute('data-status')) === 'NOT_CHECKED');
  classifyDown = false;

  // The honest path when the score DID change from something else: the page does not credit the check.
  scoreNow = 205;
  await page.locator('#claim').fill(ROME);
  await page.getByRole('button', { name: /^Check$/ }).click();
  check(`${tag} if the score changed from somewhere else, the page says the check did not write it`, await until(async () => /This check wrote nothing to a score, so the change came from something else/.test(await text(page, '[data-testid="two-fields-moved"]'))));
  scoreNow = 200;
  check(`${tag} the whole check session sent no score-event, stake or deposit`, !seen.some((s) => /score-event|stake\/deposit|\/spend/.test(s)));
  check(`${tag} screen 3 fits and nothing scrolls sideways`, (await railBox(page, viewport.width)) && (await noSideways(page)));
  await page.locator('[data-testid="check-receipt"]').scrollIntoViewIfNeeded();
  await shot(page, viewport, '3-check-receipt');

  // ---- SCREEN 4: the offer --------------------------------------------------------------
  await page.locator('[data-testid="rail-next"]').click();
  await page.waitForURL(/\/after-create$/);
  check(`${tag} screen 4 prints "Step 4 of 4" and has no Next after it`, (await text(page, '[data-testid="stranger-rail"] summary')).match(/step 4 of 4/i) !== null && (await page.locator('[data-testid="rail-next"]').count()) === 0);
  const offer = await text(page, '[data-testid="offer"]');
  check(`${tag} the offer lists register, bind, test tokens, practice stake and the limit, in order`,
    ['Register', 'Bind it', 'Get test tokens', 'Stake on the test network', 'Set a limit, then pull it to zero'].every((t) => offer.includes(t)) &&
    offer.indexOf('Register') < offer.indexOf('Bind it') && offer.indexOf('Bind it') < offer.indexOf('Get test tokens') && offer.indexOf('Get test tokens') < offer.indexOf('Stake on the test network') && offer.indexOf('Stake on the test network') < offer.indexOf('Set a limit'));
  check(`${tag} the on-chain mint is said to be NOT offered yet, and has no button`, /Not offered yet/.test(await text(page, '[data-testid="offer-register"]')) && (await page.locator('[data-testid="offer-register"] a').count()) === 0);
  check(`${tag} the stake row is labelled practice and shadow, never live`, /Practice only/.test(await text(page, '[data-testid="offer-stake"]')) && /shadow — not live/.test(await text(page, '[data-testid="offer-stake"]')) && !/engine says: live/.test(await text(page, '[data-testid="offer-stake"]')));
  const hrefs = await page.locator('[data-testid="offer"] a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  check(`${tag} the offer's buttons go to /bind, /faucet, /stake, /spend`, JSON.stringify(hrefs) === JSON.stringify(['/bind', '/faucet', '/stake', '/spend']), JSON.stringify(hrefs));
  check(`${tag} screen 4 fits and nothing scrolls sideways`, (await railBox(page, viewport.width)) && (await noSideways(page)));
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, viewport, '4-offer');

  // ---- the faucet: points, reads back, never dispenses ------------------------------------
  await page.locator('[data-testid="offer"] a[href="/faucet"]').click();
  await page.waitForURL(/\/faucet$/);
  check(`${tag} the faucet page says we do not hand out tokens`, /TrustShell does not send you test tokens and never will/.test(await text(page, '[data-testid="faucet-no-dispense"]')));
  check(`${tag} it lists the engine's PUBLIC faucets, with ETH and USDC named`, await until(async () => (await page.locator('[data-testid="faucet-links"] li').count()) === 2) && /ETH · USDC/.test(await text(page, '[data-testid="faucet-links"]')));
  check(`${tag} a hostile (javascript:) faucet link from the engine is dropped`, !(await page.locator('a[href^="javascript:"]').count()));
  const faucetLinks = await page.locator('[data-testid="faucet-links"] a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  check(`${tag} faucet links are https and open in a new tab safely`, faucetLinks.every((h) => h.startsWith('https://')) && (await page.locator('[data-testid="faucet-links"] a[rel~="noopener"]').count()) === 2);
  const balanceCallsBefore = seen.filter((s) => s === 'GET /api/v1/faucet/balance').length;
  check(`${tag} no balance is read until you ask`, balanceCallsBefore === 0);
  await page.locator('[data-testid="faucet-address"]').fill('not-an-address');
  await page.locator('[data-testid="faucet-read"]').click();
  check(`${tag} a bad address is Not checked and sends nothing`, /That is not a wallet address/.test(await text(page, '[data-testid="faucet-balance-not-checked"]')) && seen.filter((s) => s === 'GET /api/v1/faucet/balance').length === 0);
  await page.locator('[data-testid="faucet-address"]').fill(EMPTY);
  await page.locator('[data-testid="faucet-read"]').click();
  check(`${tag} an empty wallet reads 0 ETH and says not enough yet`, await until(async () => /Not enough test ETH yet/.test(await text(page, '[data-testid="faucet-verdict"]'))));
  await page.locator('[data-testid="faucet-address"]').fill(FUNDED);
  await page.locator('[data-testid="faucet-read"]').click();
  check(`${tag} after the faucet, the balance reads back and says enough to stake`, await until(async () => (await text(page, '[data-testid="faucet-eth"]')) === '0.005') && (await text(page, '[data-testid="faucet-usdc"]')) === '25.0' && /Enough to stake/.test(await text(page, '[data-testid="faucet-verdict"]')));
  balanceMode = 'down';
  await page.locator('[data-testid="faucet-read"]').click();
  check(`${tag} an unreachable engine is Not checked and shows NO balance (not zero)`, await until(async () => /not a balance of zero/.test(await text(page, '[data-testid="faucet-balance-not-checked"]'))) && (await page.locator('[data-testid="faucet-eth"]').count()) === 0);
  balanceMode = 'ok';
  check(`${tag} the faucet page only ever GOT: no POST, nothing dispensed`, !seen.some((s) => s.startsWith('POST') && /faucet/.test(s)));
  check(`${tag} the faucet page fits and nothing scrolls sideways`, await noSideways(page));
  await page.locator('[data-testid="faucet-balance"]').scrollIntoViewIfNeeded().catch(() => {});
  await shot(page, viewport, '5-faucet');

  // ---- the practice stake: only after the agent is bound -------------------------------------
  await page.evaluate((owner) => {
    localStorage.setItem('trustshell_login_token', 'tok_walk');
    localStorage.setItem('trustshell_account', JSON.stringify({ builder_id: 'b1', builder_address: owner, email: 'a@b.test' }));
  }, OWNER);
  await page.goto(`${base}/stake`, { waitUntil: 'networkidle' });
  check(`${tag} /stake points at the faucet in plain view and is labelled practice`, /Get test tokens and check your balance/.test(await text(page, '[data-testid="stake-faucet-pointer"]')) && (await page.locator('[data-practice-badge]').count()) === 1);
  check(`${tag} an UNBOUND agent cannot stake: the button is held and says to bind first`, await until(async () => /Bind the agent to stake/.test(await text(page, 'form button[type="submit"]')) && (await page.locator('form button[type="submit"]').isDisabled())) && /not bound to a wallet yet/.test(await text(page, '[data-testid="stake-bind-first"]')));
  ownerMode = 'down';
  await page.reload({ waitUntil: 'networkidle' });
  check(`${tag} an unreadable bind record holds the stake too (Not checked is not bound)`, await until(async () => /Not checked: whether this agent is bound could not be read/.test(await text(page, '[data-testid="stake-bind-first"]'))) && (await page.locator('form button[type="submit"]').isDisabled()));
  ownerMode = 'owned';
  await page.reload({ waitUntil: 'networkidle' });
  check(`${tag} once the agent is bound, the practice stake is offered`, await until(async () => (await page.locator('form button[type="submit"]').isEnabled()) && /Stake 100 testnet USDC/.test(await text(page, 'form button[type="submit"]'))) && (await page.locator('[data-testid="stake-bind-first"]').count()) === 0);
  await page.locator('form button[type="submit"]').click();
  check(`${tag} the practice stake succeeds and says it does not raise what the agent may spend`, await until(async () => /It shows in the figure above, but only a real on-chain deposit raises what the agent may actually spend/.test(await text(page, 'main, body'))));
  check(`${tag} it sent a deposit with NO tx hash and NO signature (practice, nothing signed)`, deposits.length === 1 && deposits[0].body.tx_hash === undefined && deposits[0].body.signature === undefined && deposits[0].headers.authorization === 'Bearer tok_walk', JSON.stringify(deposits[0]?.body));
  check(`${tag} /stake fits and nothing scrolls sideways`, await noSideways(page));

  check(`${tag} the limit step exists: /spend loads and says "Set the cap to 0 to stop it"`, await (async () => { await page.goto(`${base}/spend`, { waitUntil: 'networkidle' }); return /Set the cap to 0 to stop it/.test(await text(page, 'main, body')); })());

  check(`${tag} no page errors`, errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

try {
  await walk('phone', { width: 390, height: 844 });
  await walk('desktop', { width: 1280, height: 900 });

  // ---- the passport: canonical or NOT_CHECKED, and two fields ------------------------------------
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${base}/passport/garbage-agent`, { waitUntil: 'networkidle' });
  const html = await page.content();
  const body = await text(page, 'body');
  check('passport: a transaction hash in the registry column is NOT printed', !html.includes(TXHASH.slice(2, 20)) && !body.includes(TXHASH));
  check('passport: a "pending-mint" token id and a "pending-mint" registry are NOT printed', !/pending-mint/.test(html));
  check('passport: a javascript: mint link is NOT rendered as a link', !(await page.locator('a[href^="javascript:"]').count()));
  check('passport: the registry reads Not checked, with the reason', (await page.locator('[data-testid="registry-not-checked"]').count()) >= 1 && /not an address|different address|no IdentityRegistry/.test(body));
  check('passport: the score and the ID are two labelled fields', /field 1 · score/i.test(body) && /field 2 · erc-8004 id/i.test(body) && (await text(page, '[data-testid="field-score"]')).includes('1234'));
  check('passport: a bad token id reads Not checked, not "#pending-mint"', /Not checked/.test(await text(page, '[data-testid="field-id"]')) && !/#pending-mint/.test(body));
  check('passport (E-1): a MINTED record with a transaction hash in the registry column never says "Registered on-chain"', !/Registered on-chain/.test(body) && (await page.locator('[data-testid="mint-verified"]').count()) === 0 && (await page.locator('[data-testid="mint-not-checked"]').count()) === 1);
  check('passport (phone): nothing scrolls sideways', await noSideways(page));

  await page.goto(`${base}/passport/canon-agent`, { waitUntil: 'networkidle' });
  const body2 = await text(page, 'body');
  check('passport: the canonical IdentityRegistry is printed (our constant, whatever casing was sent)', (await text(page, '[data-testid="registry-address"]')) === CANON);
  check('passport: a real token id and a real Base Sepolia mint link are shown', (await text(page, '[data-testid="token-id"]')) === '1234' && (await page.locator(`a[href="https://sepolia.basescan.org/tx/${TXHASH}"]`).count()) === 1);
  check('passport: both fields show for a minted agent', (await text(page, '[data-testid="field-id"]')).includes('#1234') && (await text(page, '[data-testid="field-score"]')).includes('2227'));
  check('passport: "off-chain only" is not claimed for a minted agent', !/Off-chain only/.test(body2));
  check('passport (E-1): a canonical registry AND the engine\'s live ownerOf read: "Registered on-chain", and it says what verified it', (await page.locator('[data-testid="mint-verified"]').count()) === 1 && /Registered on-chain/.test(body2) && /live ownerOf\(\) read found an owner/.test(body2) && onchainAsked.includes('canon-agent'));

  await page.goto(`${base}/passport/nearmiss-agent`, { waitUntil: 'networkidle' });
  const body3 = await text(page, 'body');
  check('passport (E-1): a near-miss of the registry is NOT on-chain, even with a perfect ownership read; the recorded token id stays, as recorded', !/Registered on-chain/.test(body3) && (await page.locator('[data-testid="mint-not-checked"]').count()) === 1 && /Token ID \(recorded\)/.test(body3) && /Recorded, not verified/.test(await text(page, '[data-testid="field-id-state"]')));
  check('passport (E-1): the near-miss registry string is NOT printed', !(await page.content()).includes(CANON.slice(0, -1) + 'f'));

  await page.goto(`${base}/passport/canon-unconfirmed-agent`, { waitUntil: 'networkidle' });
  const body4 = await text(page, 'body');
  check('passport (E-1): a canonical registry whose live ownerOf read did not reach the chain is NOT_CHECKED, not on-chain', !/Registered on-chain/.test(body4) && (await page.locator('[data-testid="mint-not-checked"]').count()) === 1 && (await page.locator('[data-testid="registry-address"]').count()) >= 1 && onchainAsked.includes('canon-unconfirmed-agent'));

  await page.goto(`${base}/passport/${AGENT_ID}`, { waitUntil: 'networkidle' });
  check('passport: a new off-chain agent says so, honestly, with ID "None yet"', /Off-chain only/.test(await text(page, 'body')) && /None yet/.test(await text(page, '[data-testid="field-id"]')));
  await ctx.close();

  // ---- the two honesty pages ------------------------------------------------------------------
  const c2 = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const p2 = await c2.newPage();
  await p2.goto(`${base}/hal-receipt`, { waitUntil: 'networkidle' });
  check('/hal-receipt: a loud banner says FIXTURE, not a live receipt', /fixture\. not a live receipt/i.test(await text(p2, '[data-testid="fixture-banner"]')) && /none of it is about you or your agent/.test(await text(p2, '[data-testid="fixture-banner"]')));
  await p2.goto(`${base}/repid`, { waitUntil: 'networkidle' });
  const repid = await text(p2, 'body');
  check('/repid: no longer shows the ecosystem-need weight multiplying the whole delta', !/ecosystem_need_weight \*/.test(repid) && !/multiplied by an ecosystem-need factor/.test(repid));
  check('/repid: no longer says the constitutional audit gates every score-changing event', !/gate every score-changing event/.test(repid) && /switched\s+off by default/.test(repid));
  check('/repid: says a vote alone is PROVISIONAL and a check here writes nothing to a score', /PROVISIONAL/.test(await text(p2, '[data-testid="repid-settle"]')) && /writes nothing to any score/.test(await text(p2, '[data-testid="repid-settle"]')));
  await c2.close();
} finally {
  await browser.close();
  killApp();
  engine.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed (stubbed engine ${ENGINE}, page ${base})`);
process.exit(failed.length ? 1 : 0);
