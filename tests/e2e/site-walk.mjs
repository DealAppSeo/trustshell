/**
 * trustshell.dev site walk: every page route, at a phone width and a desktop width, with no wallet, no key
 * and no stored state. The repeatable form of "open every page and see whether it is broken".
 *
 * WHAT FAILS THE RUN (exit 1), per route × width:
 *   - the page does not answer 200, or renders a framework error / crash screen
 *   - a console error, an uncaught page error, a failed request, or any response >= 400
 *   - the page scrolls sideways (documentElement wider than the viewport); the widest offenders are named
 *   - a "Loading…" / spinner still on screen several seconds after the network went quiet
 *   - a visible Copy button that does not put anything on the clipboard
 *   - a `href="#"` placeholder, or an in-page `#anchor` with no element behind it
 *   - CLS > 0.25 or LCP > 4 s (the "poor" band of both Core Web Vitals)
 * AFTER THE WALK, once per unique link: every same-site link resolves (a 404 fails), every cross-page #anchor
 * exists on the page it points at, and every external link is fetched (404 / 410 / DNS failure fail; a 403 or
 * a timeout is only a note, because many sites refuse bots).
 * ALSO: every file under app/ that is a page is covered (a new dynamic route with no sample fails), every route
 * handler is probed, and every <loc> in /sitemap.xml is a route that answers.
 *
 * WARNINGS (printed, never fail): text that looks cut off by overflow:hidden, and "undefined" / "NaN" /
 * "[object Object]" in visible text.
 *
 *     npm run test:site-walk                                   # builds, serves on :3131, walks
 *     npm run test:site-walk -- --no-build                     # reuse the .next already built (it must be THIS tree's)
 *     node tests/e2e/site-walk.mjs --base=http://127.0.0.1:3188   # a server you already run: a dev box, a Vercel
 *                                                              #   preview URL, or https://www.trustshell.dev
 *     --only=/pai,/stake    only these paths        --jobs=3        parallel pages (default 3)
 *     --json=out.json       machine-readable result --shots=dir     full-page PNG per route × width
 *     --no-external         skip the external-link fetch (offline runs)
 *     --poke                also fill every input and click every button once (local or preview base only; never
 *                           production). Writes are blocked at the network layer, so a form that cannot save must show it.
 *
 * Exit: 0 clean · 1 any failure · 2 NOT_CHECKED (no browser, port busy, app never up).
 *
 * NOT stubbed, unlike its siblings: this talks to whatever backend the build points at (NEXT_PUBLIC_REPID_ENGINE_URL
 * in .env.production is the real engine), because the question is "does the site work as a stranger meets it".
 * A backend that is down therefore shows up here as failed requests, which is the point.
 */
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromiumExecutablePath, LAUNCH_ARGS, loadPlaywrightOrExit, spawnNext } from './chromium-path.mjs';

const { chromium } = await loadPlaywrightOrExit();
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const flag = (name) => process.argv.includes(`--${name}`);

const BASE_ARG = arg('base');
const PORT = 3131;
const BASE = (BASE_ARG ?? `http://127.0.0.1:${PORT}`).replace(/\/+$/, '');
const ORIGIN = new URL(BASE).origin;
// Git Bash rewrites a leading-slash argument into a Windows path (`--only=/pai` arrives mangled): run with MSYS_NO_PATHCONV=1, or pass them bare (`--only=pai,stake`).
const ONLY = arg('only')?.split(',').map((s) => s.trim().replace(/^\/?/, '/')).filter((s) => s.length > 1);
const JOBS = Math.max(1, Number(arg('jobs') ?? 3));
const SHOTS = arg('shots');
const JSON_OUT = arg('json');
const EXTERNAL = !flag('no-external');
const POKE = flag('poke');

const WIDTHS = [
  { name: 'phone', width: 375, height: 812 },
  { name: 'desktop', width: 1280, height: 800 },
];

/** Hosts that mean "this site". A link to https://www.trustshell.dev/x is walked against BASE, not production. */
const SELF_HOSTS = new Set([new URL(BASE).host, 'trustshell.dev', 'www.trustshell.dev']);

/**
 * Dynamic page routes need a value. A param that no record exists for is the point: this walk is a stranger with
 * no key, so the honest not-found / empty state is what has to work.
 */
const SAMPLES = {
  '/grants/[principal]': ['walk-unknown-principal'],
  '/passport/[agentId]': ['walk-unknown-agent'],
  '/run/[agentId]': ['walk-unknown-agent'],
};

/**
 * Route handlers (route.ts). Each is probed once. `b/[key]/[role]` is the unlisted belt page: with no key set it
 * must be a plain 404, which is its contract.
 */
