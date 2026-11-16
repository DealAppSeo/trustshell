/**
 * The guided page, /lab/test-agent, in a real browser, on a desktop and a phone: every step, the loading and error
 * states, the keyboard path, accessibility (axe-core), and that a report the visitor opens never leaves the page.
 *
 *   node tests/e2e/test-agent-walk.mjs [screenshot dir]
 *
 * Builds the app and serves it, like its siblings. Not in gating CI (needs a browser and a build).
 */
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromiumExecutablePath, LAUNCH_ARGS, loadPlaywrightOrExit, spawnNext } from './chromium-path.mjs';

const { chromium } = await loadPlaywrightOrExit();
const PORT = 3108;
const base = `http://127.0.0.1:${PORT}`;
const PAGE = `${base}/lab/test-agent`;
const EXAMPLE = '**/examples/trust-report-example.json';
const shots = process.argv[2];
if (shots) mkdirSync(shots, { recursive: true });

const results = [];
const check = (name, pass, note = '') => {
  results.push({ name, pass, note });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${note ? ` — ${note}` : ''}`);
};

try {
  const probe = await fetch(`${base}/`, { signal: AbortSignal.timeout(2000) });
  if (probe) {
    console.error(`NOT_CHECKED: port ${PORT} is already serving; this suite will not test a server it did not start.`);
    process.exit(2);
  }
} catch {
  /* nothing listening: the state we want */
}

const env = { ...process.env };
delete env.VERCEL_ENV;
const build = spawnNext(['build'], { env, stdio: 'ignore' });
const code = await new Promise((r) => build.on('exit', r));
if (code !== 0) {
  console.error(`FATAL: next build exited ${code}`);
  process.exit(1);
}
const app = spawnNext(['start', '--port', String(PORT)], { env, stdio: 'ignore' });
const stop = () => {
  try {
    app.kill('SIGKILL');
  } catch {
    /* gone */
  }
};
process.on('exit', stop);
const deadline = Date.now() + 90_000;
for (;;) {
  try {
    if ((await fetch(PAGE)).ok) break;
  } catch {
    /* not up yet */
  }
  if (Date.now() > deadline) {
    console.error('FATAL: the app did not start');
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 500));
}

const dir = mkdtempSync(join(tmpdir(), 'ts-test-agent-'));
const file = (name, text) => {
  const p = join(dir, name);
  writeFileSync(p, text);
  return p;
};
const goodReport = readFileSync(join(process.cwd(), 'public', 'examples', 'trust-report-example.json'), 'utf8');
const axeSource = readFileSync(join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');

async function axe(page, label) {
  await page.evaluate(axeSource);
  const v = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const r = await axe.run('[data-testid="test-agent-flow"]', { resultTypes: ['violations'] });
    return r.violations.map((x) => `${x.id}(${x.impact}):${x.nodes.length}`);
  });
  check(`axe ${label}`, v.length === 0, v.join(' '));
}

async function noSideScroll(page, label) {
  const m = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));
  check(`no sideways scroll ${label}`, m.scroll <= m.width, `${m.scroll} vs ${m.width}`);
}

async function targets(page, label) {
  const small = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="test-agent-flow"]');
    return [...root.querySelectorAll('button, input:not([type=radio]), label:has(input[type=radio])')]
      .map((el) => ({ h: el.getBoundingClientRect().height, what: el.textContent?.slice(0, 30) || el.id }))
      .filter((x) => x.h > 0 && x.h < 44);
  });
  check(`tap targets at least 44px ${label}`, small.length === 0, JSON.stringify(small));
}

async function walk(label, viewport) {
  const context = await browser.newContext({ viewport, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const errors = [];
  const external = [];
  const sent = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => {
    if (!r.url().startsWith(base)) external.push(r.url());
    if (r.method() !== 'GET') sent.push(`${r.method()} ${r.url()}`);
  });
  const step = () => page.getByTestId('test-agent-flow').getAttribute('data-step');
  const stepButton = (name) => page.getByRole('navigation', { name: 'Steps' }).getByRole('button', { name });

  await page.goto(PAGE);
  await page.waitForLoadState('networkidle');
  const shot = async (n) => {
    if (shots) await page.screenshot({ path: join(shots, `${label}-${n}.png`), fullPage: true });
  };
  await shot('1-try');
  check(`${label}: starts on Try example`, (await step()) === 'try');
  // The control: axe must be able to report a violation here, or its silence below means nothing.
  await page.evaluate(() => document.querySelector('[data-testid="test-agent-flow"]').insertAdjacentHTML('beforeend', '<img id="axe-control" src="data:,">'));
  await page.evaluate(axeSource);
  const seen = await page.evaluate(async () => (await axe.run('[data-testid="test-agent-flow"]', { resultTypes: ['violations'] })).violations.map((x) => x.id));
  check(`${label}: axe can see a violation`, seen.includes('image-alt'), seen.join(' '));
  await page.evaluate(() => document.getElementById('axe-control').remove());
  check(`${label}: the current step is marked for assistive tech`, (await stepButton('Try example').getAttribute('aria-current')) === 'step');
  await axe(page, `${label} try`);
  await noSideScroll(page, `${label} try`);
  await targets(page, `${label} try`);

  // Loading state, then a failure, then a retry that works.
  let release;
  const held = new Promise((r) => (release = r));
  await page.route(EXAMPLE, async (route) => {
    await held;
    await route.abort();
  });
  await page.getByRole('button', { name: 'Show the example report' }).click();
  await page.waitForFunction(() => document.querySelector('[role=status]')?.textContent?.includes('Loading'));
  check(`${label}: shows a loading state`, await page.getByRole('button', { name: 'Show the example report' }).isDisabled());
  release();
  await page.getByTestId('test-agent-flow').getByRole('alert').waitFor();
  check(`${label}: a failed load says so and offers a retry`, /could not be loaded/.test(await page.getByTestId('test-agent-flow').getByRole('alert').textContent()) && (await page.getByRole('button', { name: 'Try again' }).isVisible()));
  await shot('1-error');
  await axe(page, `${label} error`);
  await page.unroute(EXAMPLE);
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.getByTestId('report-view').waitFor();
  check(`${label}: the example opens on Review report`, (await step()) === 'review');
  check(`${label}: focus moves to the new step heading`, (await page.evaluate(() => document.activeElement?.tagName)) === 'H2');
  const body = await page.getByTestId('report-view').textContent();
  check(`${label}: the report shows a contradicted claim`, body.includes('CONTRADICTED'));
  check(`${label}: it keeps the two paths apart`, body.includes('Path 1 ·') && body.includes('Path 2 ·'));
  check(`${label}: it says what it cannot see`, body.includes('cannot see') && body.includes('This report cannot see them'));
  check(`${label}: it is labelled as the example`, await page.getByText('This is the example report, not yours.').isVisible());
  await shot('3-review');
  await axe(page, `${label} review`);
  await noSideScroll(page, `${label} review`);
  await targets(page, `${label} review`);

  await page.getByRole('button', { name: 'What should I do next?' }).click();
  const next = await page.getByTestId('next-actions').textContent();
  check(`${label}: next action names what not to accept`, next.includes('Do not accept'));
  check(`${label}: it says the page does not verify the file`, await page.getByText('does not prove the file is unchanged').isVisible());
  await shot('4-next');
  await axe(page, `${label} next`);
  await noSideScroll(page, `${label} next`);

  await stepButton('Test my agent').click();
  check(`${label}: path 1 is first`, await page.getByTestId('path-one').isVisible());
  await axe(page, `${label} test`);
  await page.getByLabel('GitHub Actions run URL').fill('https://example.com/nope');
  check(`${label}: a bad URL is explained`, /not a GitHub Actions run URL/.test(await page.locator('#run-url-help').textContent()));
  check(`${label}: and marked invalid`, (await page.getByLabel('GitHub Actions run URL').getAttribute('aria-invalid')) === 'true');
  await page.getByLabel('GitHub Actions run URL').fill('https://github.com/o/r/actions/runs/123');
  await page.getByLabel('What your agent said').fill('It passed "fine" $(x)');
  check(`${label}: text a shell would reinterpret is refused`, /do not survive every shell/.test(await page.locator('#claim-help').textContent()));
  check(`${label}: no command is offered for it`, (await page.locator('pre').count()) === 0);
  await page.getByLabel('What your agent said').fill('The check workflow succeeded, run 123.');
  const command = await page.locator('pre').first().textContent();
  check(`${label}: a valid form yields the command`, command.includes('check https://github.com/o/r/actions/runs/123 --claims "The check workflow succeeded, run 123."'));
  await page.getByRole('button', { name: /^Copy command/ }).first().click();
  await page.getByText('Copied.').waitFor();
  check(`${label}: copy works`, (await page.evaluate(() => navigator.clipboard.readText())) === command);
  await shot('2-path1');
  await noSideScroll(page, `${label} path1`);
  await targets(page, `${label} path1`);

  await page.getByRole('radio', { name: /Run a task through TrustShell/ }).check();
  check(`${label}: path 2 replaces path 1`, (await page.getByTestId('path-two').isVisible()) && !(await page.getByTestId('path-one').isVisible()));
  check(`${label}: path 2 gives the install command`, await page.getByText('npm i -g @hyperdag/trustshell@1.9.3').isVisible());
  check(`${label}: path 2 says what it does not see`, await page.getByText('without trustshell run is not seen').isVisible());
  await axe(page, `${label} path2`);
  await shot('2-path2');
  await noSideScroll(page, `${label} path2`);

  await stepButton('Review report').click();
  for (const [name, content, want] of [
    ['not json', '{nope', 'not JSON'],
    ['other json', '{"a":1}', 'not a Trust Report'],
    ['partial', '{"schema":"dev.trustshell.trust-report/0.1-draft","title":"t"}', 'incomplete'],
  ]) {
    await page.locator('#report-file').setInputFiles(file(`${name}.json`, content));
    await page.getByTestId('test-agent-flow').getByRole('alert').waitFor();
    check(`${label}: ${name} is refused with a reason`, (await page.getByTestId('test-agent-flow').getByRole('alert').textContent()).includes(want));
  }
  await axe(page, `${label} bad file`);
  const before = external.length + sent.length;
  await page.locator('#report-file').setInputFiles(file('report.json', goodReport));
  await page.getByText('Agent said it was finished').first().waitFor();
  check(`${label}: an opened report is not labelled as the example`, !(await page.getByText('This is the example report, not yours.').isVisible()));
  check(`${label}: opening a report sends nothing`, external.length + sent.length === before, external.concat(sent).join(' '));

  // Keyboard only: reach a step and open it.
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.locator('nav[aria-label="Steps"] button').nth(1).focus();
  await page.keyboard.press('Enter');
  check(`${label}: a step opens from the keyboard`, (await step()) === 'test');
  check(`${label}: focus lands on its heading`, (await page.evaluate(() => document.activeElement?.tagName)) === 'H2');

  check(`${label}: no script errors`, errors.length === 0, errors.join(' '));
  check(`${label}: nothing but this site was contacted`, external.length === 0, external.join(' '));
  check(`${label}: nothing was sent`, sent.length === 0, sent.join(' '));
  await context.close();
}

let browser;
try {
  browser = await chromium.launch({ executablePath: chromiumExecutablePath(), args: LAUNCH_ARGS });
  await walk('desktop', { width: 1280, height: 800 });
  await walk('phone', { width: 375, height: 812 });
} catch (e) {
  check('the walk finished', false, e?.stack ?? String(e));
} finally {
  await browser?.close();
  stop();
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length} passed · ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
