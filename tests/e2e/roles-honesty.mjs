/**
 * Role ceilings: does the UI ever assert a boundary it did not read?
 *
 * WHAT THIS GUARDS. A role name on a grant is one of three things, and two of them constrain
 * nothing:
 *
 *   RECOGNIZED   a ceiling the mint path applied
 *   LABEL_ONLY   free text, stored for humans, bounds nothing
 *   NOT_CHECKED  the catalog was unreachable, so which of the two above this is CANNOT be said
 *
 * Before this suite, `app/grants/[principal]` rendered all three in one amber chip — the brand
 * accent, which on this site drives calls to action. `cfo` and "Researcher / Data" were
 * pixel-identical, so the screen asserted an authorization boundary for a string nobody had
 * checked against anything.
 *
 * THE LOAD-BEARING SCENARIO IS THE THIRD ONE. Collapsing NOT_CHECKED into LABEL_ONLY is the
 * tempting bug: both mean "no ceiling was applied here", so rendering them the same looks like
 * a simplification. It is not. LABEL_ONLY asserts the backend does not recognise the name —
 * that is a measurement, and it is exactly what an unreachable catalog failed to make.
 * Claiming it anyway invents the reassuring half of an answer nobody got, on the screen a
 * founder uses to decide what can spend their money.
 *
 * Equally: the roles page must show NOTHING when the catalog is down. A hardcoded fallback
 * table would render identically whether or not the mint path still agreed with it.
 *
 * NOT WIRED INTO GATING CI, for the same reason as its sibling suites — it needs a browser and
 * a dev server. Run it on demand:
 *
 *     npm run test:roles-honesty
 *
 * It drives a STUBBED backend: it proves the pages tell the truth about a known response
 * shape, never that production returns that shape.
 */

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { chromiumExecutablePath, LAUNCH_ARGS } from './chromium-path.mjs';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('NOT_CHECKED: this suite needs Playwright, which this package does not depend on.');
  console.error('  npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

const ENGINE_PORT = 4601;
const APP_PORT = 3102;
const PRINCIPAL = 'agent-grantor-roles';

// The catalog exactly as repid-engine's GET /api/v1/grants/roles serves it — same field names,
// same empty-array ceilings for cto/cmo. A stub with a convenient shape proves the test passes,
// not that the product works.
const CATALOG = {
  roles: [
    { name: 'ceo', label: 'PAI (CEO)', ceiling: ['pay:*'], rationale: 'delegating budget is this role\'s actual function' },
    { name: 'cfo', label: 'CFO', ceiling: ['pay:*'], rationale: 'the money role' },
    { name: 'cto', label: 'CTO', ceiling: [], rationale: 'NO SPEND, EVER.' },
    { name: 'cmo', label: 'CMO', ceiling: [], rationale: 'NO SPEND, EVER.' },
  ],
  recognized: ['ceo', 'cto', 'cfo', 'cmo'],
  note: 'A role is a ceiling, never a grant.',
};

let catalogMode = 'ok'; // 'ok' | 'down'

function grant(id, role) {
  const now = Date.now();
  return {
    id,
    grantor_agent_id: PRINCIPAL,
    grantee_agent_id: `grantee-of-${id}`,
    parent_grant_id: null,
    depth: 0,
    grant_class: 'cold',
    capabilities: ['read:activity'],
    caveats: [],
    role,
    audit_for: null,
    not_before: new Date(now - 3600_000).toISOString(),
    expires_at: new Date(now + 3600_000).toISOString(),
    revoked_at: null,
    revoked_by: null,
    mint_reason: 'e2e fixture',
    created_at: new Date(now - 3600_000).toISOString(),
    idempotency_key: null,
    grantor_signature: null,
    grantor_wallet_address_used: null,
    signature_status: 'NOT_CHECKED',
    live: true,
    liveReason: 'within window, not revoked',
  };
}

const engine = createServer((req, res) => {
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
  };
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    return res.end();
  }
  const json = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json', ...cors });
    res.end(JSON.stringify(body));
  };

  if (req.url.startsWith('/api/v1/grants/roles')) {
    if (catalogMode === 'down') return json(503, { error: 'unavailable' });
    return json(200, CATALOG);
  }
  if (req.url.startsWith('/api/v1/grants?')) {
    return json(200, { grants: [grant('11111111-1111-4111-8111-111111111111', 'cfo'), grant('22222222-2222-4222-8222-222222222222', 'Researcher / Data')] });
  }
  return json(404, { error: 'not found' });
});