const ENDPOINTS = [
  { path: '/api/version', status: [200] },
  { path: '/api/agent-leaderboard', status: [200] },
  { path: '/api/hal-providers', status: [200] },
  { path: '/b/walk/cmo', status: [404] },
  { path: '/robots.txt', status: [200] },
  { path: '/sitemap.xml', status: [200] },
  { path: '/opengraph-image', status: [200] },
  { path: '/favicon.ico', status: [200] },
  { path: '/llms.txt', status: [200] },
];
const HANDLER_ROUTES = ['/api/agent-leaderboard', '/api/hal-providers', '/api/version', '/b/[key]/[role]'];

/**
 * Known-and-accepted noise. Each entry says WHY, so it cannot quietly become a silencer. Empty is the goal.
 * { kind: 'console'|'http'|'requestfailed'|'pageerror', match: RegExp on the detail, route?: exact path, why }
 */
const EXPECTED = [
  // /settings "Look it up" asks the engine for an agent it has never seen (the walk types the all-zero UUID). 404 is the engine's
  // contract for that (lib/agent-repid.ts maps it to NOT_CHECKED "unregistered"); Chrome logs every 404 as a console error.
  { kind: 'http', route: '/settings', match: /^404 GET \S+\/api\/v1\/agents\/[0-9a-f-]{36}\/card/, why: 'unknown agent lookup, by design' },
];

const results = []; // { route, width, status, problems[], warnings[], perf, ... }
const log = (s = '') => console.log(s);

// ---------------------------------------------------------------------------------------------------------------
// 1. Routes
// ---------------------------------------------------------------------------------------------------------------
function discover() {
  const pages = [];
  const handlers = [];
  const walk = (dir, rel) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(dir, e.name), `${rel}/${e.name}`);
      else if (e.name === 'page.tsx') pages.push(rel || '/');
      else if (e.name === 'route.ts') handlers.push(rel);
    }
  };
  walk(join(process.cwd(), 'app'), '');
  return { pages: pages.sort(), handlers: handlers.sort() };
}

const PROBLEMS_BEFORE_WALK = [];
const { pages, handlers } = discover();
for (const h of handlers) {
  if (!HANDLER_ROUTES.includes(h)) PROBLEMS_BEFORE_WALK.push(`route handler ${h} is not covered by tests/e2e/site-walk.mjs (add it to ENDPOINTS and HANDLER_ROUTES)`);
}

/** Expand the discovered patterns into concrete paths. Sitemap entries fill in static params (/for/*). */
async function expandRoutes(sitemapPaths) {
  const out = [];
  for (const p of pages) {
    if (!p.includes('[')) { out.push(p); continue; }
    const re = new RegExp(`^${p.replace(/\[[^\]]+\]/g, '[^/]+')}$`);
    const fromSitemap = sitemapPaths.filter((s) => re.test(s));
    const samples = [...fromSitemap, ...(SAMPLES[p] ?? []).map((v) => p.replace(/\[[^\]]+\]/, v))];
    if (!samples.length) PROBLEMS_BEFORE_WALK.push(`dynamic route ${p} has no sample (add one to SAMPLES in tests/e2e/site-walk.mjs)`);
    out.push(...samples);
  }
  return [...new Set(out)];
}

// ---------------------------------------------------------------------------------------------------------------
// 2. The app under test
// ---------------------------------------------------------------------------------------------------------------
let killApp = () => {};
if (!BASE_ARG) {
  try {
    await fetch(`${BASE}/`, { signal: AbortSignal.timeout(2000) });
    console.error(`NOT_CHECKED: port ${PORT} is already serving; this suite tests only a server it started (or pass --base=).`);
    process.exit(2);
  } catch { /* free: the state we want */ }
  if (!flag('no-build')) {
    const build = spawnNext(['build'], { stdio: 'ignore' });
    if ((await new Promise((r) => build.on('exit', r))) !== 0) {
      console.error('FATAL: next build failed');
      process.exit(1);
    }
  } else if (!existsSync(join(process.cwd(), '.next', 'BUILD_ID'))) {
    console.error('NOT_CHECKED: --no-build, and there is no .next build in this tree');
    process.exit(2);
  }
  const app = spawnNext(['start', '--port', String(PORT)], { stdio: 'ignore', detached: true });
  killApp = () => { try { process.kill(-app.pid, 'SIGKILL'); } catch { try { app.kill('SIGKILL'); } catch {} } };
  process.on('exit', killApp);
}

async function up(url, ms = 120_000) {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 500))) {
    try { if ((await fetch(url)).status < 500) return true; } catch { /* not yet */ }
  }
  return false;
}
if (!(await up(`${BASE}/robots.txt`))) {
  console.error('NOT_CHECKED: the app never became ready');
  killApp();
  process.exit(2);
}

