/**
 * trustshell.dev/build, driven in a real browser: the parts only a browser can prove.
 *
 *   - Copy puts exactly the commands on the clipboard, without their "$ " / "PS>" prompts (the
 *     success path; a refused clipboard is covered by the button's own "Could not copy" state).
 *   - The shell switch is ARIA tabs: Right/Left move the selection AND focus, one tab is tabbable.
 *   - The first viewport ends on the verdict at 1280 px, and step 1 of the explainer is above the
 *     fold at 375 px.
 *   - Charts play once on entry and rest on their final state; under reduced motion they never
 *     collapse at all.
 *   - The served sample receipt hashes to what lib/build-ledger.json (and so the page) prints.
 *
 * Nothing here talks to a backend: /build is static. NOT in gating CI (it needs a browser and a
 * server), like its siblings.
 *
 *     npm run test:build-walk                       # builds, serves on :3125, walks
 *     npm run test:build-walk -- --base=http://localhost:3123   # walks a server you already run
 *
 * Exit: 0 every check passed · 1 any failed · 2 NOT_CHECKED (no browser, port busy, app never up).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromiumExecutablePath, LAUNCH_ARGS, loadPlaywrightOrExit, spawnNext } from './chromium-path.mjs';

const { chromium } = await loadPlaywrightOrExit();
const BASE_ARG = process.argv.find((a) => a.startsWith('--base='));
const PORT = 3125;
const BASE = (BASE_ARG ? BASE_ARG.slice('--base='.length) : `http://127.0.0.1:${PORT}`).replace(/\/+$/, '');
const ledger = JSON.parse(readFileSync(join(process.cwd(), 'lib', 'build-ledger.json'), 'utf8'));

const RUN = 'https://github.com/DealAppSeo/trustshell/actions/runs/39619591025';
const C1 = 'The check workflow succeeded, run 39619591025.';
const C2 = 'The check workflow succeeded on commit 5d1c5e3f57e1, run 39619591025.';
const PKG = /npx (@hyperdag\/trustshell(?:@next)?) check/; // either side of the 1.8.0 flip
const BASH = (pkg) => [`RUN=${RUN}`, `printf '${C1}\\n\\n${C2}\\n' > claims.txt`, `npx ${pkg} check "$RUN" --claims-file claims.txt; echo "exit $?"`].join('\n');
const PS = (pkg) => [`$run = "${RUN}"`, `"${C1}", "", "${C2}" | Set-Content claims.txt`, `npx ${pkg} check $run --claims-file claims.txt; "exit $LASTEXITCODE"`].join('\n');

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
  const build = spawnNext(['build'], { stdio: 'ignore' });
  if ((await new Promise((r) => build.on('exit', r))) !== 0) {
    console.error('FATAL: next build failed');
    process.exit(1);
  }
  const app = spawnNext(['start', '--port', String(PORT)], { stdio: 'ignore', detached: true });
  killApp = () => { try { process.kill(-app.pid, 'SIGKILL'); } catch { try { app.kill('SIGKILL'); } catch {} } };
  process.on('exit', killApp);
}

async function up(url, ms = 120_000) {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 500))) {
    try { if ((await fetch(url)).ok) return true; } catch { /* not yet */ }
  }
  return false;
}
if (!(await up(`${BASE}/build`))) {
  console.error('NOT_CHECKED: the app never became ready');
  process.exit(2);
}

