/**
 * An agent's rules, in a real browser (Sean, 2026-10-07: "the IKEA principle, letting the user
 * train the agent to make it smarter faster").
 *
 * The rules a person writes at creation used to reach nothing that acted on them: /run sent the
 * question alone. This walk proves the loop a stranger would use:
 *
 *   create an agent with a rule → ask on /run → the MODEL gets the rule with the question
 *   → scoring gets the question alone → "Teach it" adds a dated correction
 *   → the next question carries it → editing the rules to nothing sends the bare question again
 *   → it all survives a reload.
 *
 * The stub engine records exactly what the page sent, so the assertions are about the request,
 * not about what the page claims it sent. Builds in-suite; NOT in gating CI.
 *
 *     npm run test:rules-walk
 */
import { createServer } from 'node:http';
import { chromiumExecutablePath, LAUNCH_ARGS, loadPlaywrightOrExit, spawnNext } from './chromium-path.mjs';

const { chromium } = await loadPlaywrightOrExit();

const ENGINE_PORT = 4721;
const APP_PORT = 3221;
const AGENT_ID = 'b2d9f1e5-88c3-4a40-9f6b-3c7e1d05a842';
const asked = []; // prompts /llm/complete received
const scored = []; // prompts score-event received

const engine = createServer((req, res) => {
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'Content-Type,Authorization,x-api-key,X-RepID-Version,x-agent-token',
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const json = (status, body) => { res.writeHead(status, { 'content-type': 'application/json', ...cors }); res.end(JSON.stringify(body)); };
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : {};
    const url = req.url.split('?')[0];
    if (req.method === 'POST' && url === '/api/v1/agents/register') return json(200, { agent_id: AGENT_ID, api_key: 'k_rules_walk' });
    if (req.method === 'POST' && url === '/api/v1/llm/complete') {
      asked.push(body.prompt);
      return json(200, { answer: 'Paris.', provider: 'stub', model: 'stub-1', tier: 0, tokens_in: 10, tokens_out: 2, latency_ms: 5, cost_estimate_usd: 0 });
    }
    if (req.method === 'POST' && url === `/api/v1/agents/${AGENT_ID}/score-event`) {
      scored.push(body.prompt);
      return json(200, { delta: 0, hal_decision: 'passed' });
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
const page = await (await browser.newContext({ viewport: { width: 390, height: 900 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

const QUESTION = 'What is the capital of France?';
const ask = async (q) => {
  const before = asked.length;
  await page.getByPlaceholder('Enter prompt here...').fill(q);
  await page.getByRole('button', { name: 'Run prompt' }).click();
  for (let i = 0; i < 40 && asked.length === before; i++) await page.waitForTimeout(250);
  await page.waitForTimeout(800);
  return asked.at(-1);
};

try {
  await page.goto(`${base}/agents`, { waitUntil: 'networkidle' });
  const body0 = await page.locator('body').innerText();
  check('the create form no longer claims HAL enforces the rules', !/HAL flags violations/.test(body0) && /sent with every question/.test(body0));
  await page.getByPlaceholder('e.g. Support Copilot').fill('Rule Keeper');
  await page.getByPlaceholder(/Never give financial advice/).fill('Always cite a source.');
  await page.getByRole('button', { name: /^Create Agent$/ }).click();
  await page.getByRole('heading', { name: 'Rule Keeper', exact: true }).waitFor({ timeout: 10_000 });

  await page.goto(`${base}/run/${AGENT_ID}`, { waitUntil: 'networkidle' });
  const rules = page.getByRole('region', { name: 'Its rules' });
  check('the run page shows the rules and says they are sent, not enforced', /1 line, sent with every question you ask it\. Nothing checks the answer against them yet\./.test(await rules.innerText()));

  const p1 = await ask(QUESTION);
  check('the model gets the rule with the question', typeof p1 === 'string' && p1.includes('Always cite a source.') && p1.endsWith(QUESTION), JSON.stringify(p1));
  check('scoring gets the question alone', scored.at(-1) === QUESTION, JSON.stringify(scored.at(-1)));

  await page.getByRole('button', { name: 'Teach it' }).first().click();
  await page.getByLabel('What should it do differently next time?').fill('Give the source for every number.');
  await page.getByRole('button', { name: 'Add to its rules' }).click();
  await page.getByRole('status').first().waitFor({ timeout: 5000 });
  check('teaching confirms where the correction went', /Added to its rules/.test(await page.getByRole('status').first().innerText()));
  check('the rules now show a dated correction', /## Corrections\n- \d{4}-\d{2}-\d{2}: Give the source for every number\./.test(await rules.innerText()));

  const p2 = await ask('How many moons does Mars have?');
  check('the next question carries the correction', typeof p2 === 'string' && p2.includes('Give the source for every number.') && p2.includes('Always cite a source.'));

  await page.reload({ waitUntil: 'networkidle' });
  check('the taught rules survive a reload', /Give the source for every number\./.test(await page.getByRole('region', { name: 'Its rules' }).innerText()));

  await page.getByRole('region', { name: 'Its rules' }).getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('textbox', { name: 'Rules', exact: true }).fill('');
  await page.getByRole('button', { name: 'Save rules' }).click();
  await page.waitForTimeout(400);
  const p3 = await ask(QUESTION);
  check('with the rules cleared, the bare question is sent again', p3 === QUESTION, JSON.stringify(p3));

  await page.getByRole('region', { name: 'Its rules' }).getByRole('button', { name: 'Add rules' }).click();
  await page.getByRole('textbox', { name: 'Rules', exact: true }).fill('x'.repeat(10));
  await page.getByRole('button', { name: 'Save rules' }).click();
  await page.waitForTimeout(300);
  check('a short edit saves', /1 line/.test(await page.getByRole('region', { name: 'Its rules' }).innerText()));

  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  const wide = await page.evaluate(() =>
    [...document.querySelectorAll('body *')]
      .filter((e) => {
        for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
          if (/auto|scroll|hidden|clip/.test(getComputedStyle(a).overflowX)) return false;
        }
        return true;
      })
      .map((e) => ({ e, r: e.getBoundingClientRect().right }))
      .filter((x) => x.r > window.innerWidth)
      .sort((a, b) => b.r - a.r)
      .slice(0, 3)
      .map((x) => `${x.e.tagName.toLowerCase()} "${(x.e.textContent || '').trim().slice(0, 40)}" right=${Math.round(x.r)}`)
      .join(' | '));
  check('nothing scrolls sideways at 390px on /run', sw <= 390, `scrollWidth ${sw}${wide ? `; widest: ${wide}` : ''}`);
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