// ---------------------------------------------------------------------------------------------------------------
// 3. In-page probes (serialised into the page; no closures over module scope)
// ---------------------------------------------------------------------------------------------------------------
const PAGE_PROBE = () => {
  const vw = document.documentElement.clientWidth;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
  };
  const label = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}` : '';
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };
  const clipped = (el) => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const ox = getComputedStyle(a).overflowX;
      if (ox !== 'visible') { const r = a.getBoundingClientRect(); if (r.right <= vw + 1 && r.left >= -1) return true; }
    }
    return false;
  };

  // sideways scroll, and who causes it
  const overflowBy = document.documentElement.scrollWidth - vw;
  const offenders = [];
  if (overflowBy > 0) {
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= vw + 1 || !visible(el) || clipped(el)) continue;
      if (el.parentElement && el.parentElement !== document.body) {
        const pr = el.parentElement.getBoundingClientRect();
        if (pr.right > vw + 1 && !clipped(el.parentElement)) continue; // report the outermost
      }
      offenders.push(`${label(el)} right=${Math.round(r.right)} (${(el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)})`);
      if (offenders.length >= 5) break;
    }
  }

  // text cut off by overflow:hidden (a warning: truncation is sometimes the design)
  const cutoff = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (cutoff.length >= 5) break;
    const cs = getComputedStyle(el);
    if (cs.overflowX !== 'hidden' && cs.overflowX !== 'clip') continue;
    if (cs.textOverflow === 'ellipsis') continue;
    if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 8 && (el.textContent || '').trim() && visible(el)) cutoff.push(`${label(el)} ${el.scrollWidth}>${el.clientWidth}`);
  }

  // still-loading
  const LOADING = /^\s*(loading|checking|fetching|connecting|working|verifying|reading|running|saving|submitting|sending|registering|creating|waking|thinking|unlocking|testing)\b[^.!?]{0,40}(…|\.\.\.)\s*$/i;
  const loading = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (loading.length >= 3) break;
    if (el.children.length === 0 && LOADING.test(el.textContent || '') && visible(el)) loading.push((el.textContent || '').trim());
  }
  for (const el of document.querySelectorAll('[aria-busy="true"], [role="progressbar"], .animate-spin')) {
    if (visible(el) && loading.length < 3) loading.push(`spinner ${label(el)}`);
  }

  const text = document.body.innerText || '';
  const crash = text.match(/Application error|Unhandled Runtime Error|Internal Server Error|This page couldn.t load|Something went wrong|digest:/i)?.[0] ?? null;
  // code and pre are skipped: docs tables legitimately print `undefined` as an option's default
  const prose = document.body.cloneNode(true);
  prose.querySelectorAll('code, pre, script, style, noscript').forEach((e) => e.remove());
  const suspect = [...new Set((prose.textContent || '').match(/\bundefined\b|\bNaN\b|\[object Object\]/g) ?? [])];

  // links and anchors
  const ids = new Set([...document.querySelectorAll('[id]')].map((e) => e.id));
  const hrefs = new Set();
  const badAnchors = [];
  const placeholders = [];
  for (const a of document.querySelectorAll('a[href]')) {
    const raw = a.getAttribute('href') || '';
    if (raw === '#' || raw === '') { placeholders.push((a.textContent || '').trim().slice(0, 40) || label(a)); continue; }
    if (/^(mailto:|tel:|javascript:|data:|blob:)/i.test(raw)) continue;
    if (raw.startsWith('#')) {
      const id = decodeURIComponent(raw.slice(1));
      if (id && id !== 'top' && !ids.has(id) && !document.getElementsByName(id).length) badAnchors.push(raw);
      continue;
    }
    hrefs.add(a.href);
  }
  const copyButtons = [...document.querySelectorAll('button, [role="button"]')].filter((b) => /\bcopy\b/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '')) && visible(b) && !b.disabled).length;
  const forms = document.querySelectorAll('form').length;

  const res = performance.getEntriesByType('resource');
  const jsBytes = res.filter((e) => /\.js(\?|$)/.test(e.name)).reduce((n, e) => n + (e.encodedBodySize || 0), 0);
  const perf = window.__walkPerf || { lcp: 0, cls: 0 };

  return { overflowBy, offenders, cutoff, loading, crash, suspect, ids: [...ids], hrefs: [...hrefs], badAnchors, placeholders, copyButtons, forms, jsBytes, lcp: Math.round(perf.lcp), cls: Math.round(perf.cls * 1000) / 1000, title: document.title, h1: document.querySelector('h1')?.textContent?.trim().slice(0, 80) ?? null };
};

const PERF_INIT = () => {
  window.__walkPerf = { lcp: 0, cls: 0 };
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__walkPerf.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__walkPerf.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  } catch { /* unsupported: perf stays 0 and gates nothing */ }
};

// ---------------------------------------------------------------------------------------------------------------
// 4. One route at one width
// ---------------------------------------------------------------------------------------------------------------
/**
 * The engine answers browsers only from the production origins (checked: https://www.trustshell.dev and
 * https://trustshell.dev get access-control-allow-origin; http://127.0.0.1 gets a 500). A walk of a local build or a preview
 * URL would therefore fail every engine call for a reason that is not the site's. So for any BASE that is not production,
 * cross-origin fetch/XHR go through Node (route.fetch) and come back with the page's own origin allowed. The request is sent as
 * the production origin, and only GET / HEAD are let through (a page that tries to write during a walk fails loudly rather
 * than writing to a real backend). The engine's DATA is still real; only its origin allow-list is stepped around.
 */
const PRODUCTION_ORIGIN = ['trustshell.dev', 'www.trustshell.dev'].includes(new URL(BASE).host);
async function corsShim(ctx) {
  if (PRODUCTION_ORIGIN) return;
  await ctx.route('**/*', async (route) => {
    const req = route.request();
    if (new URL(req.url()).origin === ORIGIN || !['fetch', 'xhr'].includes(req.resourceType())) return route.continue();
    if (!['GET', 'HEAD'].includes(req.method())) return route.abort('blockedbyclient'); // the walk never writes to a real backend; listen() reports it as a note
    try {
      const { referer, origin, ...rest } = req.headers();
      const resp = await route.fetch({ timeout: 30_000, headers: { ...rest, origin: 'https://www.trustshell.dev' } });
      await route.fulfill({ response: resp, headers: { ...resp.headers(), 'access-control-allow-origin': ORIGIN, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': '*' } });
    } catch (err) {
      await route.abort('failed');
    }
  });
}

const expected = (route, kind, detail) => EXPECTED.some((e) => e.kind === kind && e.match.test(detail) && (!e.route || e.route === route));

/** Everything a page can complain about, funnelled into `problems` (minus what EXPECTED says is accepted). */
function listen(page, route, problems, blocked = []) {
  const add = (kind, detail) => { if (!expected(route, kind, detail)) problems.push({ kind, detail }); };
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/^Failed to load resource/i.test(t)) return; // the response / requestfailed listener names the URL
    add('console', `${t.slice(0, 300)}${m.location()?.url ? `  @ ${m.location().url}` : ''}`);
  });
  page.on('pageerror', (e) => add('pageerror', String(e.message).slice(0, 300)));
  page.on('requestfailed', (r) => {
    const why = r.failure()?.errorText ?? '';
    if (/ERR_ABORTED/.test(why)) return; // navigation / prefetch cancelled by the page itself
    if (/BLOCKED_BY_CLIENT/.test(why)) { blocked.push(`${r.method()} ${r.url().slice(0, 120)}`); return; } // our own write guard (corsShim)
    add('requestfailed', `${r.method()} ${r.url().slice(0, 160)} ${why}`);
  });
  page.on('response', (r) => { if (r.status() >= 400) add('http', `${r.status()} ${r.request().method()} ${r.url().slice(0, 160)}`); });
}

async function walkOne(browser, route, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, acceptDownloads: false });
  await corsShim(ctx);
  const page = await ctx.newPage();
  await page.addInitScript(PERF_INIT);
  const problems = [];
  listen(page, route, problems);

  let status = 0;
  let probe = null;
  try {
    const resp = await page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 45_000 });
    status = resp?.status() ?? 0;
    await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {});
    await page.waitForTimeout(1200);
    probe = await page.evaluate(PAGE_PROBE);
    if (probe.loading.length) { // give a slow backend a fair chance before calling it stuck
      await page.waitForTimeout(6000);
      probe = await page.evaluate(PAGE_PROBE);
    }
    if (SHOTS) {
      mkdirSync(SHOTS, { recursive: true });
      await page.screenshot({ path: join(SHOTS, `${route === '/' ? 'home' : route.slice(1).replace(/\//g, '_')}.${vp.name}.png`), fullPage: true }).catch(() => {});
    }
  } catch (err) {
    problems.push({ kind: 'navigation', detail: String(err?.message ?? err).split('\n')[0] });
  }

  const warnings = [];
  if (status !== 200 && status !== 0) problems.push({ kind: 'status', detail: `HTTP ${status}` });
  if (probe) {
    if (probe.overflowBy > 0) problems.push({ kind: 'overflow', detail: `scrolls sideways by ${probe.overflowBy}px at ${vp.width}px: ${probe.offenders.join(' | ') || 'no single element found'}` });
    if (probe.loading.length) problems.push({ kind: 'stuck-loading', detail: probe.loading.join(' | ') });
    if (probe.crash) problems.push({ kind: 'crash-text', detail: probe.crash });
    for (const p of probe.placeholders) problems.push({ kind: 'dead-link', detail: `href="#" placeholder: "${p}"` });
    for (const a of probe.badAnchors) problems.push({ kind: 'dead-anchor', detail: `${a} has no element with that id` });
    if (probe.cls > 0.25) problems.push({ kind: 'perf', detail: `CLS ${probe.cls} (poor > 0.25)` });
    if (probe.lcp > 4000) problems.push({ kind: 'perf', detail: `LCP ${probe.lcp} ms (poor > 4000)` });
    if (probe.cutoff.length) warnings.push(`text may be cut off: ${probe.cutoff.join(' | ')}`);
    if (probe.suspect.length) warnings.push(`visible text contains ${probe.suspect.join(', ')}`);
  }
  await ctx.close();
  return { route, width: vp.name, status, problems, warnings, probe };
}

