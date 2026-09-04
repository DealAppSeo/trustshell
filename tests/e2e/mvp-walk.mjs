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
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { chromiumExecutablePath, LAUNCH_ARGS, loadPlaywrightOrExit } from './chromium-path.mjs';

// Playwright is deliberately not a dependency of this package (CI does not run this suite, so
// declaring it would install a browser driver on every PR for no gating benefit). Absent, this
// exits 2 = NOT_CHECKED — "we did not look" — rather than a module-not-found stack trace.
const { chromium } = await loadPlaywrightOrExit();

const ENGINE_PORT = 4701;
const APP_PORT = 3201;
// A UUID, because the engine issues UUIDs and at least one surface GATES on that shape:
// /bind runs UUID.test() before it will look up ownership at all, so the old
// 'pai-dogfood-agent-001' silently produced a page with no claim panel — and the four
// assertions written against that panel failed as if the product were broken. The engine
// stub was the unfaithful part, not the page. Keep this a UUID.
const AGENT_ID = 'a1c8e0d4-77b2-4f39-8e5a-2b6d0c94f731';

const seen = [];
let passportMode = 'missing';
// Same shape as passportMode: the interesting question for /preview is not only "does the
// tariff render" but "does an unreachable engine read as NOT_CHECKED rather than an empty
// table", and an empty table is what a page renders when it treats a failure as no-data.
let previewMode = 'up';
// PROVEN vs LINKED is the property this whole page had to be corrected for once, so it is a
// switch rather than a fixture: `linked` is an agent administratively associated with an
// account and owned by nobody, and it MUST render as not owned. `owned` is a real signature.
let ownerMode = 'linked';
// The authority ceiling for a builder whose path never applied the builder floor. The backend
// withholds the figure because A_eff would refuse it; the UI must say so rather than convert a
// null through rawToUsdc(), which returns 0 and would render "$0.00" — asserting the ceiling was
// measured and came out empty, the opposite falsehood.
let authorityMode = 'withheld';

/**
 * The bind statement, in the engine's exact wording — because the page is supposed to RENDER
 * what the engine sends rather than rebuild it client-side. Asserting the page contains this
 * string is what catches a client that quietly composes its own sentence: the code that
 * verifies a signature and the text shown to the person signing must not be able to drift.
 */
const BIND_STATEMENT = [
  'HyperDAG — bind agent to human',
  '',
  'wallet: 0x8f4b2c1a9d7e3f60ab5c8e21d4f9a0b7c36e5d18',
  `agent:  ${AGENT_ID}`,
  'scope:  ownership',
  '',
  'Signing this proves you control this wallet and claims ownership of this agent.',
  'It moves no funds and grants no spending authority.',
].join('\n');