const browser = await chromium.launch({ executablePath: chromiumExecutablePath(), args: LAUNCH_ARGS });
try {
  // --- desktop, motion allowed, clipboard granted
  const desk = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await desk.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE).origin });
  const page = await desk.newPage();
  await page.goto(`${BASE}/build`, { waitUntil: 'networkidle' });
  const pkg = (await page.locator('#shell-panel-bash').innerText()).match(PKG)?.[1] ?? '?';

  const verdict = await page.locator('figure ol >> text=Contradicted').first().boundingBox();
  check('desktop: the explainer ends on Contradicted inside the first 800 px', verdict && verdict.y + verdict.height <= 800, JSON.stringify(verdict));

  // The OS clipboard may store line ends as CRLF (Windows does); the page writes LF. Compare the text, not the platform.
  const clip = async () => (await page.evaluate(() => navigator.clipboard.readText())).split(String.fromCharCode(13)).join('');
  await page.getByRole('button', { name: 'Copy the Bash commands' }).click();
  check('copy: Bash puts the three commands on the clipboard, no prompts', (await clip()) === BASH(pkg), JSON.stringify(await clip()));
  await page.waitForTimeout(100);
  check('copy: the button says Copied', (await page.locator('#run-it [role=status]').first().innerText()).trim() === 'Copied');

  const bashTab = page.getByRole('tab', { name: 'Bash' });
  check('tabs: only the selected tab is in the Tab order', (await bashTab.getAttribute('tabindex')) === '0' && (await page.getByRole('tab', { name: 'PowerShell' }).getAttribute('tabindex')) === '-1');
  await bashTab.focus();
  await page.keyboard.press('ArrowRight');
  const psTab = page.getByRole('tab', { name: 'PowerShell' });
  check('tabs: ArrowRight selects and focuses PowerShell', (await psTab.getAttribute('aria-selected')) === 'true' && (await psTab.evaluate((el) => el === document.activeElement)));
  check('tabs: the PowerShell panel shows, the Bash panel hides', (await page.locator('#shell-panel-powershell').isVisible()) && !(await page.locator('#shell-panel-bash').isVisible()));
  await page.getByRole('button', { name: 'Copy the PowerShell commands' }).click();
  check('copy: PowerShell puts its three commands on the clipboard, no prompts', (await clip()) === PS(pkg), JSON.stringify(await clip()));
  await psTab.focus(); // Copy took focus; arrow keys belong to the tablist
  await page.keyboard.press('ArrowLeft');
  check('tabs: ArrowLeft goes back to Bash', (await bashTab.getAttribute('aria-selected')) === 'true');

  await page.getByRole('button', { name: 'Copy spend.mjs' }).click();
  const spend = await clip();
  check('copy: spend.mjs is the script alone, not its run or output', spend.startsWith("import { randomBytes } from 'node:crypto';") && spend.trimEnd().endsWith('}') && !spend.includes('node spend.mjs') && !spend.includes('REFUSED no policy -'), spend.slice(-80));

  // play once on entry, rest on the final state
  const study = page.locator('#erc-8004 [data-reveal]').first();
  check('reveal: a chart below the fold waits, armed', (await study.getAttribute('data-reveal')) === 'armed');
  await study.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1600);
  check('reveal: on entry it plays', (await study.getAttribute('data-reveal')) === 'play');
  const bar = await study.locator('.anim-grow-x').first().evaluate((el) => getComputedStyle(el).transform);
  check('reveal: and rests on the final state', bar === 'none' || bar === 'matrix(1, 0, 0, 1, 0, 0)', bar);

  const r = await page.request.get(`${BASE}/samples/inspect-39619591025/record.json`);
  const hash = createHash('sha256').update(await r.body()).digest('hex');
  check('receipt: the served record.json hashes to the printed sha-256', hash === ledger.sample_check.record_sha256_of_file, hash);
  await desk.close();

  // --- reduced motion: nothing ever collapses
  const still = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const sp = await still.newPage();
  await sp.goto(`${BASE}/build`, { waitUntil: 'networkidle' });
  const collapsed = await sp.evaluate(() => [...document.querySelectorAll('.anim-grow-x, .anim-grow-y, .anim-in')].filter((el) => {
    const cs = getComputedStyle(el);
    return cs.opacity === '0' || /matrix\(0,|matrix\(1, 0, 0, 0,/.test(cs.transform);
  }).length);
  check('reduced motion: no chart element is collapsed or hidden', collapsed === 0, String(collapsed));
  await still.close();

  // --- phone: evidence above the fold
  const phone = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  const pp = await phone.newPage();
  await pp.goto(`${BASE}/build`, { waitUntil: 'networkidle' });
  const step1 = await pp.locator('figure ol li').first().boundingBox();
  check('phone: step 1 of the explainer starts above the fold', step1 && step1.y < 812, JSON.stringify(step1));
  check('phone: nothing scrolls sideways', await pp.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await phone.close();
} catch (err) {
  check('the walk ran to the end', false, err?.message ?? String(err));
} finally {
  await browser.close();
  killApp();
}

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
