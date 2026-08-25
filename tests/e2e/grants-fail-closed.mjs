/**
 * Grants surface: does it fail CLOSED, and does it hit the real contract?
 *
 * WHY THIS EXISTS. `app/grants/[principal]/page.tsx` distinguishes "the service is
 * unreachable" from "this principal has no grants". Those two render completely differently
 * on purpose — showing "No grants issued or received yet" when the truth is "we could not
 * check" tells a founder that nothing can act on their behalf when something might. That is
 * the two-outcome collapse this codebase exists to prevent, wearing an empty state.
 *
 * The distinction is one `if` in a server component. Nothing guarded it until this file: a
 * later refactor that treats a failed fetch as an empty list would pass typecheck, pass lint,
 * pass the build, and silently start lying.
 *
 * WHY A MOCK BACKEND AND NOT `page.route()`. That page is a SERVER component
 * (`export const dynamic = 'force-dynamic'`), so its list fetch happens inside Next, never in
 * the browser — Playwright's request interception cannot see it. Intercepting in the browser
 * would test the revoke button (a client component) while silently missing the fail-closed
 * path, which is the one that matters most. So this drives a real HTTP server that BOTH the
 * server-side list fetch and the client-side revoke fetch resolve against, and it is that
 * server, not a stub inside the page, that returns 503 / 403.
 *
 * NOT WIRED INTO GATING CI, deliberately, following the reasoning already written into
 * `.github/workflows/check.yml`: it needs a browser and a dev server, and a gate that goes
 * red for environmental reasons gets ignored within a week. Run it on demand:
 *
 *     npm run test:grants-fail-closed
 *
 * Requires a Chromium. Elsewhere, `npx playwright install chromium` is enough — the binary is
 * resolved per-environment by ./chromium-path.mjs, which explains why a path that is REQUIRED
 * in an agent sandbox must not be used in CI, and vice versa. Override with PLAYWRIGHT_CHROMIUM.
 */

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { chromiumExecutablePath, LAUNCH_ARGS } from './chromium-path.mjs';

