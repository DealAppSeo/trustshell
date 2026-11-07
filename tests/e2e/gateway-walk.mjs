/**
 * trustshell.dev/gateway, driven in a real browser: the parts only a browser can prove.
 *
 *   - Loading the page makes no request to any other host (the cases' sources are links, not fetches).
 *   - Copy puts exactly the Inspect command and a parseable MCP setup on the clipboard.
 *   - Every stage of the ramp the page links to (/agents → /leaderboard) is served.
 *   - The join form posts { email, source, metadata: { note } } to trustshell_v15_waitlist and to
 *     nothing else (never `waitlist`, whose trigger mails a TrustTrader promotion), says "Saved"
 *     only on a 201, and "Not saved" on a refusal (PostgREST PGRST205 here) or a dropped request.
 *   - Nothing scrolls sideways at 375 px.
 *
 * The Supabase origin is a stub: the build is given NEXT_PUBLIC_SUPABASE_URL=https://stub-supabase.invalid
 * and a fake publishable key, and every request to it is answered by page.route. No row is written
 * anywhere. NOT in gating CI (it needs a browser and a server), like its siblings.
 *
 *     npm run test:gateway-walk                                  # builds, serves on :3131, walks
 *     npm run test:gateway-walk -- --base=http://localhost:3131  # walks a server you already run
 *
 * With --base, the server must have been built with the stub URL above, or the form checks fail.
 * Exit: 0 every check passed · 1 any failed · 2 NOT_CHECKED (no browser, port busy, app never up).
 */
import { chromiumExecutablePath, LAUNCH_ARGS, loadPlaywrightOrExit, spawnNext } from './chromium-path.mjs';

const { chromium } = await loadPlaywrightOrExit();
const BASE_ARG = process.argv.find((a) => a.startsWith('--base='));
const PORT = 3131;
const BASE = (BASE_ARG ? BASE_ARG.slice('--base='.length) : `http://127.0.0.1:${PORT}`).replace(/\/+$/, '');
const STUB = 'https://stub-supabase.invalid';
const INSPECT =
  'npx @hyperdag/trustshell@latest check https://github.com/OWNER/REPO/actions/runs/1234567890 --claims-file claims.txt';
const RAMP = ['/agents', '/bind', '/faucet', '/stake', '/spend', '/leaderboard'];

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  ${detail}`}`);
};

let killApp = () => {};
if (!BASE_ARG) {
  try {
    await fetch(`${BASE}/`, { signal: AbortSignal.timeout(2000) });
    console.error(`NOT_CHECKED: port ${PORT} is already serving; this suite tests only a server it started (or pass --base=).`);
    process.exit(2);
  } catch { /* free: the state we want */ }
  const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: STUB, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_e2e_stub' };
  const build = spawnNext(['build'], { stdio: 'ignore', env });
  if ((await new Promise((r) => build.on('exit', r))) !== 0) {
    console.error('FATAL: next build failed');
    process.exit(1);
  }
  const app = spawnNext(['start', '--port', String(PORT)], { stdio: 'ignore', detached: true, env });
  killApp = () => { try { process.kill(-app.pid, 'SIGKILL'); } catch { try { app.kill('SIGKILL'); } catch {} } };
  process.on('exit', killApp);
}

async function up(url, ms = 180_000) {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 500))) {
    try { if ((await fetch(url)).ok) return true; } catch { /* not yet */ }
  }
  return false;
}
if (!(await up(`${BASE}/gateway`))) {
  console.error('NOT_CHECKED: the app never became ready');
  process.exit(2);
}

