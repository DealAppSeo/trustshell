/**
 * The first-run preview, /lab/start, in a real browser, on a desktop and a phone: every path and step, the loading,
 * empty and error states, the keyboard path, tap targets, sideways scrolling, accessibility (axe-core, with a control
 * that proves it can fail), and that nothing leaves the site or is sent.
 *
 *   node tests/e2e/first-run-walk.mjs [screenshot dir]
 *
 * Builds the app and serves it, like its siblings. Not in gating CI (needs a browser and a build).
 */
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromiumExecutablePath, LAUNCH_ARGS, loadPlaywrightOrExit, spawnNext } from './chromium-path.mjs';

const { chromium } = await loadPlaywrightOrExit();
const PORT = 3109;
const base = `http://127.0.0.1:${PORT}`;
const PAGE = `${base}/lab/start`;
const SAVED_RUNS = '**/examples/run-*-record.json';
const REPORT = '**/examples/trust-report-example.json';
const FLOW = '[data-testid="first-run-flow"]';
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

const dir = mkdtempSync(join(tmpdir(), 'ts-first-run-'));
const file = (name, text) => {
  const p = join(dir, name);
  writeFileSync(p, text);
  return p;
};
const goodReport = readFileSync(join(process.cwd(), 'public', 'examples', 'trust-report-example.json'), 'utf8');
const axeSource = readFileSync(join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');

async function axe(page, label) {
  await page.evaluate(axeSource);
  const v = await page.evaluate(async (flow) => {
    const r = await axe.run(flow, { resultTypes: ['violations'] });
    return r.violations.map((x) => `${x.id}(${x.impact}):${x.nodes.length}`);
  }, FLOW);
  check(`axe ${label}`, v.length === 0, v.join(' '));
}

async function noSideScroll(page, label) {
  const m = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));
  check(`no sideways scroll ${label}`, m.scroll <= m.width, `${m.scroll} vs ${m.width}`);
}

async function targets(page, label) {
  const small = await page.evaluate((flow) => {
    const root = document.querySelector(flow);
    return [...root.querySelectorAll('button, summary, input:not([type=radio]), textarea, label:has(input[type=radio])')]
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => ({ h: Math.round(el.getBoundingClientRect().height), what: el.textContent?.slice(0, 30) || el.id }))
      .filter((x) => x.h < 44);
  }, FLOW);
  check(`tap targets at least 44px ${label}`, small.length === 0, JSON.stringify(small));
}

async function focusVisibleOnKeyboard(page, label) {
  const ok = await page.evaluate((flow) => {
    const el = document.querySelector(`${flow} button`);
    el.focus();
    return el.matches(':focus');
  }, FLOW);
  check(`${label}: a button takes keyboard focus`, ok);
}

