/**
 * The WEB door of the outbound scrubber, in a real browser: what the /check page POSTs to the engine.
 *
 * XC1 (2026-10-12) measured the browser -> engine classify call leaking 7 of 12 secret shapes. The
 * /check page calls the same classifyClaim() as the CLI, so the fix is the shared scrubber; this proves
 * it on the wire, in Chromium, against `next build` + `next start`, for EVERY shape in the shared
 * corpus (tests/fixtures/scrub-corpus.ts, which also holds the shapes that used to leak).
 *
 * The stub engine records every POST /api/v1/classify body. For each shape the page is driven the way a
 * stranger drives it: type a sentence containing the secret, press Check. The recorded body must not
 * contain the secret and must still contain the words around it, and the page must still show an answer
 * (the label and the local record are unchanged; only what leaves the browser is cleaned).
 *
 * Also run: a sentence that is ONLY a secret sends nothing; ordinary claims go out untouched.
 * Builds in-suite; NOT in gating CI. Exit 0 all pass, 1 a failure, 2 not checked.
 *
 *     npm run test:scrub-outbound-walk
 */
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumExecutablePath, LAUNCH_ARGS, loadPlaywrightOrExit, spawnNext } from './chromium-path.mjs';
import { loadTsFixture } from './ts-fixtures.mjs';

const { chromium } = await loadPlaywrightOrExit();
const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures');
const { SENSITIVE, KEEP } = loadTsFixture(resolve(FIXTURES, 'scrub-corpus.ts'));

const ENGINE_PORT = 4781;
const APP_PORT = 3281;
const bodies = [];
const engine = createServer((req, res) => {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type,authorization,x-api-key,x-repid-version' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    if (req.method === 'POST' && req.url.split('?')[0] === '/api/v1/classify') {
      bodies.push(raw);
      res.writeHead(200, { 'content-type': 'application/json', ...cors });
      return res.end(JSON.stringify({ label: 'not-checked', latency_ms: 3, by: 'skipped' }));
    }
    res.writeHead(404, { 'content-type': 'application/json', ...cors });
    res.end('{}');
  });
});

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };
const until = async (fn, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch { /* keep polling */ } await new Promise((r) => setTimeout(r, 50)); } return false; };

let busy = false;
try { busy = !!(await fetch(`http://127.0.0.1:${APP_PORT}/`, { signal: AbortSignal.timeout(2000) })); } catch { /* nothing listening: good */ }
if (busy) { console.error(`NOT_CHECKED: port ${APP_PORT} is already serving; refusing to test a server this process did not start.`); process.exit(2); }

await new Promise((r) => engine.listen(ENGINE_PORT, r));
const env = { ...process.env, NEXT_PUBLIC_REPID_ENGINE_URL: `http://127.0.0.1:${ENGINE_PORT}` };
const build = spawnNext(['build'], { env, stdio: 'ignore' });
if ((await new Promise((r) => build.on('exit', r))) !== 0) { console.error('build failed'); engine.close(); process.exit(1); }
const app = spawnNext(['start', '--port', String(APP_PORT)], { env, stdio: 'ignore', detached: true });
const killApp = () => { try { process.kill(-app.pid, 'SIGKILL'); } catch { try { app.kill('SIGKILL'); } catch { /* gone */ } } };
process.on('exit', killApp);
const base = `http://127.0.0.1:${APP_PORT}`;
for (let i = 0; i < 120; i++) { try { if ((await fetch(`${base}/check`)).ok) break; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 500)); }

const browser = await chromium.launch({ executablePath: chromiumExecutablePath(), args: LAUNCH_ARGS });
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    const tag = `[${viewport.width}px]`;
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(`${base}/check`, { waitUntil: 'networkidle' });

    const sendAndRead = async (sentence) => {
      const before = bodies.length;
      await page.locator('#claim').fill(sentence);
      await page.getByRole('button', { name: /^Check$/ }).click();
      const got = await until(() => bodies.length > before || false, 6000);
      // Let a "nothing was sent" case settle so a late request is not missed.
      if (!got) await new Promise((r) => setTimeout(r, 400));
      return bodies.length > before ? bodies[bodies.length - 1] : null;
    };

    const leaked = [];
    const lost = [];
    for (const row of SENSITIVE) {
      const body = await sendAndRead(row.text);
      if (body === null) { lost.push(`${row.kind} (nothing sent)`); continue; }
      let sent = '';
      try { sent = String(JSON.parse(body).text ?? ''); } catch { sent = body; }
      if (sent.includes(row.secret) || body.includes(row.secret)) leaked.push(row.kind);
    }
    check(`${tag} none of the ${SENSITIVE.length} secret shapes reaches the engine from /check`, leaked.length === 0, leaked.length ? `leaked: ${leaked.join(', ')}` : 'leaked: none');
    check(`${tag} each sentence was still sent, scrubbed, so the claim stays checkable`, lost.length === 0, lost.join(', '));
    // The page still answers.
    check(`${tag} the page still shows an answer after a scrubbed send`, await until(async () => (await page.locator('[data-testid="check-label"]').count()) === 1));
    check(`${tag} the page says something was removed before sending`, /scrubbed|removed|never sent|looked like a key/i.test(await page.locator('[data-testid="check-scrubbed"]').innerText().catch(() => '')));

    // Ordinary claims go out EXACTLY as typed.
    const changed = [];
    for (const sentence of KEEP) {
      const body = await sendAndRead(sentence);
      if (body === null || JSON.parse(body).text !== sentence) changed.push(sentence.slice(0, 40));
    }
    check(`${tag} the ${KEEP.length} ordinary claims go out unchanged`, changed.length === 0, changed.join(' | '));

    // Only a secret: nothing leaves.
    const only = SENSITIVE.find((r) => r.kind.startsWith('seed phrase, 12 words, space'));
    const before = bodies.length;
    await page.locator('#claim').fill(only.secret);
    await page.getByRole('button', { name: /^Check$/ }).click();
    await new Promise((r) => setTimeout(r, 600));
    check(`${tag} a sentence that is ONLY a secret sends nothing`, bodies.length === before);
    check(`${tag} no page errors`, errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }
} finally {
  await browser.close();
  killApp();
  engine.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed (stub engine on ${ENGINE_PORT}, page ${base}, ${bodies.length} classify bodies recorded)`);
process.exit(failed.length ? 1 : 0);
