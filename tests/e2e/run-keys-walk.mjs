/**
 * Which vault keys does /run actually send, in a real browser? (loop sprint 5, 2026-10-23)
 *
 * lib/run-keys.ts decides it, tests/run-keys.test.ts holds the logic, and this holds the WIRING: a
 * helper that is correct and not called is the failure LESSONS rule 2 names. It builds the app twice
 * (NEXT_PUBLIC_* is inlined at build time, so a flag cannot be flipped on one build), creates a real
 * vault in the browser, saves a key for every one of the seven providers, opens an agent, runs a
 * prompt on Auto, and reads what the engine received in `user_paid_keys`.
 *
 *   flag unset (default):           every key the vault holds is sent, as before
 *   NEXT_PUBLIC_RUN_LEAST_KEYS=1:   only openai and anthropic, the two the engine reads
 *
 * Free only is checked in the same pass: it sends no keys on either build.
 *
 * NOT IN GATING CI, like its siblings (needs a browser and two builds). Run on demand:
 *     node tests/e2e/run-keys-walk.mjs
 * The vault stays unlocked only in page memory, so the walk never reloads the page after creating
 * it: it goes /connect -> Save -> /agents -> Use, all client-side navigation.
 * Fixture key values are test strings, not credentials.
 */
import { createServer } from 'node:http';
import { chromiumExecutablePath, LAUNCH_ARGS, loadPlaywrightOrExit, spawnNext } from './chromium-path.mjs';

const { chromium } = await loadPlaywrightOrExit();

const ENGINE_PORT = 4601;
const APP_PORT = 3101;
const AGENT_ID = 'agent-keys-walk-001';
const PROVIDERS = ['openai', 'anthropic', 'groq', 'gemini', 'cerebras', 'deepseek', 'cohere'];
const FIXTURE = (p) => ['walk', 'fixture', p].join('-');
const PASSPHRASE = ['walk', 'passphrase', 'long', 'enough'].join('-');

const runBodies = [];
const engine = createServer((req, res) => {
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization,x-api-key,x-agent-gate-token',
    'access-control-expose-headers': 'x-taste-remaining',
  };
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    return res.end();
  }
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const json = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json', ...cors });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'POST' && req.url.startsWith('/api/v1/llm/complete')) {
      let body = {};
      try { body = JSON.parse(raw); } catch { /* recorded as empty */ }
      runBodies.push(body);
      return json(200, { response: 'ok', content: 'ok', provider: 'mock', tier: 0, latency_ms: 1, tokens_in: 1, tokens_out: 1, cost: 0 });
    }
    return json(404, { error: 'not found' });
  });
});