/** Copy controls need a real clipboard, and the browser's is shared, so this runs one page at a time. */
async function copyWalk(browser, route, vp, html) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN });
  await corsShim(ctx);
  if (html) await ctx.route(`${BASE}${route}`, (r) => r.fulfill({ contentType: 'text/html', body: html }));
  const page = await ctx.newPage();
  const problems = [];
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 45_000 });
    await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {});
    const buttons = page.locator('button, [role="button"]').filter({ hasText: /\bcopy\b/i });
    const n = Math.min(await buttons.count(), 8);
    for (let i = 0; i < n; i++) {
      const b = buttons.nth(i);
      if (!(await b.isVisible()) || (await b.isDisabled().catch(() => false))) continue;
      const name = ((await b.getAttribute('aria-label')) || (await b.innerText())).trim().replace(/\s+/g, ' ').slice(0, 50);
      await page.evaluate(() => navigator.clipboard.writeText('__site_walk_sentinel__'));
      await b.scrollIntoViewIfNeeded().catch(() => {});
      await b.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(250);
      const got = await page.evaluate(() => navigator.clipboard.readText()).catch((e) => `ERR ${e.message}`);
      if (!got || got === '__site_walk_sentinel__' || got.startsWith('ERR ')) problems.push({ kind: 'copy', detail: `"${name}" put nothing on the clipboard (${got ? got.slice(0, 60) : 'empty'})` });
    }
  } catch (err) {
    problems.push({ kind: 'copy', detail: `copy walk failed: ${String(err?.message ?? err).split('\n')[0]}` });
  }
  await ctx.close();
  return problems;
}

