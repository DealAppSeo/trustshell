/**
 * The post-check conversation (onboarding v0, SHADOW), in a real browser, on the preview route /lab/talk.
 *
 * tests/onboarding-talk.test.ts holds the pace rules, the wording, the quotes, the contrast math and the
 * source scan. This holds what only a browser shows: that nothing is asked until the person says yes; that a
 * conversation can be walked with the mouse and the keyboard; that the tint appears, can be undone and does
 * not block a click; that NOTHING IS SENT through a whole conversation, a keep, a reload, a download and a
 * delete; that what is kept is what the person answered and expires with a date; that the download is that
 * card and nothing else; that the home page shows none of it while the flag is off; that a phone has no
 * sideways scroll and tap targets of 44px or more.
 *
 *   node tests/e2e/onboarding-talk-walk.mjs
 *
 * Builds the app and serves it, like its siblings. Not in gating CI (needs a browser and a build).
 * Math.random is pinned per run (0.1 = the fun questions fire, 0.9 = they do not) so a run is repeatable.
 * The engine address is a port nothing listens on, so a stray call to it is a failed request we can count.
 */
import { chromiumExecutablePath, LAUNCH_ARGS, loadPlaywrightOrExit, spawnNext } from './chromium-path.mjs';

const { chromium } = await loadPlaywrightOrExit();

const APP_PORT = 3107;
const DEAD_ENGINE = 'http://127.0.0.1:4611';
const base = `http://127.0.0.1:${APP_PORT}`;
const KEY = 'trustshell_onboarding_v1';

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
delete env.NEXT_PUBLIC_ONBOARDING_TALK; // the flag stays OFF: the home page must show none of it
delete env.VERCEL_ENV;
const build = spawnNext(['build'], { env, stdio: 'ignore' });
const code = await new Promise((r) => build.on('exit', r));
if (code !== 0) {
  console.error(`FATAL: next build exited ${code}`);
  process.exit(1);
}
const app = spawnNext(['start', '--port', String(APP_PORT)], { env, stdio: 'ignore' });
const stop = () => { try { app.kill('SIGKILL'); } catch { /* gone */ } };
process.on('exit', stop);

/** Which question is on screen, from its stated reason (each question's `why` is its own words). */
const WHY = [
  [/first thing to try/, 'job'], [/pick which page/, 'role'], [/examples can use software/, 'tools'], [/second opinion would help/, 'wish'],
  [/pitched at the right level/, 'experience'], [/tint this page/, 'color'], [/show you that line/, 'book'],
];
const idOf = (why) => (WHY.find(([re]) => re.test(why)) ?? [null, 'unknown'])[1];

/** Walk a whole pass, answering by the question on screen. Returns the ids asked, in order. */
async function converse(page, a = {}) {
  const seen = [];
  const answers = { job: 'Coding', role: 'Vibe-coder', experience: 'Some', tools: 'Figma, Notion', wish: 'my invoices', color: a.color ?? 'blue', book: a.book ?? 'Frankenstein' };
  let lastWhy = '';
  for (let i = 0; i < 12; i++) {
    const phase = await page.getByTestId('talk').getAttribute('data-phase');
    if (phase === 'done') break;
    await page.getByTestId('talk-why').waitFor({ state: 'visible', timeout: 5000 });
    let why = await page.getByTestId('talk-why').innerText();
    if (why === lastWhy) { await page.waitForTimeout(250); continue; }
    lastWhy = why;
    const id = idOf(why);
    seen.push(id);
    const options = await page.getByTestId('talk-option').allInnerTexts();
    if (options.includes(answers[id])) await page.getByTestId('talk-option').filter({ hasText: new RegExp(`^${answers[id]}$`) }).click();
    else {
      await page.getByTestId('talk-input').fill(answers[id]);
      await page.getByTestId('talk-send').click();
    }
    await page.waitForTimeout(200);
  }
  return seen;
}

