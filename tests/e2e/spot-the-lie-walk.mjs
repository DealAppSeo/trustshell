/**
 * The audience pages and the "spot the lie" game, in a real browser (hero v2, 2026-10-24).
 *
 * tests/spot-the-lie.test.ts and tests/audiences.test.ts hold the pool, the rules and the server render.
 * This holds what only a browser shows: that a round can be played with the mouse and the keyboard; that
 * the reveal says what the rules say; that the score is the number of right answers; that the share link
 * is copied; that NOTHING IS SENT, on load or while playing (no fetch, no XHR, no beacon, and no request
 * at all to the engine's address); that the three pages and the home page have no sideways scroll on a
 * phone; that a footnote link lands on its source.
 *
 *   node tests/e2e/spot-the-lie-walk.mjs
 *
 * Builds the app and serves it, like its siblings. Not in gating CI (needs a browser and a build).
 * The engine address is a port nothing listens on, so a stray call to it is a failed request we can count.
 */
import { chromiumExecutablePath, LAUNCH_ARGS, loadPlaywrightOrExit, spawnNext } from './chromium-path.mjs';

const { chromium } = await loadPlaywrightOrExit();

const APP_PORT = 3102;
const DEAD_ENGINE = 'http://127.0.0.1:4609';
const base = `http://127.0.0.1:${APP_PORT}`;
const PAGES = ['/', '/for/openclaw', '/for/vibe-coders', '/for/erc'];

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

try {
  const probe = await fetch(`http://127.0.0.1:${APP_PORT}/`, { signal: AbortSignal.timeout(2000) });
  if (probe) {
    console.error(`NOT_CHECKED: port ${APP_PORT} is already serving; this suite will not test a server it did not start.`);
    process.exit(2);
  }
} catch { /* nothing listening: the state we want */ }

const env = { ...process.env, NEXT_PUBLIC_REPID_ENGINE_URL: DEAD_ENGINE };
const build = spawnNext(['build'], { env, stdio: 'ignore' });
const code = await new Promise((r) => build.on('exit', r));
if (code !== 0) {
  console.error(`FATAL: next build exited ${code}`);
  process.exit(1);
}
const app = spawnNext(['start', '--port', String(APP_PORT)], { env, stdio: 'ignore' });
const stop = () => { try { app.kill('SIGKILL'); } catch { /* gone */ } };
process.on('exit', stop);

