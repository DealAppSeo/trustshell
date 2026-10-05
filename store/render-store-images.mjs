#!/usr/bin/env node
/**
 * Every image the Chrome Web Store asks for, drawn from the real thing.
 *
 *   extension/icons/icon{16,32,48,128}.png  toolbar icon and the store icon (128 is required)
 *   store/promo-small.png                   440x280, required
 *   store/promo-marquee.png                 1400x560, optional
 *   store/screenshots/veto.png              1280x800: Caught
 *   store/screenshots/pass.png              1280x800: Checks out
 *   store/screenshots/not-checked.png       1280x800: Not checked
 *
 * THE SCREENSHOTS ARE THE REAL EXTENSION AND REAL VERDICTS. This folder's extension is loaded into
 * Chromium, and a plain chat page is served on a host it runs on. Each classify call it makes is
 * forwarded to production unchanged, and production's answer is what the stamp shows. The chat page
 * is ours and neutral on purpose: a listing must not look like another company's product.
 * The sentences were measured on 2026-10-05: the speed trap came back veto 3 of 3 (lib/home-samples.ts),
 * the opinion came back not-checked, and the ocean line came back pass. A shot is saved only if the
 * stamp reads the word it is meant to show, so a changed answer fails here rather than shipping a
 * picture of something else.
 *
 * The drawn mock-ups this replaces (render-shots.ps1) showed the words without the extension.
 *
 *     PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node store/render-store-images.mjs
 *
 * Exit codes: 0 every image written, 1 a stamp read the wrong word, 2 NOT_CHECKED (no browser, or
 * production could not be reached). Icons and promo tiles need no network.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAUNCH_ARGS, loadPlaywrightOrExit } from '../tests/e2e/chromium-path.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXT = join(ROOT, 'extension');
const SHOTS = join(ROOT, 'store', 'screenshots');
const CLASSIFY = 'https://repid-engine-production.up.railway.app/api/v1/classify';

const NAVY = '#0f172a';
const AMBER = '#f59e0b';

/** The mark: an amber seal on navy. `pad` is the transparent margin the store asks for at 128. */
function iconSvg(size, pad) {
  const box = size - pad * 2;
  const c = size / 2;
  const r = box * 0.27;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs><filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="0" dy="0" stdDeviation="${pad ? 1.5 : 0}" flood-color="#ffffff" flood-opacity="0.55"/>
  </filter></defs>
  <rect x="${pad}" y="${pad}" width="${box}" height="${box}" rx="${box * 0.22}" fill="${NAVY}" filter="url(#glow)"/>
  <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${AMBER}" stroke-width="${box * 0.075}"/>
  <circle cx="${c}" cy="${c}" r="${box * 0.105}" fill="${AMBER}"/>
</svg>`;
}

/** The store asks promo tiles to carry little text, so the small one is the mark and the name only. */
function promoHtml(w, h, chips) {
  const mark = Math.round(h * (chips ? 0.42 : 0.4));
  const word = Math.round(chips ? h * 0.16 : w * 0.11);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden}
  body{display:flex;align-items:center;justify-content:center;gap:${Math.round(h * 0.08)}px;
    background:radial-gradient(circle at 30% 40%,#312e81 0%,#1e1b4b 45%,#0b1020 100%);
    font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:#fff}
  .word{font-size:${word}px;font-weight:800;letter-spacing:-0.02em;margin:0}
  .chips{display:flex;gap:${Math.round(h * 0.03)}px;margin-top:${Math.round(h * 0.05)}px}
  .chip{font-size:${Math.round(h * 0.055)}px;font-weight:700;padding:${Math.round(h * 0.02)}px ${Math.round(h * 0.04)}px;
    border-radius:999px;border:2px solid #f59e0b;color:#fde68a;white-space:nowrap}
  .chip.dim{border-color:#64748b;color:#cbd5e1}
  </style></head><body>
  <div style="width:${mark}px;height:${mark}px;flex:none">${iconSvg(mark, 0)}</div>
  <div><p class="word">TrustShell</p>${chips
    ? '<div class="chips"><span class="chip">Checks out</span><span class="chip">Caught</span><span class="chip dim">Not checked</span></div>'
    : ''}</div>
  </body></html>`;
}

/**
 * A plain chat page on a host the extension runs on. The selectors are the ones content.js reads
 * on chatgpt.com; the look is deliberately our own, so the picture claims nothing about that site.
 */