async function walk(label, viewport) {
  const context = await browser.newContext({ viewport, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const errors = [];
  const external = [];
  const sent = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => {
    if (!r.url().startsWith(base) && !r.url().startsWith('data:')) external.push(r.url());
    if (r.method() !== 'GET') sent.push(`${r.method()} ${r.url()}`);
  });
  const flow = page.getByTestId('first-run-flow');
  const step = () => flow.getAttribute('data-step');
  const who = () => flow.getAttribute('data-who');
  const stepButton = (name) => page.getByRole('navigation', { name: 'Steps' }).getByRole('button', { name });
  // Focus that lands behind the sticky site header is focus a visitor cannot see.
  const focusClear = () => page.evaluate(() => document.activeElement.getBoundingClientRect().top >= document.querySelector('header').getBoundingClientRect().bottom);
  const headingFocused = async () => (await page.evaluate(() => document.activeElement?.tagName)) === 'H2' && (await focusClear());
  const shot = async (n) => {
    if (!shots) return;
    await page.evaluate(() => window.scrollTo(0, 0)); // a full-page capture otherwise paints the sticky header mid-page
    await page.screenshot({ path: join(shots, `${label}-${n}.png`), fullPage: true });
  };
  const everyCheck = async (name) => {
    await axe(page, `${label} ${name}`);
    await noSideScroll(page, `${label} ${name}`);
    await targets(page, `${label} ${name}`);
  };
  const pick = async (title) => {
    await page.getByRole('button', { name: new RegExp(`^${title}`) }).click();
  };

  await page.goto(PAGE);
  await page.waitForLoadState('networkidle');
  check(`${label}: says it is a preview`, await page.getByTestId('lab-banner').isVisible());
  await shot('0-fork');

  // The control: axe must be able to report a violation here, or its silence below means nothing.
  await page.evaluate((f) => document.querySelector(f).insertAdjacentHTML('beforeend', '<img id="axe-control" src="data:,">'), FLOW);
  await page.evaluate(axeSource);
  const seen = await page.evaluate(async (f) => (await axe.run(f, { resultTypes: ['violations'] })).violations.map((x) => x.id), FLOW);
  check(`${label}: axe can see a violation`, seen.includes('image-alt'), seen.join(' '));
  await page.evaluate(() => document.getElementById('axe-control').remove());

  check(`${label}: starts on the fork, with no step yet`, (await who()) === 'none' && (await step()) === 'none');
  check(`${label}: says the choice can be changed`, await page.getByText('You can change this at any time').isVisible());
  await everyCheck('fork');
  await focusVisibleOnKeyboard(page, label);

  // ── Path 1: chat. Loading, then a failure, then a retry that works.
  let release;
  const held = new Promise((r) => (release = r));
  await page.route(SAVED_RUNS, async (route) => {
    await held;
    await route.abort();
  });
  await pick('I chat with AI');
  check(`${label}: chat starts on Try`, (await who()) === 'chat' && (await step()) === 'try');
  check(`${label}: focus moves to the step heading`, await headingFocused());
  await page.getByText('Loading the saved runs').waitFor();
  check(`${label}: shows a loading state`, true);
  await shot('chat-1-loading');
  release();
  await flow.getByRole('alert').waitFor();
  check(`${label}: a failed load says so and offers a retry`, /could not be loaded/.test(await flow.getByRole('alert').textContent()) && (await page.getByRole('button', { name: 'Try again' }).isVisible()));
  await shot('chat-1-error');
  await everyCheck('chat error');
  await page.unroute(SAVED_RUNS);
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.getByRole('list', { name: 'Sentences to check' }).waitFor();
  check(`${label}: says it cannot see conversations`, await page.getByText('TrustShell cannot see your conversations with an AI').isVisible());
  check(`${label}: names an empty result`, await page.getByText('Pick a sentence to see what the record shows.').isVisible());
  await shot('chat-1-try');
  await everyCheck('chat try');

  const sentence = (t) => page.getByRole('button', { name: new RegExp(t) });
  await sentence('succeeded, run 42502305639').click();
  await page.getByTestId('receipt').waitFor();
  let receipt = await page.getByTestId('receipt').textContent();
  check(`${label}: a false claim is CONTRADICTED`, receipt.includes('CONTRADICTED') && receipt.includes('finished with conclusion "failure"'));
  check(`${label}: exit 1 is explained`, receipt.includes('would exit 1'));
  check(`${label}: the result takes focus, clear of the header`, (await page.evaluate(() => document.activeElement?.tagName)) === 'H3' && (await focusClear()));
  check(`${label}: the choice is marked pressed`, (await sentence('succeeded, run 42502305639').getAttribute('aria-pressed')) === 'true');
  await shot('chat-1-contradicted');
  await everyCheck('chat contradicted');
  await sentence('succeeded, run 39619591025').click();
  await page.getByText('would exit 0').waitFor();
  check(`${label}: a true claim is SUPPORTED`, (await page.getByTestId('receipt').textContent()).includes('SUPPORTED'));
  await sentence('All tests pass').click();
  await page.getByText('would exit 3').waitFor();
  receipt = await page.getByTestId('receipt').textContent();
  check(`${label}: an unprovable claim is NOT_CHECKED`, receipt.includes('NOT_CHECKED') && receipt.includes('never a pass'));
  await shot('chat-1-not-checked');
  await page.getByText('What do these words mean?').click();
  check(`${label}: the legend explains COMMAND_PASSED`, (await page.getByTestId('status-legend').textContent()).includes('exited 0'));
  await everyCheck('chat legend');

  await page.getByRole('button', { name: 'Try my own words' }).click();
  check(`${label}: goes to Test`, (await step()) === 'test' && (await headingFocused()));
  await page.getByRole('button', { name: 'Check this sentence' }).click();
  check(`${label}: an empty box is named`, /Write a sentence first/.test(await page.locator('#own-sentence-help').textContent()));
  check(`${label}: and marked invalid`, (await page.locator('#own-sentence').getAttribute('aria-invalid')) === 'true');
  await shot('chat-2-empty');
  await everyCheck('chat test empty');
  await page.locator('#own-sentence').fill('My assistant says everything is fine.');
  await page.getByRole('button', { name: 'Check this sentence' }).click();
  await page.getByTestId('receipt').waitFor();
  check(`${label}: free text it cannot read is NOT_CHECKED`, (await page.getByTestId('receipt').textContent()).includes('NOT_CHECKED'));
  await page.getByRole('radio', { name: /The run that passed/ }).check();
  await page.locator('#own-sentence').fill('The check workflow succeeded, run 39619591025.');
  await page.getByRole('button', { name: 'Check this sentence' }).click();
  await page.getByText('would exit 0').waitFor();
  check(`${label}: your own words are checked against the chosen run`, (await page.getByTestId('receipt').textContent()).includes('run 39619591025'));
  await shot('chat-2-test');
  await everyCheck('chat test');

  await page.getByRole('button', { name: 'Read the receipt' }).click();
  check(`${label}: goes to Report`, (await step()) === 'report' && (await headingFocused()));
  const full = await flow.textContent();
  check(`${label}: the receipt says what it does not prove`, full.includes('What this does not prove') && full.includes('not a judgement about whether the code is correct'));
  check(`${label}: the report says it cannot read chats`, full.includes('It cannot read your AI chats'));
  await shot('chat-3-report');
  await everyCheck('chat report');
  await stepButton('Try').click();
  check(`${label}: a step can be reopened`, (await step()) === 'try');
  await page.getByRole('button', { name: /Change path/ }).click();
  check(`${label}: focus returns to the fork`, await headingFocused());
  await pick('I chat with AI');
  await stepButton('Report').click();
  await page.getByTestId('receipt-empty').waitFor();
  check(`${label}: an empty receipt is named, with a way forward`, await page.getByRole('button', { name: 'Check a sentence' }).isVisible());
  await shot('chat-3-empty');
  await everyCheck('chat report empty');
  await page.getByRole('button', { name: 'Check a sentence' }).click();
  await page.getByRole('list', { name: 'Sentences to check' }).waitFor();
  await sentence('succeeded, run 42502305639').click();
  await stepButton('Report').click();
  await page.getByRole('button', { name: 'Check a real GitHub run' }).click();
  check(`${label}: the next step leads to the GitHub path`, (await who()) === 'vibe' && (await step()) === 'try');

  // ── Path 2: an AI builds software for me.
  await page.getByRole('button', { name: 'Check my own run' }).waitFor();
  let text = await flow.textContent();
  check(`${label}: vibe gives the check command, pinned`, text.includes('npx -y @hyperdag/trustshell@1.9.1 check https://github.com/DealAppSeo/trustshell/actions/runs/42502305639'));
  check(`${label}: its example is labelled as an example`, text.includes('Example: real output from @hyperdag/trustshell 1.9.1'));
  check(`${label}: a successful run is not proof`, text.includes('A successful run is not proof the code is correct'));
  await shot('vibe-1-try');
  await everyCheck('vibe try');
  await page.getByRole('button', { name: /^Copy command/ }).first().click();
  await page.getByText('Copied.').first().waitFor();
  check(`${label}: copy works`, (await page.evaluate(() => navigator.clipboard.readText())) === (await page.locator('pre').first().textContent()));

  await page.getByRole('button', { name: 'Check my own run' }).click();
  check(`${label}: vibe goes to Test`, (await step()) === 'test');
  await page.getByLabel('GitHub Actions run URL').fill('https://example.com/nope');
  check(`${label}: a bad URL is explained`, /not a GitHub Actions run URL/.test(await page.locator('#run-url-help').textContent()));
  await page.getByLabel('GitHub Actions run URL').fill('https://github.com/o/r/actions/runs/123');
  await page.getByLabel('What your agent said').fill('It passed "fine" $(x)');
  check(`${label}: text a shell would reinterpret is refused`, /do not survive every shell/.test(await page.locator('#claim-help').textContent()));
  await page.getByLabel('What your agent said').fill('The check workflow succeeded, run 123.');
  check(`${label}: a valid form yields a pinned command`, (await page.locator('pre').first().textContent()) === 'npx -y @hyperdag/trustshell@1.9.1 check https://github.com/o/r/actions/runs/123 --claims "The check workflow succeeded, run 123." --out evidence');
  text = await flow.textContent();
  check(`${label}: says NOT_CHECKED is never a pass`, text.includes('NOT_CHECKED is never a pass'));
  check(`${label}: gives the report command`, text.includes('trust-report --out report --record evidence/record.json'));
  await shot('vibe-2-test');
  await everyCheck('vibe test');

  // Report: empty, a held load, a failure, each bad file, the example, then an opened file that goes nowhere.
  await page.getByRole('button', { name: 'I have a report' }).click();
  await page.getByTestId('report-empty').waitFor();
  check(`${label}: no report yet is named`, await page.getByText('No report is open yet').isVisible());
  await shot('vibe-3-empty');
  await everyCheck('vibe report empty');
  let releaseReport;
  const heldReport = new Promise((r) => (releaseReport = r));
  await page.route(REPORT, async (route) => {
    await heldReport;
    await route.abort();
  });
  await page.getByRole('button', { name: 'Use the example report' }).click();
  await page.waitForFunction((f) => document.querySelector(`${f} [role=status]`)?.textContent?.includes('Loading'), FLOW);
  check(`${label}: the report shows a loading state`, await page.getByRole('button', { name: 'Use the example report' }).isDisabled());
  releaseReport();
  await flow.getByRole('alert').waitFor();
  check(`${label}: a failed report load says so and offers a retry`, await page.getByRole('button', { name: 'Try the example again' }).isVisible());
  await shot('vibe-3-error');
  await everyCheck('vibe report error');
  await page.unroute(REPORT);
  for (const [name, content, want] of [
    ['not json', '{nope', 'not JSON'],
    ['other json', '{"a":1}', 'not a Trust Report'],
    ['partial', '{"schema":"dev.trustshell.trust-report/0.1-draft","title":"t"}', 'incomplete'],
  ]) {
    await page.locator('#report-file').setInputFiles(file(`${name}.json`, content));
    await page.waitForFunction(([f, w]) => document.querySelector(`${f} [role=alert]`)?.textContent?.includes(w), [FLOW, want]);
    check(`${label}: ${name} is refused with a reason`, true);
  }
  await page.getByRole('button', { name: 'Try the example again' }).click();
  await page.getByTestId('report-view').waitFor();
  const body = await page.getByTestId('report-view').textContent();
  check(`${label}: the report shows a contradicted claim`, body.includes('CONTRADICTED'));
  check(`${label}: and a claim not checked`, body.includes('NOT_CHECKED'));
  check(`${label}: it says what it cannot see`, body.includes('This report cannot see them'));
  check(`${label}: it is labelled as an example`, await page.getByText('This is an example report, not yours.').isVisible());
  check(`${label}: it names the release that made it`, body.includes('trustshell 1.9.1'));
  check(`${label}: it says what to do next`, (await page.getByTestId('next-actions').textContent()).includes('Do not accept'));
  check(`${label}: it does not claim to verify the file`, await page.getByText('does not prove the file is unchanged').isVisible());
  check(`${label}: it explains COMMAND_PASSED`, (await page.getByTestId('status-legend').textContent()).includes('all it shows'));
  await shot('vibe-3-report');
  await everyCheck('vibe report');
  const before = external.length + sent.length;
  await page.locator('#report-file').setInputFiles(file('report.json', goodReport));
  await page.waitForFunction(() => !document.body.textContent.includes('This is an example report, not yours.'));
  check(`${label}: an opened report is not labelled as the example`, true);
  check(`${label}: opening a report sends nothing`, external.length + sent.length === before, external.concat(sent).join(' '));
  await page.getByRole('button', { name: 'Set up Guard and MCP' }).click();
  check(`${label}: the next step leads to the developer path`, (await who()) === 'dev' && (await step()) === 'try');

  // ── Path 3: developer.
  text = await flow.textContent();
  check(`${label}: dev gives the offline demo`, text.includes('npx -y @hyperdag/trustshell@1.9.1 demo'));
  check(`${label}: and says what a signature does not show`, text.includes('It does not show the action was right'));
  await shot('dev-1-try');
  await everyCheck('dev try');
  await page.getByRole('button', { name: 'Wire it in' }).click();
  check(`${label}: dev goes to Test`, (await step()) === 'test');
  text = await flow.textContent();
  check(`${label}: says what TrustShell sees, at the point it matters`, text.includes('TrustShell sees only what goes through trustshell run, the MCP server and the SDK'));
  check(`${label}: Guard says npm and npx cannot start on Windows`, await page.getByText('npm and npx cannot be started through trustshell run').isVisible());
  check(`${label}: Guard gives both shells' setup`, text.includes('export TRUSTSHELL_HOME=') && text.includes('$env:TRUSTSHELL_HOME ='));
  check(`${label}: Guard gives the pinned install`, await page.getByText('npm i -g @hyperdag/trustshell@1.9.1').isVisible());
  await shot('dev-2-guard');
  await everyCheck('dev guard');
  await page.getByRole('tab', { name: 'CLI' }).click();
  check(`${label}: the CLI tab shows the check form`, await page.getByLabel('GitHub Actions run URL').isVisible());
  await shot('dev-2-cli');
  await everyCheck('dev cli');
  await page.getByRole('tab', { name: 'MCP' }).click();
  const mcp = await page.getByTestId('dev-mcp').textContent();
  check(`${label}: the MCP tab gives a pinned config`, mcp.includes('"trustshell-mcp"') && mcp.includes('@hyperdag/trustshell@1.9.1'));
  check(`${label}: and says which tools send text away`, mcp.includes('that text leaves your machine'));
  check(`${label}: and that no policy means no gate`, mcp.includes('With no policy there, the call runs'));
  await shot('dev-2-mcp');
  await everyCheck('dev mcp');
  await page.getByRole('button', { name: 'I have a report' }).click();
  check(`${label}: dev goes to Report`, (await step()) === 'report');
  await page.getByRole('button', { name: 'Use the example report' }).click();
  await page.getByTestId('report-view').waitFor();
  check(`${label}: dev is offered a way to report a wrong verdict`, await page.getByRole('link', { name: 'Report it on GitHub' }).isVisible());
  await shot('dev-3-report');
  await everyCheck('dev report');

  // Keyboard only: from a fresh load, choose a path and move a step without a mouse.
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /^I build or run agents/ }).focus();
  await page.keyboard.press('Enter');
  check(`${label}: a path opens from the keyboard`, (await who()) === 'dev');
  check(`${label}: focus lands on its heading`, await headingFocused());
  await page.keyboard.press('Shift+Tab');
  const prior = await page.evaluate(() => document.activeElement?.textContent);
  check(`${label}: Tab order runs through the step buttons`, /Report/.test(prior ?? ''), prior ?? '');
  await page.keyboard.press('Enter');
  check(`${label}: a step opens from the keyboard`, (await step()) === 'report' && (await headingFocused()));
  await page.reload();
  await page.waitForLoadState('networkidle');
  await pick('An AI builds software for me');
  await page.keyboard.press('Tab');
  check(`${label}: Tab moves forward from the heading`, (await page.evaluate(() => document.activeElement?.tagName)) !== 'BODY');

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