// Playwright is deliberately NOT a dependency of this package. CI does not run this suite
// (see the header), so declaring it would install a browser driver on every pull request for
// zero gating benefit — against this package's stated dependency diet. It is imported
// dynamically so its absence exits 2 = NOT_CHECKED, the ecosystem's code for "we did not
// look", rather than a module-not-found stack trace that reads like a product failure.
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('NOT_CHECKED: this suite needs Playwright, which this package does not depend on.');
  console.error('  npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

const ENGINE_PORT = 4599;
const APP_PORT = 3100;
const GRANTOR = 'agent-grantor-001';
const GRANTEE = 'agent-grantee-002';
const GRANT_ID = '7cca48d4-b9fd-4f0a-9468-1dca180f4a38';

// --- the mock engine --------------------------------------------------------
// One mutable mode, flipped by the test between scenarios. Deliberately returns the REAL
// response shape (lib/repid-engine.ts `ListedGrant`) — a mock that returns a convenient shape
// proves the test passes, not that the product works.

let mode = 'ok';
const hits = [];

function liveGrant() {
  const now = Date.now();
  return {
    id: GRANT_ID,
    grantor_agent_id: GRANTOR,
    grantee_agent_id: GRANTEE,
    parent_grant_id: null,
    depth: 0,
    grant_class: 'cold',
    capabilities: ['read:activity'],
    caveats: [{ type: 'maxCalls', limit: 10 }],
    role: null,
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
  hits.push(`${req.method} ${req.url}`);

  // CORS, because the browser genuinely needs it here. The app is served from :3100 and this
  // engine answers on :4599, so the revoke POST is cross-origin, and a JSON body makes it a
  // non-simple request — the browser sends an OPTIONS preflight first. Without these headers
  // it fails as net::ERR_FAILED, surfacing in the page as a bare "Failed to fetch" that names
  // neither the URL nor the cause, and looking for all the world like a broken revoke button.
  // The real engine allowlists trustshell.dev the same way (see its cors middleware); this
  // mirrors that rather than inventing a laxer contract than production has.
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

  if (req.url.startsWith('/api/v1/grants?')) {
    if (mode === 'list_503') return json(503, { error: 'unavailable' });
    return json(200, { grants: [liveGrant()] });
  }
  if (req.method === 'POST' && req.url.includes('/revoke')) {
    if (mode === 'revoke_403') {
      return json(403, { error: 'only the grantor of this grant may revoke it' });
    }
    return json(200, { ok: true });
  }
  return json(404, { error: 'not found' });
});

// --- harness ----------------------------------------------------------------

const results = [];
const check = (name, pass, note = '') => {
  results.push({ name, pass, note });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${note ? ` — ${note}` : ''}`);
};

/**
 * Click Revoke and get to the confirm step.
 *
 * The retry is not defensive padding — it is the hydration race, and it is real. This page is
 * server-rendered, so the Revoke button EXISTS in the HTML before React has attached its
 * handler. A click landing in that window does nothing at all, silently. Scenarios that only
 * read the DOM never notice; scenarios that interact fail with a timeout that looks like a
 * product bug and isn't. Retrying once, and only after the confirm step genuinely fails to
 * appear, distinguishes "not hydrated yet" from "the button is broken" instead of hiding both.
 */
async function openConfirm(page) {
  const revoke = page.getByRole('button', { name: /^revoke$/i }).first();
  const confirm = page.getByRole('button', { name: /^confirm$/i });
  await revoke.click();
  try {
    await confirm.waitFor({ state: 'visible', timeout: 4000 });
  } catch {
    await revoke.click();
    await confirm.waitFor({ state: 'visible', timeout: 10_000 });
  }
  return confirm;
}

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

await new Promise((r) => engine.listen(ENGINE_PORT, r));

// PRODUCTION BUILD, NOT `next dev` — and this is load-bearing, not a preference.
//
// Under `next dev` the client never finishes hydrating in a sandboxed environment: Next opens
// an HMR WebSocket, an egress-restricted network refuses the upgrade
// (`ERR_INVALID_HTTP_RESPONSE`), and React's handlers are never attached. The markup renders
// perfectly, every DOM assertion passes, and every CLICK silently does nothing — which reads
// exactly like a broken button and is not one. Diagnosing that cost a round; leaving a `dev`
// harness in place would cost it again for whoever runs this next.
//
// `next build` also inlines NEXT_PUBLIC_* at build time, so the engine URL must be set HERE,
// not just on the server process. And the bundle this exercises is the one that actually
// ships, which is the stronger thing to be asserting against anyway.
const buildEnv = {
  ...process.env,
  NEXT_PUBLIC_REPID_ENGINE_URL: `http://127.0.0.1:${ENGINE_PORT}`,
};

const build = spawn('npx', ['next', 'build'], { env: buildEnv, stdio: 'ignore' });
const buildCode = await new Promise((r) => build.on('exit', r));
if (buildCode !== 0) {
  console.error(`FATAL: next build exited ${buildCode}`);
  engine.close();
  process.exit(1);
}

const app = spawn('npx', ['next', 'start', '--port', String(APP_PORT)], {
  env: buildEnv,
  stdio: 'ignore',
});

const base = `http://127.0.0.1:${APP_PORT}`;
if (!(await waitForApp(`${base}/grants`))) {
  console.error('FATAL: dev server never became ready');
  app.kill();
  engine.close();
  process.exit(1);
}

// Both the executable path and `--no-proxy-server` are environment questions, and the
// reasoning for each now lives in ./chromium-path.mjs — including why the sandbox needs an
// explicit path that must NOT be used in CI, which is what broke this suite's first real run.
const browser = await chromium.launch({
  executablePath: chromiumExecutablePath(),
  args: LAUNCH_ARGS,
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
// Diagnostics that stay: a browser-side fetch that dies at the network layer reports only
// "Failed to fetch" in page errors, which names neither the URL nor the cause. This does.
page.on('requestfailed', (r) => {
  console.log(`  [requestfailed] ${r.method()} ${r.url()} :: ${r.failure()?.errorText}`);
});

try {
  // --- Scenario A: the service answers. Grants render, revoke is offered to the grantor.
  mode = 'ok';
  hits.length = 0;
  await page.goto(`${base}/grants/${GRANTOR}`, { waitUntil: 'networkidle' });
  let body = await page.locator('body').innerText();

  check('list 200 — the real list endpoint was called', hits.some((h) => h.includes('/api/v1/grants?')));
  check('list 200 — the grant renders', body.includes(GRANTEE));
  check(
    'list 200 — revoke is offered to the grantor',
    (await page.getByRole('button', { name: /^revoke$/i }).count()) > 0,
  );

  // --- Scenario B: THE fail-closed case. Unreachable must not read as "nothing here".
  mode = 'list_503';
  await page.goto(`${base}/grants/${GRANTOR}`, { waitUntil: 'networkidle' });
  body = await page.locator('body').innerText();

  check('list 503 — says the service is unreachable', /unreachable/i.test(body));
  check(
    'list 503 — does NOT claim there are no grants',
    !/no grants issued or received/i.test(body),
    'an empty state here would assert "nothing can act for you" when the truth is "we could not check"',
  );
  check('list 503 — offers no revoke control over unknown state',
    (await page.getByRole('button', { name: /^revoke$/i }).count()) === 0);

  // --- Scenario C: revoke succeeds, and we prove it hit the real endpoint.
  mode = 'ok';
  await page.goto(`${base}/grants/${GRANTOR}`, { waitUntil: 'networkidle' });
  try {
    const confirm = await openConfirm(page);
    const revokeOk = page.waitForResponse(
      (r) => r.url().includes('/api/v1/grants/') && r.url().includes('/revoke') && r.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await confirm.click();
    const okRes = await revokeOk;
    check('revoke 200 — POST reached /api/v1/grants/:id/revoke', okRes.status() === 200, `status ${okRes.status()}`);
  } catch (e) {
    check('revoke 200 — POST reached /api/v1/grants/:id/revoke', false, e.message.split('\n')[0]);
  }

  // --- Scenario D: revoke refused. The refusal must be visible, never swallowed.
  mode = 'revoke_403';
  await page.goto(`${base}/grants/${GRANTOR}`, { waitUntil: 'networkidle' });
  try {
    const confirm = await openConfirm(page);
    const revokeDenied = page.waitForResponse(
      (r) => r.url().includes('/revoke') && r.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await confirm.click();
    const deniedRes = await revokeDenied;
    await page.waitForTimeout(800);
    body = await page.locator('body').innerText();

    check('revoke 403 — backend refused', deniedRes.status() === 403, `status ${deniedRes.status()}`);
    check(
      'revoke 403 — the refusal is shown, not swallowed',
      /only the grantor|may revoke|retry/i.test(body),
      'a refused revoke that renders as success is the worst possible lie on this surface',
    );
  } catch (e) {
    check('revoke 403 — refusal surfaced', false, e.message.split('\n')[0]);
  }

  check('no runtime errors across all scenarios', pageErrors.length === 0, pageErrors.join('; '));
} finally {
  await browser.close();
  app.kill();
  engine.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length === 0 ? 0 : 1);