/**
 * --poke: fill every visible input with a plausible value, then click every visible button / summary / tab once and
 * fail on whatever the click breaks: an error, a failed
 * request, a page that now scrolls sideways, or a control that cannot be clicked at all because something sits on top of it
 * (Playwright refuses a click another element would receive, which is how overlapping layouts show up). Refused against
 * production: writes are blocked by corsShim on a local or preview base, and there is no such guard there.
 */
const POKE_SELECTOR = 'button, summary, [role="button"], [role="tab"]';

/** Plausible values for whatever inputs a page shows, so a button that is disabled until the form is valid gets pressed. */
async function fillInputs(page) {
  const fields = page.locator('input:visible, textarea:visible, select:visible');
  const n = Math.min(await fields.count(), 12);
  for (let i = 0; i < n; i++) {
    const el = fields.nth(i);
    const m = await el.evaluate((e) => ({ tag: e.tagName.toLowerCase(), type: e.type || '', name: e.name || e.id || '', hint: `${e.placeholder || ''} ${e.getAttribute('aria-label') || ''}`, options: e.options ? e.options.length : 0 })).catch(() => null);
    if (!m || ['file', 'hidden', 'range', 'color', 'date', 'submit', 'button', 'image'].includes(m.type)) continue;
    const text = `${m.name} ${m.hint}`;
    if (m.type === 'number' && /default/i.test(text)) continue; // optional: "engine default" means empty is the valid value
    try {
      if (m.type === 'checkbox' || m.type === 'radio') await el.check({ timeout: 1500 });
      else if (m.tag === 'select') { if (m.options > 1) await el.selectOption({ index: 1 }, { timeout: 1500 }); }
      else {
        const v = m.type === 'password' ? 'site-walk-passphrase-1'
          : m.type === 'email' ? 'walk@example.com'
          : m.type === 'number' ? '1'
          : m.type === 'search' ? 'grant'
          : /0x|address/i.test(text) ? '0x000000000000000000000000000000000000dEaD'
          : /0000-0000/.test(text) ? '00000000-0000-0000-0000-000000000000'
          : /github\.com/i.test(text) ? 'https://github.com/DealAppSeo/trustshell'
          : /github_username/i.test(text) ? 'octocat'
          : m.tag === 'textarea' ? 'The build passed and all 12 tests pass.'
          : 'site walk';
        await el.fill(v, { timeout: 1500 });
      }
    } catch { /* an input that refuses a value is the page's business; the clicks below still run */ }
  }
}
async function pokeOne(browser, route, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  await corsShim(ctx);
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  const problems = [];
  const notes = [];
  const blocked = [];
  listen(page, route, problems, blocked);
  const open = async () => {
    await page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 45_000 });
    await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {});
    await page.waitForTimeout(800);
    await fillInputs(page);
  };
  try {
    await open();
    const total = Math.min(await page.locator(POKE_SELECTOR).count(), 30);
    for (let i = 0; i < total; i++) {
      const el = page.locator(POKE_SELECTOR).nth(i);
      if (!(await el.isVisible().catch(() => false)) || (await el.isDisabled().catch(() => false))) continue;
      const name = (((await el.getAttribute('aria-label').catch(() => null)) || (await el.innerText().catch(() => ''))) || `#${i}`).trim().replace(/\s+/g, ' ').slice(0, 50);
      const mark = problems.length;
      const before = page.url();
      let clicked = true;
      await el.click({ timeout: 3000 }).catch((e) => {
        clicked = false;
        const why = String(e.message).split('\n').find((l) => /intercepts pointer events|not stable|outside of the viewport|detached/.test(l)) ?? String(e.message).split('\n')[0];
        problems.push({ kind: 'unclickable', detail: `"${name}" cannot be clicked: ${why.trim().slice(0, 200)}` });
      });
      if (!clicked) continue;
      await page.waitForTimeout(400);
      if (page.url() !== before) { notes.push(`"${name}" navigates to ${page.url().replace(BASE, '')}`); await open(); continue; }
      for (let j = mark; j < problems.length; j++) problems[j].detail = `after clicking "${name}": ${problems[j].detail}`;
      let pr = await page.evaluate(PAGE_PROBE).catch(() => null);
      if (pr?.loading.length) { // a submit that never resolves is the "spinner forever" this walk exists to catch
        await page.waitForTimeout(8000);
        pr = await page.evaluate(PAGE_PROBE).catch(() => null);
        if (pr?.loading.length) problems.push({ kind: 'stuck-loading', detail: `after clicking "${name}": ${pr.loading.join(' | ')}` });
      }
      if (pr?.overflowBy > 0) problems.push({ kind: 'overflow', detail: `after clicking "${name}" the page scrolls sideways by ${pr.overflowBy}px: ${pr.offenders.slice(0, 2).join(' | ')}` });
      if (pr?.crash) problems.push({ kind: 'crash-text', detail: `after clicking "${name}": ${pr.crash}` });
    }
  } catch (err) {
    problems.push({ kind: 'poke', detail: `poke walk failed: ${String(err?.message ?? err).split('\n')[0]}` });
  }
  await ctx.close();
  for (const b of new Set(blocked)) notes.push(`a click tried to write (blocked): ${b}`);
  return { route, width: vp.name, problems, notes };
}