const PREVIEW_ACTIONS = [
  { eventType: 'REFERRAL', verdict: 'APPROXIMATE', delta: 20, contingentOnEvidence: true,
    reason: 'published tariff for this action' },
  { eventType: 'CODE_CONTRIBUTION', verdict: 'APPROXIMATE', delta: 25, contingentOnEvidence: true,
    reason: 'published tariff for this action' },
  { eventType: 'CHALLENGE_WIN', verdict: 'NOT_CHECKED', delta: null, contingentOnEvidence: false,
    reason: 'computed by the challenge scorer from certainty asserted at claim time' },
];
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
  if (u.includes('/stake/authority/')) {
    if (authorityMode === 'withheld') {
      return json(200, {
        builder_id: 'b1', stake_total: '100000000',
        authority: null, authority_withheld: true, authority_is_binding: false,
        authority_detail: 'The builder floor was not applied on this path at all. It is not zero; it is not established.',
        basis: 'demo',
      });
    }
    return json(200, {
      builder_id: 'b1', stake_total: '100000000',
      authority: '50000000', authority_withheld: false, authority_is_binding: true, basis: 'sqrt',
    });
  }
  if (u.includes('/api/v1/staking/')) return json(200, { total_active_usdc: 100, positions: [] });
  if (/\/api\/v1\/agents\/[^/]+$/.test(u.split('?')[0])) {
    return json(200, { agent_id: AGENT_ID, current_repid: 1200, tier: 'ESTABLISHED' });
  }
  if (u.includes('/repid/preview/actions')) {
    if (previewMode === 'down') return json(503, { error: 'unavailable' });
    return json(200, { ok: true, measurement: 'APPROXIMATE', persisted: false,
      actions: PREVIEW_ACTIONS,
      disclaimer: 'Preview only. Nothing here was written and no reputation was earned.' });
  }
  if (u.includes('/repid/preview/project')) {
    if (previewMode === 'down') return json(503, { error: 'unavailable' });
    return json(200, { ok: true, measurement: 'APPROXIMATE', persisted: false,
      baseRepId: 200, projectedRepId: 245, projectedTier: 'PROBATIONARY',
      tierIsCounterpartyGateApproximation: true,
      tierCaveat: 'Score-ladder tier only. The database derives the real tier from a trigger that also demotes AUTONOMOUS and VETERAN below 2 unique counterparties.',
      events: PREVIEW_ACTIONS.slice(0, 2),
      omits: ['decay — the live path decays the current score against 30-day activity'] });
  }
  if (/\/card$/.test(u.split('?')[0])) {
    return json(200, {
      agent_id: AGENT_ID, name: 'Dogfood recovered', description: 'rebuilt from its public card',
      repid: 61.4, total_decisions: 137,
      created_at: '2026-07-14T09:02:00Z', last_active_at: '2026-08-29T18:41:00Z',
    });
  }
  if (u.includes('/passport/')) return passportMode === 'down' ? json(503, { error: 'unavailable' }) : json(404, { error: 'not found' });

  // --- the claim surface -----------------------------------------------------------------
  if (u.includes('/human/bind/message')) return json(200, { message: BIND_STATEMENT, scope: 'ownership' });
  if (/\/owner$/.test(u.split('?')[0])) {
    return json(200, ownerMode === 'owned'
      ? { owned: true, owner: { kind: 'human_sbt', assurance: 'signature' }, bound_at: '2026-08-30T10:00:00Z', scope: 'ownership' }
      // owned:false WITH a linked_account is the shape the UI must not round up to ownership.
      : { owned: false, owner: null, linked_account: 'builder-42' });
  }
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
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, acceptDownloads: true });
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

  // --- /preview: the page for someone who has none of the above ------------------------
  //
  // Every step until now assumes an agent already exists. /preview is the one surface for a
  // visitor deciding whether to start at all, and the thing most worth checking is not that
  // the markup appears — SSR renders identically whether or not React mounts — but that the
  // PROJECTOR actually works when clicked. That is a client-side path, and clicking it is the
  // only way to know it runs.
  await page.goto(`${base}/preview`, { waitUntil: 'networkidle' });
  const prevBody = await page.locator('body').innerText();
  note(/REFERRAL/.test(prevBody) && /\+20/.test(prevBody),
    'the tariff renders real values, not placeholders');
  note(/NOT_CHECKED/.test(prevBody),
    'an action whose value cannot be stated is LISTED as NOT_CHECKED, not hidden');
  note(/APPROXIMATE/i.test(prevBody),
    'the page says APPROXIMATE — a projection is never presented as an earned score');

  const projectBtn = page.getByRole('button', { name: /^Project$/ });
  await projectBtn.click();
  await page.waitForTimeout(1200);
  const projected = await page.locator('body').innerText();
  // If React never mounted, the click is a no-op and the page looks exactly as it did.
  note(/245/.test(projected), 'THE PROJECTOR ACTUALLY RUNS — a projected score appears after the click');
  note(/counterpart/i.test(projected),
    'the tier caveat is shown WITH the tier, not filed at the bottom');
  note(/decay/i.test(projected), 'the projection states what it omits');
  note(/Nothing was written/i.test(projected),
    'the page says nothing was persisted — read off the response, not asserted');

  // The funnel edge. A page that answers "is this worth it" and then leads nowhere strands
  // the one person it was written for.
  note(await page.locator('a[href="/start"]').count() > 0,
    '/preview offers a next step instead of dead-ending');

  // --- and the same page with the engine unreachable ------------------------------------
  previewMode = 'down';
  await page.goto(`${base}/preview`, { waitUntil: 'networkidle' });
  const downBody = await page.locator('body').innerText();
  const rowCount = await page.locator('tbody tr').count();
  note(rowCount === 0, 'an unreachable engine renders NO table rather than an empty one', `rows=${rowCount}`);
  note(/NOT_CHECKED/.test(downBody) && /not\s+.?no actions|is not\b|nothing was measured/i.test(downBody),
    'and says nothing was measured — an empty table would read as "no actions are worth anything"');
  previewMode = 'up';

  // --- /stake: a withheld ceiling must not become "$0.00" ------------------------------
  //
  // THE HAZARD IS THE CONVERSION, not the fetch. rawToUsdc(null) returns 0, so a page that
  // converts before checking renders a confident "$0.00" — claiming the ceiling WAS measured and
  // came out empty. That is a different false statement from the one the backend withholds the
  // figure to avoid, and a worse one: $0.00 looks like a fact, a blank looks like a gap.
  //
  // Reachable here only because registration above persisted an agent to IndexedDB, which is
  // what /stake reads to populate its picker.
  await page.goto(`${base}/stake`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const stakeBody = await page.locator('body').innerText();
  note(!/\$0\.00/.test(stakeBody),
    'a withheld ceiling is NOT rendered as $0.00', stakeBody.match(/\$[\d.]+/g)?.join(' ') ?? '');
  // SCOPED TO THE STAT, not the page. The first version of this assertion searched the whole
  // body — and passed even with the guard removed, because the backend's own detail sentence
  // contains the words "it is not established". It was matching prose while the number beside it
  // read $0.00. An assertion that can pass for the wrong reason is worse than none: it certifies
  // the exact failure it was written to catch.
  const ceilingStat = await page
    .locator('p', { hasText: /^Authority ceiling$/i })
    .locator('xpath=following-sibling::p[1]')
    .innerText();
  note(/^Not established$/i.test(ceilingStat.trim()),
    'the ceiling STAT ITSELF reads "Not established" — no figure, rather than a figure of zero',
    `stat=${JSON.stringify(ceilingStat.trim())}`);
  note(/not zero/i.test(stakeBody),
    'and the backend reason is shown, so the reader knows which of the two it is');

  authorityMode = 'binding';
  await page.goto(`${base}/stake`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const stakeOk = await page.locator('body').innerText();
  note(/\$50\.00/.test(stakeOk),
    'a REAL binding ceiling still renders its figure — withholding must not swallow good data');
  const ceilingStatOk = await page
    .locator('p', { hasText: /^Authority ceiling$/i })
    .locator('xpath=following-sibling::p[1]')
    .innerText();
  note(/^\$50\.00$/.test(ceilingStatOk.trim()),
    'and the stat carries the real figure, not a label',
    `stat=${JSON.stringify(ceilingStatOk.trim())}`);
  authorityMode = 'withheld';

  // --- /bind: the last step of the journey, and the one whose whole job is to not overclaim.
  //
  // PLACED LAST ON PURPOSE. Reaching a signable state needs `window.ethereum`, and injecting a
  // wallet changes what every other page sees — /stake reads one too. Running this after the
  // rest means nothing above can be affected by the shim.
  //
  // WHAT THIS CANNOT CHECK, stated rather than faked: the signature itself. ethers rejects a
  // synthetic signature, so the walk stops at the moment before the wallet prompt opens. Every
  // assertion below is about what the page SAYS and REFUSES, which is the part that can lie.

  // Without a wallet at all — the state most first visitors are in.
  await page.goto(`${base}/bind`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const bindNoWallet = await page.locator('body').innerText();
  note(/wallet/i.test(bindNoWallet) && bindNoWallet.trim().length > 200,
    'the claim page explains itself with no wallet installed, rather than rendering blank');
  note(!errs.some((e) => /ethereum|wallet/i.test(e)),
    'and it does not throw looking for a wallet that is not there');

  // A wallet that exists and is already connected. eth_accounts is answered silently; nothing
  // here calls eth_requestAccounts, so no popup is opened that nobody asked for.
  const WALLET = '0x8F4b2C1a9D7e3F60aB5c8E21D4f9A0b7C36e5D18';
  await page.addInitScript(`window.ethereum = {
    isMetaMask: true,
    request: async ({ method }) => {
      if (method === 'eth_accounts' || method === 'eth_requestAccounts') return ['${WALLET}'];
      if (method === 'eth_chainId') return '0x14a34';
      return null;
    },
    on: () => {}, removeListener: () => {},
  };`);

  await page.goto(`${base}/bind`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  let bindBody = await page.locator('body').innerText();

  // THE PROPERTY THIS PAGE WAS CORRECTED FOR. `owned:false` with a `linked_account` is an
  // administrative association nobody signed. Rendering it as ownership is the exact overclaim
  // the passport page had to retract, and it is one refactor away at all times.
  note(/not owned/i.test(bindBody),
    'an agent LINKED to an account reads as NOT owned — an association is not a signature');
  note(!/\bis owned by\b/i.test(bindBody) && !/you own this/i.test(bindBody),
    'and nothing on the page rounds that association up to ownership');

  // The statement is fetched, not rebuilt — but it is deliberately RE-TYPESET: the machine
  // parameters keep the monospace, the two sentences of English take the display face. So the
  // rendered text is not byte-identical to the wire format, and asserting that it is fails on a
  // working page. Ask the two questions separately.
  //
  // First: does the split view actually carry the three values a person is agreeing to?
  //
  // Match on the VALUES, not on the wire format's punctuation. The split rendering puts each
  // label in its own element, so `wallet:` on the wire becomes a `wallet` label beside its
  // value and the colon is gone from innerText. Asserting the colon fails on a correct page —
  // it was the fourth harness artifact in this section, after the non-UUID agent id and the
  // exact-spacing comparison. A test written from the wire format does not describe a page
  // that deliberately re-typesets it.
  const flat = bindBody.replace(/\s+/g, ' ').toLowerCase();
  note(
    ['wallet', '0x8f4b2c1a9d7e3f60ab5c8e21d4f9a0b7c36e5d18', 'agent', AGENT_ID, 'scope', 'ownership']
      .every((bit) => flat.includes(bit.toLowerCase())),
    'the split statement still names the wallet, the agent and the scope being agreed to');

  // Second, and this is the one that catches a client-side reconstruction: the verbatim
  // disclosure must hold the engine's EXACT characters. The split rendering is only honest
  // while the real document stays checkable underneath it.
  const disclosure = page.getByText(/exact text being signed/i);
  const hasDisclosure = (await disclosure.count()) > 0;
  note(hasDisclosure, 'the exact bytes being signed are disclosed, not only the tidy rendering');
  if (hasDisclosure) {
    await disclosure.first().click();
    await page.waitForTimeout(400);
    const raw = await page.locator('.claim-statement-raw').first().innerText();
    note(raw.trim() === BIND_STATEMENT.trim(),
      "the disclosed text is the ENGINE's, character for character — not a reconstruction",
      raw.trim() === BIND_STATEMENT.trim() ? '' : JSON.stringify(raw.slice(0, 80)));
  }

  // Two prompts, disclosed before the first one opens. A second wallet popup nobody was warned
  // about reads as a malfunction, and that is how people learn to dismiss them.
  note(/two signature|2 signature|twice|second signature/i.test(bindBody),
    'both wallet prompts are disclosed BEFORE the first one opens');

  // An already-claimed agent is refused up front, so nobody is asked to open a wallet and fail.
  ownerMode = 'owned';
  await page.goto(`${base}/bind`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  bindBody = await page.locator('body').innerText();
  const claimBtn = page.getByRole('button', { name: /sign and claim/i });
  note((await claimBtn.count()) === 0 || !(await claimBtn.first().isEnabled()),
    'an agent that is already claimed offers no way to sign — the check happens before the prompt');
  note(/already|claimed|owned/i.test(bindBody),
    'and it says so, rather than failing at the signature');
  ownerMode = 'linked';

  // --- can the agent LEAVE the browser that made it? ---------------------------------------
  //
  // The last thing the journey owes someone who has built an agent. Settings called TrustShell
  // "the portable agentic trust harness" for months while agents lived in one browser's
  // IndexedDB with no way out, so this walks the loss and the recovery rather than trusting
  // that a button exists: back up, WIPE, restore, and check the agent came back whole.
  //
  // LAST ON PURPOSE. This section deliberately destroys local storage mid-way, so anything
  // after it would be testing a browser that had just been cleared.

  await page.goto(`${base}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  let settings = await page.locator('body').innerText();
  note(/agent/i.test(settings) && /back up/i.test(settings),
    'Settings offers a way to take the agent with you');

  // The file holds an API key the engine issues ONCE and cannot reissue, so the page has to say
  // so before somebody drops it in a shared folder. A silent backup of a secret is its own bug.
  note(/API keys|like a password/i.test(settings),
    'and it says out loud that the backup contains keys, rather than shipping a secret quietly');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /back up agents/i }).click(),
  ]);
  const backupPath = await download.path();
  const backupText = backupPath ? await readFile(backupPath, 'utf8') : '';
  note(!!backupPath && /^trustshell-agents-.*\.json$/.test(download.suggestedFilename()),
    'the backup downloads and names itself for what it holds', download.suggestedFilename());
  note(backupText.includes(AGENT_ID),
    'the agent this walk registered is actually in the file — not an empty export');

  // THE LOSS, staged exactly as it happens: site data cleared, plus one agent that exists only
  // here and has never been backed up. Import must not delete it.
  const LOCAL_ONLY = '7d2e9f01-3a4b-4c5d-8e6f-9a0b1c2d3e4f';
  await page.evaluate(async (only) => {
    await new Promise((resolve, reject) => {
      const o = indexedDB.open('keyval-store', 1);
      o.onupgradeneeded = () => o.result.createObjectStore('keyval');
      o.onsuccess = () => {
        const tx = o.result.transaction('keyval', 'readwrite');
        tx.objectStore('keyval').put(
          [{ id: only, name: 'Sable', createdAt: 3000, totalPrompts: 1, lastUsedAt: 7000, apiKey: 'sk-sable-local' }],
          'trustshell_agents_v1',
        );
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      };
      o.onerror = () => reject(o.error);
    });
  }, LOCAL_ONLY);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  await page.setInputFiles('input[type=file][accept*="json"]', backupPath);
  await page.waitForTimeout(1200);

  const restored = await page.evaluate(async () => {
    return new Promise((resolve, reject) => {
      const o = indexedDB.open('keyval-store', 1);
      o.onupgradeneeded = () => o.result.createObjectStore('keyval');
      o.onsuccess = () => {
        const g = o.result.transaction('keyval', 'readonly').objectStore('keyval').get('trustshell_agents_v1');
        g.onsuccess = () => resolve(g.result ?? []);
        g.onerror = () => reject(g.error);
      };
      o.onerror = () => reject(o.error);
    });
  });
  const ids = restored.map((a) => a.id);
  note(ids.includes(AGENT_ID), 'the backed-up agent comes back after the browser is wiped');
  note(ids.includes(LOCAL_ONLY),
    'AND the agent that existed only in this browser is NOT deleted by the import — a restore that ' +
    'replaces instead of merging causes the exact loss this feature exists to prevent',
    ids.join(', '));
  note(restored.find((a) => a.id === LOCAL_ONLY)?.apiKey === 'sk-sable-local',
    'the local-only agent keeps its own unreissuable key');

  // Importing the same file twice must not read as a second successful restore.
  await page.setInputFiles('input[type=file][accept*="json"]', backupPath);
  await page.waitForTimeout(1000);
  settings = await page.locator('body').innerText();
  note(/nothing new/i.test(settings),
    're-importing the same file says "nothing new" rather than claiming a restore it did not perform');

  // The vault backup is also .json and sits on this same page. Refusing it by NAME is what stops
  // somebody concluding their agents are gone when they simply picked the wrong file.
  const decoy = `${tmpdir()}/mvp-walk-vault-decoy.json`;
  await writeFile(decoy, JSON.stringify({ salt: 'x', iv: 'y', ciphertext: 'z' }));
  await page.setInputFiles('input[type=file][accept*="json"]', decoy);
  await page.waitForTimeout(900);
  settings = await page.locator('body').innerText();
  note(/vault/i.test(settings) && /not a trustshell agent export/i.test(settings),
    'the encrypted vault file is refused BY NAME, so a wrong pick is not mistaken for data loss');

  // Recovery by ID is the last resort, and it must say what it CANNOT return before anyone
  // commits — an agent that comes back unable to earn, with no warning, is the quiet failure.
  const idField = page.locator('input[placeholder^="00000000"]');
  if (await idField.count()) {
    await idField.fill(AGENT_ID);
    await page.getByRole('button', { name: /look it up/i }).click();
    await page.waitForTimeout(1200);
    settings = await page.locator('body').innerText();
    note(/Dogfood recovered/i.test(settings),
      'an agent can be rebuilt from its public card when the backup file is gone too');
    note(/API key/i.test(settings) && /constitution/i.test(settings),
      'and the page states what recovery CANNOT return — the key and the constitution — before you commit');
  } else {
    note(false, 'recovery by ID is reachable from Settings');
  }

  note(errs.length === 0, 'no runtime errors across the whole walk', errs.slice(0, 3).join('; '));
} catch (e) {
  note(false, 'walk aborted', e.message.split('\n')[0]);
} finally {
  await browser.close(); killApp(); engine.close();
}

const gaps = findings.filter((f) => !f.ok);
console.log(`\n${findings.length - gaps.length}/${findings.length} OK`);
if (gaps.length) console.log('GAPS:\n' + gaps.map((g) => `  - ${g.what}${g.detail ? ` (${g.detail})` : ''}`).join('\n'));

// THIS LINE WAS MISSING, AND ITS ABSENCE MADE THE SUITE REPORT SUCCESS OVER ITS OWN FAILURES.
// Everything above printed GAPS and then exited 0. Anything keying off the exit code — a script,
// a future CI step, a person typing `&& echo ok` — read a broken product journey as a passing
// one. That is the exact defect this suite exists to catch, in the suite itself.
//
// `grants-fail-closed.mjs`, in this directory, already ends with the same line, which is what
// establishes this as an omission rather than a choice. Not being in gating CI is a decision
// about where the suite RUNS; it was never a licence to misreport when it does.
//
// Repo convention: 0 VERIFIED, 2 NOT_CHECKED (Playwright absent — handled at the top), else FAILED.
process.exit(gaps.length === 0 ? 0 : 1);