const browser = await chromium.launch({ executablePath: chromiumExecutablePath(), args: LAUNCH_ARGS });
try {
  const desk = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await desk.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE).origin });
  const page = await desk.newPage();

  // Every request the page makes, and every write the form attempts.
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  const posts = [];
  let answer = 'created';
  await page.route(`${STUB}/**`, async (route) => {
    const req = route.request();
    posts.push({ url: req.url(), method: req.method(), body: req.postData() });
    if (answer === 'abort') return route.abort('failed');
    if (answer === 'missing') {
      return route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'PGRST205', message: "Could not find the table 'public.trustshell_v15_waitlist' in the schema cache" }),
      });
    }
    return route.fulfill({ status: 201, body: '' });
  });

  const res = await page.goto(`${BASE}/gateway`, { waitUntil: 'networkidle' });
  check('the page is served', res?.status() === 200, String(res?.status()));
  check('the headline says AI is not yet trustworthy', (await page.locator('h1').innerText()).includes('It is not yet trustworthy.'));
  const origin = new URL(BASE).origin;
  const foreign = requests.filter((u) => !u.startsWith(origin) && !u.startsWith('data:'));
  check('loading the page asks no other host for anything', foreign.length === 0, foreign.join(', '));

  const cases = page.locator('[data-testid=incident]');
  check('seven cases are shown', (await cases.count()) === 7, String(await cases.count()));
  const sources = await cases.locator('a').evaluateAll((as) => as.map((a) => a.href));
  check('every case links an https source', sources.length === 7 && sources.every((h) => h.startsWith('https://')), sources.join(' '));

  // The OS clipboard may store CRLF (Windows does); the page writes LF. Compare text, not platform.
  const clip = async () => (await page.evaluate(() => navigator.clipboard.readText())).split(String.fromCharCode(13)).join('');
  await page.getByRole('button', { name: 'Copy the Inspect command' }).click();
  check('copy: the Inspect command lands on the clipboard exactly', (await clip()) === INSPECT, JSON.stringify(await clip()));
  await page.getByRole('button', { name: 'Copy the MCP setup' }).click();
  let mcp = null;
  try { mcp = JSON.parse(await clip()); } catch { /* reported below */ }
  check(
    'copy: the MCP setup is JSON that runs trustshell-mcp from the package',
    mcp?.mcpServers?.trustshell?.command === 'npx' && mcp.mcpServers.trustshell.args.includes('trustshell-mcp'),
    JSON.stringify(mcp),
  );

  const rampHrefs = await page.locator('nav[aria-label="Where you are in the journey"] a').evaluateAll((as) => as.map((a) => new URL(a.href).pathname));
  check('the ramp links every stage, Create to Earn', JSON.stringify(rampHrefs) === JSON.stringify(RAMP), rampHrefs.join(' '));
  for (const p of RAMP) {
    const r = await page.request.get(`${BASE}${p}`);
    check(`ramp: ${p} is served`, r.status() === 200, String(r.status()));
  }

  // --- the join form
  const email = page.locator('#join-email');
  const note = page.locator('#join-note');
  const submit = page.getByRole('button', { name: 'Count me in' });

  answer = 'missing';
  await email.fill('walker@example.com');
  await note.fill('Show me what it got wrong.');
  await submit.click();
  await page.locator('[data-testid=join-failed]').waitFor({ timeout: 10_000 }).catch(() => {});
  check('join: a refused insert reads Not saved, never Saved', (await page.locator('[data-testid=join-failed]').isVisible()) && !(await page.locator('[data-testid=join-saved]').count()));

  answer = 'abort';
  await submit.click();
  await page.waitForTimeout(1500);
  check('join: a request that never arrives reads Not saved', (await page.locator('[data-testid=join-failed]').isVisible()) && !(await page.locator('[data-testid=join-saved]').count()));

  answer = 'created';
  await submit.click();
  await page.locator('[data-testid=join-saved]').waitFor({ timeout: 10_000 }).catch(() => {});
  check('join: a 201 reads Saved', await page.locator('[data-testid=join-saved]').isVisible());

  const writes = posts.filter((p) => p.method === 'POST');
  check('join: every write goes to trustshell_v15_waitlist and none to waitlist', writes.length >= 2 && writes.every((w) => new URL(w.url).pathname === '/rest/v1/trustshell_v15_waitlist'), writes.map((w) => w.url).join(' '));
  let row = null;
  try { row = JSON.parse(writes.at(-1)?.body ?? 'null'); } catch { /* reported below */ }
  const one = Array.isArray(row) ? row[0] : row;
  check(
    'join: the row is the email, the source and the note, nothing else',
    one && JSON.stringify(Object.keys(one).sort()) === '["email","metadata","source"]' && one.email === 'walker@example.com' && JSON.stringify(one.metadata) === '{"note":"Show me what it got wrong."}' && one.source === 'trustshell.dev/gateway',
    JSON.stringify(row),
  );
  await desk.close();

  // --- phone
  const phone = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  const pp = await phone.newPage();
  await pp.goto(`${BASE}/gateway`, { waitUntil: 'networkidle' });
  check('phone: nothing scrolls sideways', await pp.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  check('phone: the headline is above the fold', ((await pp.locator('h1').boundingBox())?.y ?? 9999) < 812);
  await phone.close();
} finally {
  await browser.close();
  killApp();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