/**
 * A check that has never failed is not evidence it can. Before the walk, each probe is pointed at a page built to trip it;
 * a probe that does not trip is blind, and the run is NOT_CHECKED rather than a green nobody earned.
 */
async function controls(browser) {
  const blind = [];
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  await page.setContent('<body><div style="width:900px">wide</div><p>Loading…</p></body>');
  const p = await page.evaluate(PAGE_PROBE);
  if (!(p.overflowBy > 0 && p.offenders.length)) blind.push('overflow probe did not see a 900px element at 375px');
  if (!p.loading.length) blind.push('loading probe did not see "Loading…"');
  await page.setContent('<body><div style="width:100px;overflow:hidden"><span style="display:inline-block;width:400px">cut</span></div><a href="#">x</a><a href="#nope">y</a></body>');
  const q = await page.evaluate(PAGE_PROBE);
  if (!q.cutoff.length) blind.push('cut-off probe did not see clipped text');
  if (!(q.placeholders.length === 1 && q.badAnchors.length === 1)) blind.push('link probe did not see href="#" and #nope');
  await ctx.close();
  const c = await copyWalk(browser, '/__site_walk_control__', WIDTHS[1], `<body><button>Copy nothing</button><button onclick="navigator.clipboard.writeText('x')">Copy something</button></body>`);
  if (c.length !== 1 || !/Copy nothing/.test(c[0].detail)) blind.push(`copy probe should flag exactly "Copy nothing", got ${JSON.stringify(c)}`);
  return blind;
}

// ---------------------------------------------------------------------------------------------------------------
// 5. Run
// ---------------------------------------------------------------------------------------------------------------
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