const results = [];
const check = (name, pass, note = '') => {
  results.push({ name, pass, note });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${note ? ` — ${note}` : ''}`);
};

async function waitForApp(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).ok) return true; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function portBusy(port) {
  try { return !!(await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) })); } catch { return false; }
}

await new Promise((r) => engine.listen(ENGINE_PORT, r));
if (await portBusy(APP_PORT)) {
  console.error(`NOT_CHECKED: port ${APP_PORT} is already serving; this suite will not test a server it did not start.`);
  process.exit(2);
}

/** Build with the given flag, serve, drive the browser, return the key names the engine received per run. */
async function walk(label, flag) {
  const env = { ...process.env, NEXT_PUBLIC_REPID_ENGINE_URL: `http://127.0.0.1:${ENGINE_PORT}` };
  if (flag) env.NEXT_PUBLIC_RUN_LEAST_KEYS = '1';
  else delete env.NEXT_PUBLIC_RUN_LEAST_KEYS;

  const build = spawnNext(['build'], { env, stdio: 'ignore' });
  const code = await new Promise((r) => build.on('exit', r));
  if (code !== 0) throw new Error(`next build exited ${code} (${label})`);

  const app = spawnNext(['start', '--port', String(APP_PORT)], { env, stdio: 'ignore' });
  const stop = () => { try { app.kill('SIGKILL'); } catch { /* gone */ } };
  process.on('exit', stop);
  try {
    const base = `http://127.0.0.1:${APP_PORT}`;
    if (!(await waitForApp(`${base}/connect`))) throw new Error(`app never became ready (${label})`);
    const browser = await chromium.launch({ executablePath: chromiumExecutablePath(), args: LAUNCH_ARGS });
    try {
      const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
      page.on('pageerror', () => {});

      // An agent in this browser's local store, where the app keeps them (lib/db.ts).
      await page.goto(`${base}/connect`, { waitUntil: 'networkidle' });
      await page.evaluate(
        (agent) =>
          new Promise((resolve, reject) => {
            const open = indexedDB.open('keyval-store');
            open.onupgradeneeded = () => open.result.createObjectStore('keyval');
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
              const db = open.result;
              const tx = db.transaction('keyval', 'readwrite');
              tx.objectStore('keyval').put([agent], 'trustshell_agents_v1');
              tx.oncomplete = () => { db.close(); resolve(); };
              tx.onerror = () => reject(tx.error);
            };
          }),
        { id: AGENT_ID, name: 'Keys walk', createdAt: 1, totalPrompts: 0, lastUsedAt: 1 },
      );
      await page.goto(`${base}/connect`, { waitUntil: 'networkidle' });

      // 1. A real vault, with a key for every provider. Hydration race: retry the first interaction once.
      const pass1 = page.getByPlaceholder('Passphrase', { exact: true });
      await pass1.waitFor({ state: 'visible', timeout: 15_000 });
      // The form is server-rendered before React attaches: a fill that lands first is overwritten.
      await page.waitForTimeout(2000);
      await pass1.fill(PASSPHRASE);
      await page.getByPlaceholder('Confirm Passphrase').fill(PASSPHRASE);
      await page.getByRole('checkbox').check();
      await page.getByRole('button', { name: /create vault/i }).click();
      for (const p of PROVIDERS) {
        const box = page.getByPlaceholder(`${p} key`);
        await box.waitFor({ state: 'visible', timeout: 15_000 });
        await box.fill(FIXTURE(p));
      }
      await page.getByRole('button', { name: /save and continue/i }).click();

      // 2. Client-side to the agent's run page (a reload would lock the vault: it lives in page memory).
      await page.waitForURL('**/agents', { timeout: 30_000 });
      await page.getByRole('button', { name: /^use$/i }).first().click();
      await page.waitForURL(`**/run/${AGENT_ID}`, { timeout: 15_000 });

      // 3. Run on Auto (the default), then on Free only.
      const send = async (tier) => {
        const before = runBodies.length;
        if (tier) await page.locator('select').selectOption(tier);
        await page.getByPlaceholder('Enter prompt here...').fill('Say hi.');
        await page.getByRole('button', { name: /run prompt/i }).click();
        const deadline = Date.now() + 20_000;
        while (runBodies.length === before && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
        return runBodies.length > before ? runBodies[runBodies.length - 1] : null;
      };
      const auto = await send(null);
      const freeOnly = await send('tier0_only');
      return {
        autoKeys: auto ? Object.keys(auto.user_paid_keys ?? {}).sort() : null,
        autoValues: auto ? Object.values(auto.user_paid_keys ?? {}) : [],
        freeKeys: freeOnly ? Object.keys(freeOnly.user_paid_keys ?? {}).sort() : null,
      };
    } finally {
      await browser.close();
    }
  } finally {
    stop();
    await new Promise((r) => setTimeout(r, 1500)); // let the port clear before the next build serves
  }
}

try {
  const off = await walk('flag off', false);
  check('flag OFF (default): Auto reached the engine', off.autoKeys !== null, 'no /llm/complete request seen');
  check(
    'flag OFF (default): Auto sends every key in the vault, as before',
    JSON.stringify(off.autoKeys) === JSON.stringify([...PROVIDERS].sort()),
    `sent ${JSON.stringify(off.autoKeys)}`,
  );
  check('flag OFF: the values sent are the ones the person saved', off.autoValues.every((v) => String(v).startsWith('walk-fixture-')));
  check('flag OFF: Free only sends no keys', JSON.stringify(off.freeKeys) === '[]', `sent ${JSON.stringify(off.freeKeys)}`);

  const on = await walk('flag on', true);
  check('flag ON: Auto reached the engine', on.autoKeys !== null, 'no /llm/complete request seen');
  check(
    'flag ON: Auto sends only the keys the engine reads (openai, anthropic)',
    JSON.stringify(on.autoKeys) === JSON.stringify(['anthropic', 'openai']),
    `sent ${JSON.stringify(on.autoKeys)}`,
  );
  check('flag ON: Free only still sends no keys', JSON.stringify(on.freeKeys) === '[]', `sent ${JSON.stringify(on.freeKeys)}`);
} catch (e) {
  check('walk completed', false, String(e && e.message ? e.message : e).split('\n')[0]);
} finally {
  engine.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length === 0 ? 0 : 1);