try {
  if (!(await waitForApp(`${base}/for/vibe-coders`))) throw new Error('app never became ready');
  const browser = await chromium.launch({ executablePath: chromiumExecutablePath(), args: LAUNCH_ARGS });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
    const page = await ctx.newPage();
    const sent = []; // fetch / xhr / ping / beacon requests, and anything aimed at the engine
    const failedToEngine = [];
    page.on('request', (r) => {
      if (['fetch', 'xhr', 'ping', 'beacon'].includes(r.resourceType())) sent.push(`${r.method()} ${r.url()}`);
    });
    page.on('requestfailed', (r) => { if (r.url().startsWith(DEAD_ENGINE)) failedToEngine.push(r.url()); });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));

    // 1. The three audience pages render, on desktop: one h1, a primary action, sources, and a footnote that lands.
    for (const path of PAGES.slice(1)) {
      await page.goto(base + path, { waitUntil: 'networkidle' });
      const h1s = await page.locator('h1').count();
      check(`${path}: exactly one h1`, h1s === 1, `${h1s} found`);
      check(`${path}: has a primary action`, (await page.getByTestId('aud-primary').count()) === 1);
      const sources = await page.getByTestId('aud-sources').locator('li').count();
      check(`${path}: lists its sources at the bottom`, sources >= 1, `${sources} sources`);
      const fear = await page.getByTestId('aud-does-not').count();
      check(`${path}: says what it does not do under every fear`, fear >= 2, `${fear} blocks`);
      await page.locator('a[href="#src-1"]').first().click();
      const inView = await page.locator('#src-1').evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.top >= 0 && r.top < window.innerHeight;
      });
      check(`${path}: a footnote link lands on its source`, inView);
    }
    check('no request left the pages on load (fetch / xhr / beacon): audience pages', sent.length === 0, sent.join('; '));

    // 2. Play the game with the mouse, five rounds, and check each reveal against the rules.
    await page.goto(`${base}/for/vibe-coders`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000); // the page is server-rendered before React attaches: a click that lands first does nothing
    check('game: starts at the intro, with nothing drawn', (await page.getByTestId('spot-the-lie').getAttribute('data-phase')) === 'intro');
    await page.getByTestId('stl-play').click();
    await page.getByTestId('stl-statement').waitFor({ state: 'visible', timeout: 10_000 });

    const plan = ['lie', 'true', 'unsure', 'lie', 'true'];
    let rights = 0;
    let revealOk = true;
    let revealNote = '';
    for (let round = 0; round < 5; round++) {
      const statement = (await page.getByTestId('stl-statement').innerText()).trim();
      const guess = plan[round];
      await page.getByTestId(`stl-${guess}`).click();
      const reveal = await page.getByTestId('stl-reveal').innerText();
      const verdict = await page.getByTestId('stl-verdict').getAttribute('data-verdict');
      const truth = /This one is true\./.test(reveal) ? 'true' : /This one is a lie\./.test(reveal) ? 'lie' : null;
      const checkers = await page.getByTestId('stl-checkers').innerText();
      const notChecked = /Not checked/.test(checkers);
      let expected;
      if (guess === truth) expected = 'right';
      else if (guess === 'unsure' && notChecked) expected = 'honest';
      else expected = 'wrong';
      if (verdict !== expected || truth === null || !/recorded runs/.test(checkers) || !/See the runs/.test(checkers)) {
        revealOk = false;
        revealNote += ` [round ${round + 1}: "${statement.slice(0, 30)}" guess ${guess}, truth ${truth}, verdict ${verdict}, expected ${expected}]`;
      }
      if (verdict === 'right') rights += 1;
      const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
      if (focused !== 'stl-reveal') { revealOk = false; revealNote += ` [round ${round + 1}: focus is on ${focused}, not the reveal]`; }
      await page.getByTestId('stl-next').click();
    }
    check('game: every reveal names the truth, the verdict the rules give, and a recorded run with a link', revealOk, revealNote);
    await page.getByTestId('spot-the-lie').locator('[data-testid="stl-score"]').waitFor({ state: 'visible' });
    const shown = (await page.getByTestId('stl-score').innerText()).trim();
    check('game: the score is the number of right answers', shown === `${rights} of 5`, `shows "${shown}", rights ${rights}`);
    check('game: a line of encouragement is shown', ((await page.getByTestId('stl-line').innerText()).trim().length) > 10);
    check('game: offers to check your own answer, to challenge a friend, and to play again',
      (await page.getByTestId('stl-check-own').count()) === 1 && (await page.getByTestId('stl-share').count()) === 1 && (await page.getByTestId('stl-again').count()) === 1);

    // 3. The challenge link is copied, with the score and the tagged path.
    await page.getByTestId('stl-share').click();
    await page.waitForTimeout(300);
    const note = (await page.getByTestId('stl-share-note').innerText()).trim();
    const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    check('share: copies the text with the score and the tagged path', /Copied/.test(note) && clip.includes(`${rights} of 5`) && clip.includes('/for/vibe-coders?utm_source=share&utm_medium=spot-the-lie'), `note "${note}", clip "${clip.slice(0, 80)}"`);

    // 4. Nothing was sent: not on load, not while playing, not on share.
    check('NOTHING SENT while playing five rounds and sharing (no fetch, xhr, beacon)', sent.length === 0, sent.join('; '));
    check('no request to the engine address, failed or otherwise', failedToEngine.length === 0, failedToEngine.join('; '));

    // 5. Play again gives a round; the best score is kept on this device only.
    await page.getByTestId('stl-again').click();
    await page.getByTestId('stl-statement').waitFor({ state: 'visible', timeout: 10_000 });
    check('game: play again starts a new round', (await page.getByTestId('spot-the-lie').getAttribute('data-phase')) === 'play');
    const best = await page.evaluate(() => window.localStorage.getItem('trustshell_spot_the_lie_best_v1'));
    check('game: the best score is stored locally only when there is one to keep', rights === 0 ? best === null : best === String(rights), `rights ${rights}, stored ${best}`);

    // 6. The keyboard alone can play: Tab to Play, Enter, then the statement is focused.
    await page.goto(`${base}/for/vibe-coders`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.getByTestId('stl-play').focus();
    await page.keyboard.press('Enter');
    await page.getByTestId('stl-statement').waitFor({ state: 'visible', timeout: 10_000 });
    const focusedStatement = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    check('keyboard: Enter on Play moves focus to the statement', focusedStatement === 'stl-statement', `focus on ${focusedStatement}`);
    await page.keyboard.press('Tab');
    const nextFocus = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    check('keyboard: Tab goes to the first guess', nextFocus === 'stl-true', `focus on ${nextFocus}`);

    // 7. The home page links to the game and the game link works.
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    const link = page.getByTestId('hero-play-link');
    check('home: has the quiet link to the game', (await link.count()) === 1);
    await page.waitForTimeout(1500);
    await link.click();
    await page.waitForURL('**/for/vibe-coders', { timeout: 10_000 });
    check('home: the link lands on the game page', (await page.getByTestId('spot-the-lie').count()) === 1);

    // 8. A phone: no sideways scroll on any of the four, and every button is a comfortable target.
    const phone = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
    const pp = await phone.newPage();
    for (const path of PAGES) {
      await pp.goto(base + path, { waitUntil: 'networkidle' });
      const over = await pp.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
      check(`phone 375px ${path}: no sideways scroll`, over <= 1, `${over}px over`);
    }
    await pp.goto(`${base}/for/vibe-coders`, { waitUntil: 'networkidle' });
    await pp.waitForTimeout(2000);
    await pp.getByTestId('stl-play').click();
    await pp.getByTestId('stl-statement').waitFor({ state: 'visible', timeout: 10_000 });
    const heights = await pp.getByTestId('stl-true').evaluate((el) => el.getBoundingClientRect().height);
    check('phone: the guess buttons are at least 44px tall', heights >= 44, `${heights}px`);
    await pp.getByTestId('stl-lie').click();
    const over2 = await pp.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
    check('phone: the reveal does not scroll sideways, with reduced motion on', over2 <= 1, `${over2}px over`);

    check('no script errors on any page', pageErrors.length === 0, pageErrors.join('; '));
  } finally {
    await browser.close();
  }
} catch (e) {
  check('walk completed', false, String(e && e.message ? e.message : e).split('\n')[0]);
} finally {
  stop();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length === 0 ? 0 : 1);