try {
  if (!(await waitForApp(`${base}/lab/talk`))) throw new Error('app never became ready');
  const browser = await chromium.launch({ executablePath: chromiumExecutablePath(), args: LAUNCH_ARGS });
  const sent = []; // fetch / xhr / ping / beacon that is not the router's own page-code prefetch
  const prefetch = []; // same-origin page-code prefetches (a Link scrolled into view), listed so they can be inspected
  const failedToEngine = [];
  const pageErrors = [];

  async function newPage(randomValue, opts = {}) {
    const ctx = await browser.newContext({ viewport: opts.viewport ?? { width: 1280, height: 900 }, reducedMotion: opts.reducedMotion, acceptDownloads: true });
    await ctx.addInitScript((v) => { Math.random = () => v; }, randomValue);
    const page = await ctx.newPage();
    page.on('request', (r) => {
      if (!['fetch', 'xhr', 'ping', 'beacon'].includes(r.resourceType())) return;
      const h = r.headers();
      if ((h.rsc || h['next-router-prefetch']) && r.url().startsWith(base)) prefetch.push(`${r.method()} ${r.url()} body=${r.postData() ?? ''}`);
      else sent.push(`${r.method()} ${r.url()}`);
    });
    page.on('requestfailed', (r) => { if (r.url().startsWith(DEAD_ENGINE)) failedToEngine.push(r.url()); });
    page.on('pageerror', (e) => pageErrors.push(e.message));
    return { ctx, page };
  }
  const goLab = async (page) => { await page.goto(`${base}/lab/talk`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500); };
  const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  try {
    // 1. The invite: a yes or no first, with the disclosure; nothing asked, nothing stored, no tint.
    {
      const { ctx, page } = await newPage(0.1);
      await goLab(page);
      check('lab: the preview banner is shown', (await page.getByTestId('lab-banner').count()) === 1);
      check('invite: first, a yes or no', (await page.getByTestId('talk').getAttribute('data-phase')) === 'invite');
      const disc = await page.getByTestId('talk-disclosure').innerText();
      check('invite: says it is a scripted guide, not an AI model, and where the answers stay', /scripted guide/.test(disc) && /does not use an AI model/.test(disc) && /stay in this browser/.test(disc), disc.slice(0, 90));
      check('invite: nothing is asked before yes (no input on screen)', (await page.getByTestId('talk-input').count()) === 0);
      check('invite: no tint, nothing stored', (await page.getByTestId('talk-tint').count()) === 0 && (await page.evaluate((k) => localStorage.getItem(k), KEY)) === null);
      await page.getByTestId('talk-no').click();
      check('invite: "No thanks" removes it, stores nothing', (await page.getByTestId('talk').count()) === 0 && (await page.evaluate((k) => localStorage.getItem(k), KEY)) === null);
      await ctx.close();
    }

    // 2. A pass where the fun questions fire (random 0.1): job, role, THEN color, then tools; the tint appears and can be undone.
    {
      const { ctx, page } = await newPage(0.1);
      await goLab(page);
      await page.getByTestId('talk-yes').click();
      check('keyboard: after Yes, focus is in the answer box', await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'talk-input'));
      check('question: the first one says why it is asked', /first thing to try/.test(await page.getByTestId('talk-why').innerText()));
      const seen = await converse(page);
      check('pace: first pass is job, role, color, tools (fun question third, never last, one only)', seen.join(',') === 'job,role,color,tools', seen.join(','));
      const log = await page.getByTestId('talk-log').innerText();
      check('responsive: the role question quoted the job back', /You said "Coding"/.test(log));
      check('responsive: the tools question used the role', /As a vibe-coder/.test(log));
      check('tint: a layer appeared after the color, and it does not block clicks', (await page.getByTestId('talk-tint').count()) === 1 && (await page.getByTestId('talk-tint').evaluate((el) => getComputedStyle(el).pointerEvents)) === 'none');
      const bg = await page.getByTestId('talk-tint').evaluate((el) => getComputedStyle(el).backgroundColor);
      check('tint: faint (alpha 0.08)', /0\.08/.test(bg), bg);
      const reflect = await page.getByTestId('talk-reflect').innerText();
      check('teach-back: says what it heard, in the person\'s words', /"Coding"/.test(reflect) && /vibe-coder/.test(reflect) && /"Figma, Notion"/.test(reflect), reflect.slice(0, 120));
      check('next step: matches the role (vibe-coder to the game page)', (await page.getByTestId('talk-next').getAttribute('href')) === '/for/vibe-coders');
      check('storage: nothing is stored until Keep is clicked', (await page.evaluate((k) => localStorage.getItem(k), KEY)) === null);
      check('storage: the card says it is not kept', /Not kept/.test(await page.getByTestId('talk-note').innerText()));
      await page.getByTestId('talk-undo-tint').click();
      check('tint: Undo removes it', (await page.getByTestId('talk-tint').count()) === 0);
      await ctx.close();
    }

    // 3. Keep, reload, download, delete; and a book from the menu comes back with a source, after more questions.
    {
      const { ctx, page } = await newPage(0.1);
      await goLab(page);
      await page.getByTestId('talk-yes').click();
      await converse(page);
      await page.getByTestId('talk-more').click();
      const more = await converse(page, { book: 'Frankenstein' });
      check('keep going: book (from a menu), then wish, then experience; the fun one never follows a fun one', more.join(',') === 'book,wish,experience', more.join(','));
      const quote = await page.getByTestId('talk-quote').innerText();
      check('quote: the line from the menu book, its chapter, and a Project Gutenberg source', /Frankenstein/.test(quote) && /dreary night of November/.test(quote) && /Chapter 5/.test(quote), quote.slice(0, 100));
      check('quote: the source link goes to Gutenberg', (await page.getByTestId('talk-quote').locator('a').getAttribute('href')) === 'https://www.gutenberg.org/ebooks/84');

      const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('talk-download').click()]);
      const file = JSON.parse(await (await import('node:fs/promises')).readFile(await download.path(), 'utf8'));
      const allowed = ['v', 'about', 'job', 'role', 'tools', 'wish', 'experience', 'color', 'book', 'savedAt'];
      check('download: a JSON card with only the allowed keys', Object.keys(file).every((k) => allowed.includes(k)) && file.v === 1, Object.keys(file).join(','));
      check('download: carries what was answered and says what made it', file.job === 'Coding' && file.role === 'vibe-coder' && file.book === 'Frankenstein' && /No AI model was used/.test(file.about));
      check('download: the file name', download.suggestedFilename() === 'trustshell-how-i-work.json');

      await page.getByTestId('talk-keep').click();
      const stored = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), KEY));
      check('keep: stores one key, with a date, and the same card', typeof stored.savedAt === 'string' && stored.job === 'Coding' && stored.book === 'Frankenstein', Object.keys(stored).join(','));
      check('keep: says it expires', /expires in 90 days/.test(await page.getByTestId('talk-note').innerText()));

      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      check('reload: a kept card comes back as "What I heard", with the tint they chose', (await page.getByTestId('talk').getAttribute('data-phase')) === 'done' && (await page.getByTestId('talk-tint').count()) === 1);

      await page.getByTestId('talk-undo-tint').click();
      const afterUndo = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), KEY));
      check('undo tint: forgets the color in the kept card too', afterUndo.color === undefined && afterUndo.job === 'Coding');

      await page.getByTestId('talk-clear').click();
      check('delete: the kept card is gone and the invite is back', (await page.evaluate((k) => localStorage.getItem(k), KEY)) === null && (await page.getByTestId('talk').getAttribute('data-phase')) === 'invite');
      await ctx.close();
    }

    // 4. A title typed that is not on the menu: said so, not kept, no quote. A kept card past its date is ignored.
    {
      const { ctx, page } = await newPage(0.1);
      await goLab(page);
      await page.getByTestId('talk-yes').click();
      await converse(page);
      await page.getByTestId('talk-more').click();
      await converse(page, { book: 'Dune' });
      const log = await page.getByTestId('talk-log').innerText();
      check('not on the menu: it says it will not guess and did not keep it', /will not guess at that one, and I did not keep it/.test(log));
      check('not on the menu: no quote shown', (await page.getByTestId('talk-quote').count()) === 0);
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('talk-download').click()]);
      const file = JSON.parse(await (await import('node:fs/promises')).readFile(await download.path(), 'utf8'));
      check('not on the menu: the typed title is not in the download', file.book === undefined && !JSON.stringify(file).includes('Dune'));
      await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ v: 1, job: 'Coding', role: 'engineer', savedAt: '2026-01-01T00:00:00Z' })), KEY);
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      check('expiry: a card saved long ago is ignored', (await page.getByTestId('talk').getAttribute('data-phase')) === 'invite');
      await ctx.close();
    }

    // 5. A pass where the fun questions do not fire (random 0.9): three core only, and Skip is as big as Send.
    {
      const { ctx, page } = await newPage(0.9, { viewport: { width: 375, height: 800 } });
      await goLab(page);
      check('phone 375px: invite has no sideways scroll', (await overflow(page)) <= 0);
      await page.getByTestId('talk-yes').click();
      const skip = await page.getByTestId('talk-skip').boundingBox();
      const send = await page.getByTestId('talk-send').boundingBox();
      check('phone: Skip is a button at least 44px tall, the same size as Send', skip.height >= 44 && Math.abs(skip.height - send.height) < 2, `skip ${skip.height} send ${send.height}`);
      const opt = await page.getByTestId('talk-option').first().boundingBox();
      check('phone: quick answers are at least 44px tall', opt.height >= 44, `${opt.height}px`);
      await page.getByTestId('talk-skip').click(); // skip the first question
      const seen = await converse(page);
      check('pace: with no fun question the pass is three questions, and a skipped one counted as a turn', seen.length === 2, seen.join(','));
      check('phone: mid-conversation and done have no sideways scroll', (await overflow(page)) <= 0);
      const reflect = await page.getByTestId('talk-reflect').innerText();
      check('teach-back: a skipped question is not claimed (no "help with" line)', !/help with/.test(reflect), reflect.slice(0, 100));
      await ctx.close();
    }

    // 6. Reduced motion: the tint does not animate.
    {
      const { ctx, page } = await newPage(0.1, { reducedMotion: 'reduce' });
      await goLab(page);
      await page.getByTestId('talk-yes').click();
      await converse(page);
      const dur = await page.getByTestId('talk-tint').evaluate((el) => getComputedStyle(el).transitionDuration);
      check('reduced motion: the tint does not animate (the site sets a near-zero duration under the setting)', dur.split(',').every((d) => parseFloat(d) <= 0.001), dur);
      await ctx.close();
    }

    // 7. The home page shows none of this while the flag is off.
    {
      const { ctx, page } = await newPage(0.1);
      await page.goto(`${base}/`, { waitUntil: 'networkidle' });
      check('home: no conversation on the first page while the flag is off', (await page.getByTestId('talk').count()) === 0);
      await ctx.close();
    }

    // 8. Nothing was sent, through all of it. Router prefetches of this site's own pages are listed, and carry no answer.
    check('NOTHING SENT through invites, answers, tint, keep, reload, download and delete (no fetch, xhr, beacon)', sent.length === 0, sent.join('; '));
    check('no request to the engine address, failed or otherwise', failedToEngine.length === 0, failedToEngine.join('; '));
    const leak = prefetch.filter((p) => /Coding|Figma|Notion|invoices|Frankenstein|blue|Dune|vibe/i.test(p.replace(/for\/vibe-coders/g, '')));
    check('router prefetches (this site\'s own pages) carry no answer', leak.length === 0, `${prefetch.length} prefetches; ${leak.join('; ')}`);
    check('no script errors on any page', pageErrors.length === 0, pageErrors.join('; '));
  } finally {
    await browser.close();
  }
} catch (e) {
  check('walk completed', false, String(e && e.message ? e.message : e));
} finally {
  stop();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