const results = [];
const check = (name, pass, note = '') => {
  results.push({ name, pass, note });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${note ? ` — ${note}` : ''}`);
};

async function waitForApp(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

engine.listen(ENGINE_PORT);

// BUILD HERE, NOT BEFORE. `next build` INLINES NEXT_PUBLIC_* by static analysis, so the engine
// URL has to be set for the build and not only for the server process. The first run of this
// suite was pointed at a bundle built without it: eight assertions failed because every fetch
// went to the empty string, and the natural reading of that output is "the pages are broken".
// They were not — the probe was. Its siblings build in-suite for exactly this reason.
//
// It also means the bundle under test is the one that ships, which is the stronger claim.
const buildEnv = { ...process.env, NEXT_PUBLIC_REPID_ENGINE_URL: `http://127.0.0.1:${ENGINE_PORT}` };
const build = spawn('npx', ['next', 'build'], { env: buildEnv, stdio: 'ignore' });
const buildCode = await new Promise((r) => build.on('exit', r));
if (buildCode !== 0) {
  console.error(`FATAL: next build exited ${buildCode}`);
  engine.close();
  process.exit(1);
}

// Refuse to run against a server this process did not start — `npx next start` + `.kill()`
// orphans the `next-server` child, which then holds the port and serves a FROZEN build to every
// later run. A suite that cannot fail also reports safety. Occupied port => 2 (NOT_CHECKED).
let portBusy = false;
try {
  portBusy = !!(await fetch(`http://127.0.0.1:${APP_PORT}/`, { signal: AbortSignal.timeout(2000) }));
} catch { /* nothing listening — the state we want */ }
if (portBusy) {
  console.error(`NOT_CHECKED: port ${APP_PORT} is already serving. This suite refuses to test a`);
  console.error('  server it did not start — it would silently assert against a stale build.');
  console.error('  Clear it first:  pkill -f next-server');
  engine.close();
  process.exit(2);
}

// `detached` puts the server in its own process GROUP so the whole tree dies with killApp().
const app = spawn('npx', ['next', 'start', '--port', String(APP_PORT)], {
  env: buildEnv,
  stdio: 'ignore',
  detached: true,
});
const killApp = () => { try { process.kill(-app.pid, 'SIGKILL'); } catch { try { app.kill('SIGKILL'); } catch {} } };
process.on('exit', killApp);

let browser;
try {
  if (!(await waitForApp(`http://127.0.0.1:${APP_PORT}/grants`))) {
    console.error('FATAL: the app never became ready');
    process.exit(1);
  }

  browser = await chromium.launch({ executablePath: chromiumExecutablePath(), args: LAUNCH_ARGS });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });

  // ---------------------------------------------------------------- 1. catalog reachable
  catalogMode = 'ok';
  await page.goto(`http://127.0.0.1:${APP_PORT}/grants/roles`, { waitUntil: 'domcontentloaded' });
  const rolesBody = await page.locator('body').innerText();

  check('roles page names all four roles', ['PAI (CEO)', 'CFO', 'CTO', 'CMO'].every((r) => rolesBody.includes(r)));
  check('roles page marks the catalog MEASURED', /Measured/i.test(rolesBody));
  check(
    'roles page states the no-spend guarantee for the roles whose ceiling is empty',
    (rolesBody.match(/Cannot carry spend authority, ever/g) || []).length === 2,
    `${(rolesBody.match(/Cannot carry spend authority, ever/g) || []).length} occurrences (expected 2: CTO, CMO)`
  );
  check('roles page shows the intersection rule, not just prose', rolesBody.includes('effective = requested'));

  if (process.env.SHOT_DIR) {
    await page.screenshot({ path: `${process.env.SHOT_DIR}/roles-measured.png`, fullPage: true });
  }

  // ---------------------------------------------------------------- 2. catalog unreachable
  catalogMode = 'down';
  await page.goto(`http://127.0.0.1:${APP_PORT}/grants/roles`, { waitUntil: 'domcontentloaded' });
  const downBody = await page.locator('body').innerText();

  check('unreachable catalog renders NOT_CHECKED', /Not checked/i.test(downBody));
  check(
    'THE LOAD-BEARING ONE: no ceiling table is shown from a local copy',
    !downBody.includes('PAI (CEO)') && !downBody.includes('Cannot carry spend authority'),
    'a hardcoded fallback would render identically whether or not the mint path agreed with it'
  );
  check('unreachable catalog says what is absent, not just that something failed', /unreachable/i.test(downBody));

  if (process.env.SHOT_DIR) {
    await page.screenshot({ path: `${process.env.SHOT_DIR}/roles-not-checked.png`, fullPage: true });
  }

  // ---------------------------------------------------------------- 3. grant listing, catalog up
  catalogMode = 'ok';
  await page.goto(`http://127.0.0.1:${APP_PORT}/grants/${PRINCIPAL}`, { waitUntil: 'domcontentloaded' });
  const listBody = await page.locator('body').innerText();

  check('a recognised role names the ceiling that was applied', /role cfo: ceiling pay:\*/.test(listBody));
  check(
    'a free-text role says out loud that it constrains nothing',
    /role "Researcher \/ Data" is a human label/.test(listBody) && /constrains nothing/.test(listBody)
  );
  check('a free-text role is chipped as "label only"', listBody.includes('label only'));
  check('a recognised role is NOT chipped as "label only"', !/cfo · label only/.test(listBody));

  if (process.env.SHOT_DIR) {
    await page.screenshot({ path: `${process.env.SHOT_DIR}/grants-roles-differentiated.png`, fullPage: true });
  }

  // ------------------------------------------- 4. grant listing, catalog down: THE COLLAPSE
  catalogMode = 'down';
  await page.goto(`http://127.0.0.1:${APP_PORT}/grants/${PRINCIPAL}`, { waitUntil: 'domcontentloaded' });
  const listDown = await page.locator('body').innerText();

  check(
    'grants still list when the catalog is down — one read failing does not take the page down',
    listDown.includes('grantee-of-11111111-1111-4111-8111-111111111111')
  );
  check(
    'THE LOAD-BEARING ONE: an unreadable catalog degrades every role to NOT CHECKED',
    listDown.includes('cfo · not checked') && listDown.includes('Researcher / Data · not checked')
  );
  check(
    'and it does NOT claim the free-text role constrains nothing — nobody measured that',
    !/is a human label/.test(listDown),
    'LABEL_ONLY asserts the backend does not recognise the name; a failed fetch never established it'
  );
  check(
    'nor does it claim the recognised role applied a ceiling',
    !/ceiling pay:\*/.test(listDown)
  );

  if (process.env.SHOT_DIR) {
    await page.screenshot({ path: `${process.env.SHOT_DIR}/grants-roles-not-checked.png`, fullPage: true });
  }
} finally {
  if (browser) await browser.close();
  killApp();
  engine.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