function chatHtml(caption, question, reply) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Chat</title><style>
  body{margin:0;background:#f8fafc;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:#0f172a}
  .band{background:${NAVY};color:#fff;height:132px;display:flex;align-items:center;gap:20px;padding:0 72px}
  .band p{margin:0;font-size:34px;font-weight:700;letter-spacing:-0.01em}
  .band span{display:inline-block;width:40px;height:40px}
  main{max-width:820px;margin:44px auto 0;padding:0 24px}
  .who{font-size:14px;font-weight:700;color:#64748b;margin:0 0 8px}
  .user{background:#e2e8f0;border-radius:18px;padding:14px 20px;margin:0 0 28px auto;max-width:560px;font-size:19px}
  [data-message-author-role="assistant"]{background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:18px 22px;font-size:20px;line-height:1.5}
  [data-message-author-role="assistant"] p{margin:0}
  </style></head><body>
  <div class="band"><span>${iconSvg(40, 0)}</span><p>${caption}</p></div>
  <main>
    <p class="who" style="text-align:right">You</p>
    <div data-message-author-role="user" class="user"><p>${question}</p></div>
    <p class="who">Assistant</p>
    <div data-message-author-role="assistant"><p>${reply}</p></div>
  </main></body></html>`;
}

const SCENES = [
  {
    file: 'veto.png',
    word: 'Caught',
    caption: 'A sure answer that is wrong gets Caught.',
    question: 'I drove 60 miles at 30 mph and came back at 60 mph. What was my average speed?',
    reply: 'If you drive 60 miles at 30 mph and drive back at 60 mph, your average speed for the trip is 45 mph.',
  },
  {
    file: 'pass.png',
    word: 'Checks out',
    caption: 'Two other models read every reply.',
    question: 'Which ocean is the biggest?',
    reply: 'The Pacific Ocean is the largest and deepest ocean on Earth.',
  },
  {
    file: 'not-checked.png',
    word: 'Not checked',
    caption: 'Nothing to check is Not checked, never a pass.',
    question: 'What is the best food?',
    reply: 'Pizza is the best food.',
  },
];

/** Production's own answer, forwarded unchanged. curl honours this machine's proxy settings. */
function askProduction(body) {
  const out = execFileSync('curl', ['-sS', '-m', '30', '-X', 'POST', CLASSIFY, '-H', 'content-type: application/json',
    '--data-binary', '@-', '-w', '\n%{http_code}'], { input: body, encoding: 'utf8' });
  const cut = out.lastIndexOf('\n');
  return { status: Number(out.slice(cut + 1)), body: out.slice(0, cut) };
}

const { chromium } = await loadPlaywrightOrExit();
const browser = await chromium.launch({ channel: 'chromium', headless: true, args: LAUNCH_ARGS }).catch((err) => {
  console.error(`NOT_CHECKED: Chromium did not launch: ${String(err && err.message).split('\n')[0]}`);
  process.exit(2);
});

// ---- icons and promo tiles: no network ----------------------------------------------------------
const flat = await browser.newPage();
mkdirSync(join(EXT, 'icons'), { recursive: true });
for (const size of [16, 32, 48, 128]) {
  // The store asks for 16px of transparent padding at 128. The toolbar sizes fill their square.
  const pad = size === 128 ? 16 : 0;
  await flat.setViewportSize({ width: size, height: size });
  await flat.setContent(`<html><body style="margin:0;background:transparent">${iconSvg(size, pad)}</body></html>`);
  await flat.screenshot({ path: join(EXT, 'icons', `icon${size}.png`), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log(`wrote extension/icons/icon${size}.png`);
}
for (const [name, w, h, chips] of [['promo-small.png', 440, 280, false], ['promo-marquee.png', 1400, 560, true]]) {
  await flat.setViewportSize({ width: w, height: h });
  await flat.setContent(promoHtml(w, h, chips));
  const fits = await flat.evaluate(() => document.body.scrollWidth <= innerWidth && document.body.scrollHeight <= innerHeight);
  if (!fits) {
    console.error(`FAILED     store/${name}: the artwork overflows ${w}x${h}. Nothing saved.`);
    process.exit(1);
  }
  await flat.screenshot({ path: join(ROOT, 'store', name), clip: { x: 0, y: 0, width: w, height: h } });
  console.log(`wrote store/${name}`);
}
await browser.close();

// ---- screenshots: the real extension, production's real answers --------------------------------
const userDataDir = mkdtempSync(join(tmpdir(), 'trustshell-store-shots-'));
let failed = 0;
let context;
try {
  context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: [...LAUNCH_ARGS, `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  let scene = SCENES[0];
  await context.route(CLASSIFY, async (route) => {
    const req = route.request();
    const cors = {
      'access-control-allow-origin': req.headers()['origin'] || '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
    };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    let answer;
    try {
      answer = askProduction(req.postData() || '');
    } catch (err) {
      console.error(`NOT_CHECKED: production did not answer: ${String(err && err.message).split('\n')[0]}`);
      process.exit(2);
    }
    console.log(`  production answered ${answer.status} ${answer.body}`);
    return route.fulfill({ status: answer.status, headers: { ...cors, 'content-type': 'application/json' }, body: answer.body });
  });
  await context.route('https://chatgpt.com/**', (route) =>
    route.request().resourceType() === 'document'
      ? route.fulfill({ status: 200, contentType: 'text/html', body: chatHtml(scene.caption, scene.question, scene.reply) })
      : route.abort());

  for (const s of SCENES) {
    // One checker's free tier allows 4 calls a minute; spacing the calls keeps the usual pair voting.
    if (s !== SCENES[0]) await new Promise((r) => setTimeout(r, 20_000));
    scene = s;
    const page = await context.newPage();
    await page.goto(`https://chatgpt.com/c/store-${s.file.replace('.png', '')}`);
    let read = '';
    const until = Date.now() + 40_000;
    while (Date.now() < until) {
      read = await page.evaluate(() => document.querySelector('.ts-stamp')?.innerText || '');
      if (read && !/^Checking/.test(read)) break;
      await page.waitForTimeout(250);
    }
    const first = read.split('\n')[0].trim();
    if (first !== s.word) {
      failed++;
      console.error(`FAILED     ${s.file}: the stamp reads ${JSON.stringify(read)}, not ${s.word}. Nothing saved.`);
    } else {
      await page.screenshot({ path: join(SHOTS, s.file) });
      console.log(`wrote store/screenshots/${s.file} (${JSON.stringify(read)})`);
    }
    await page.close();
  }
} finally {
  if (context) await context.close();
  rmSync(userDataDir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