const browser = await chromium.launch({ executablePath: chromiumExecutablePath(), args: LAUNCH_ARGS });
let exitCode = 0;
try {
  const blind = await controls(browser);
  if (blind.length) {
    console.error(`NOT_CHECKED: the walk's own probes failed their controls:\n  ${blind.join('\n  ')}`);
    await browser.close();
    killApp();
    process.exit(2);
  }
  // sitemap first: it names the static params (/for/*) and is itself under test
  let sitemapPaths = [];
  const siteProblems = [...PROBLEMS_BEFORE_WALK];
  const sm = await fetch(`${BASE}/sitemap.xml`).then((r) => r.text()).catch(() => '');
  for (const m of sm.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    try { const u = new URL(m[1]); sitemapPaths.push(u.pathname.replace(/\/$/, '') || '/'); } catch { siteProblems.push(`sitemap has an unparseable <loc>: ${m[1]}`); }
  }
  if (!sitemapPaths.length) siteProblems.push('sitemap.xml lists no routes');

  let routes = await expandRoutes(sitemapPaths);
  for (const s of sitemapPaths) if (!routes.includes(s)) siteProblems.push(`sitemap lists ${s}, which is not a page route in app/`);
  if (ONLY) routes = routes.filter((r) => ONLY.includes(r));

  // endpoints
  if (!ONLY) {
    for (const e of ENDPOINTS) {
      // Three tries, 2 s apart: /api/agent-leaderboard reads Base Sepolia over public RPC and answers 503 when that read
      // hiccups, which is its contract. Only an endpoint that stays down fails the walk.
      let r;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt) await new Promise((res) => setTimeout(res, 2000));
        r = await fetch(`${BASE}${e.path}`, { redirect: 'manual', signal: AbortSignal.timeout(30_000) }).catch((err) => ({ status: `ERR ${err.message}` }));
        if (e.status.includes(r.status)) break;
      }
      if (!e.status.includes(r.status)) siteProblems.push(`endpoint ${e.path} answered ${r.status} three times, expected ${e.status.join('/')}`);
    }
  }

  log(`walking ${routes.length} routes × ${WIDTHS.length} widths against ${BASE}\n`);
  const jobs = routes.flatMap((route) => WIDTHS.map((vp) => ({ route, vp })));
  const walked = await pool(jobs, JOBS, ({ route, vp }) => walkOne(browser, route, vp));
  results.push(...walked);

  // Perf taken three pages at a time is noisy (parallel loads delay fonts and inflate LCP), so a perf failure only stands
  // if the same page, measured alone, fails again.
  for (const r of results) {
    if (!r.problems.some((p) => p.kind === 'perf')) continue;
    const quiet = await walkOne(browser, r.route, WIDTHS.find((w) => w.name === r.width));
    r.problems = [...r.problems.filter((p) => p.kind !== 'perf'), ...quiet.problems.filter((p) => p.kind === 'perf')];
    if (quiet.probe) r.probe = quiet.probe;
  }

  // copy controls, sequential
  for (const r of results) {
    if (!r.probe || !r.probe.copyButtons) continue;
    const vp = WIDTHS.find((w) => w.name === r.width);
    r.problems.push(...(await copyWalk(browser, r.route, vp)));
  }

  // --poke: click every button once
  const pokeNotes = [];
  if (POKE) {
    if (PRODUCTION_ORIGIN) { console.error('--poke is refused against production; walk a local build or a preview URL'); process.exit(2); }
    const poked = await pool(jobs, JOBS, ({ route, vp }) => pokeOne(browser, route, vp));
    for (const p of poked) {
      results.find((r) => r.route === p.route && r.width === p.width)?.problems.push(...p.problems);
      for (const n of p.notes) pokeNotes.push(`${p.route} @${p.width}  ${n}`);
    }
  }

  // cross-page anchors + link resolution, once per unique link
  const idsByRoute = new Map();
  for (const r of results) if (r.probe && !idsByRoute.has(r.route)) idsByRoute.set(r.route, new Set(r.probe.ids));
  const linkFrom = new Map(); // normalised url -> Set(route)
  for (const r of results) {
    if (!r.probe) continue;
    for (const href of r.probe.hrefs) {
      let u;
      try { u = new URL(href); } catch { continue; }
      if (!/^https?:$/.test(u.protocol)) continue;
      const internal = SELF_HOSTS.has(u.host);
      const key = internal ? `${BASE}${u.pathname}${u.search}${u.hash}` : href;
      if (!linkFrom.has(key)) linkFrom.set(key, new Set());
      linkFrom.get(key).add(r.route);
    }
  }
  const unique = new Map(); // fetch url (no hash) -> { froms:Set, hashes:Set }
  for (const [key, froms] of linkFrom) {
    const u = new URL(key);
    const hash = u.hash.slice(1);
    u.hash = '';
    const k = u.href;
    if (!unique.has(k)) unique.set(k, { froms: new Set(), hashes: new Set() });
    for (const f of froms) unique.get(k).froms.add(f);
    if (hash) unique.get(k).hashes.add(decodeURIComponent(hash));
  }

  const linkNotes = [];
  const checks = [...unique.entries()].filter(([k]) => EXTERNAL || new URL(k).origin === ORIGIN);
  await pool(checks, 6, async ([url, info]) => {
    const internal = new URL(url).origin === ORIGIN;
    const from = [...info.froms].slice(0, 3).join(', ');
    let st;
    try {
      let r = await fetch(url, { method: internal ? 'GET' : 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(internal ? 30_000 : 15_000), headers: { 'user-agent': 'trustshell-site-walk' } });
      if (!internal && (r.status === 405 || r.status === 403 || r.status === 400)) r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15_000), headers: { 'user-agent': 'trustshell-site-walk' } });
      st = r.status;
    } catch (err) {
      const dns = /ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(String(err?.cause?.code ?? err?.cause ?? err));
      if (internal || dns) siteProblems.push(`link ${url} did not answer (${err?.cause?.code ?? err.message}); on ${from}`);
      else linkNotes.push(`${url} did not answer (${err?.cause?.code ?? err.name}); on ${from}`);
      return;
    }
    if (internal && st >= 400) siteProblems.push(`link ${url} is ${st}; on ${from}`);
    else if (!internal && (st === 404 || st === 410)) siteProblems.push(`external link ${url} is ${st}; on ${from}`);
    else if (!internal && st >= 400) linkNotes.push(`${url} answered ${st} (may be refusing bots); on ${from}`);
    if (internal && st < 400 && info.hashes.size) {
      const path = new URL(url).pathname.replace(/\/$/, '') || '/';
      const ids = idsByRoute.get(path);
      if (ids) for (const h of info.hashes) if (!ids.has(h) && h !== 'top') siteProblems.push(`link to ${path}#${h}: no element has that id; on ${from}`);
    }
  });

  // ------------------------------------------------------------------ report
  const byRoute = new Map();
  for (const r of results) { if (!byRoute.has(r.route)) byRoute.set(r.route, {}); byRoute.get(r.route)[r.width] = r; }
  const cell = (r) => (!r ? '-' : r.problems.length ? `FAIL(${r.problems.length})` : 'ok');
  log(`${'route'.padEnd(34)} ${'phone'.padEnd(9)} ${'desktop'.padEnd(9)} ${'LCP ms'.padEnd(7)} ${'CLS'.padEnd(6)} js KB`);
  for (const route of [...byRoute.keys()].sort()) {
    const { phone, desktop } = byRoute.get(route);
    const d = desktop?.probe ?? phone?.probe;
    log(`${route.padEnd(34)} ${cell(phone).padEnd(9)} ${cell(desktop).padEnd(9)} ${String(d?.lcp ?? '-').padEnd(7)} ${String(d?.cls ?? '-').padEnd(6)} ${d ? Math.round(d.jsBytes / 1024) : '-'}`);
  }

  const failing = results.filter((r) => r.problems.length);
  if (failing.length) {
    log('\nFAILURES');
    for (const r of failing) for (const p of r.problems) log(`  ${r.route} @${r.width}  [${p.kind}] ${p.detail}`);
  }
  if (siteProblems.length) { log('\nSITE-LEVEL FAILURES'); for (const p of siteProblems) log(`  ${p}`); }
  const warned = results.filter((r) => r.warnings.length);
  if (warned.length) { log('\nWARNINGS (do not fail)'); for (const r of warned) for (const w of r.warnings) log(`  ${r.route} @${r.width}  ${w}`); }
  if (linkNotes.length) { log('\nLINK NOTES (do not fail)'); for (const n of linkNotes) log(`  ${n}`); }
  if (pokeNotes.length) { log('\nPOKE NOTES (buttons that navigate; do not fail)'); for (const n of pokeNotes) log(`  ${n}`); }

  if (JSON_OUT) {
    writeFileSync(JSON_OUT, JSON.stringify({ base: BASE, at: new Date().toISOString(), routes: results.map(({ probe, ...r }) => ({ ...r, perf: probe ? { lcp: probe.lcp, cls: probe.cls, jsBytes: probe.jsBytes } : null, title: probe?.title, h1: probe?.h1 })), siteProblems, linkNotes }, null, 2));
  }

  const nFail = failing.reduce((n, r) => n + r.problems.length, 0) + siteProblems.length;
  log(`\n${results.length} page-walks · ${results.length - failing.length} clean · ${nFail} failure${nFail === 1 ? '' : 's'}`);
  exitCode = nFail ? 1 : 0;
} catch (err) {
  console.error('FATAL', err);
  exitCode = 1;
} finally {
  await browser.close();
  killApp();
}
process.exit(exitCode);
