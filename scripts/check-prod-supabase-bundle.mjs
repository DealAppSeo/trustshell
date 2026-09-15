#!/usr/bin/env node
/**
 * Production probe for CC2 #60 / #58 — the live-stats key-swap.
 *
 * The Next.js bundle inlines NEXT_PUBLIC_* at build time. A Vercel env that
 * still holds the legacy anon JWT (disabled 2026-08-04) ships that JWT to
 * every visitor. A cached rebuild can serve the old key after the env is
 * already correct. This script is the proof MORNING.md asked for: fetch the
 * live HTML, fetch each JS chunk, count dead JWTs vs sb_publishable_ keys.
 *
 * Outcomes (never collapse NOT_CHECKED into 0):
 *   0 VERIFIED     — ≥1 sb_publishable_, 0 eyJ JWTs in JS
 *   1 FAILED       — a dead JWT is still in the bundle, or no publishable key
 *   3 NOT_CHECKED  — could not fetch the site / bundles
 *
 *   node scripts/check-prod-supabase-bundle.mjs [--url https://trustshell.dev]
 */
const ORIGIN = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : 'https://trustshell.dev';

const JWT = /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g;
const PUB = /sb_publishable_[A-Za-z0-9_-]+/g;

async function get(url) {
  const res = await fetch(url, { redirect: 'follow' });
  const text = await res.text();
  return { status: res.status, text, finalUrl: res.url };
}

function abs(src) {
  if (src.startsWith('http')) return src;
  if (src.startsWith('//')) return `https:${src}`;
  return new URL(src, ORIGIN).href;
}

try {
  const html = await get(ORIGIN);
  if (html.status !== 200) {
    console.error(`NOT_CHECKED html HTTP ${html.status}`);
    process.exit(3);
  }
  const srcs = [...html.text.matchAll(/src="([^"]+\.js[^"]*)"/g)].map((m) => abs(m[1]));
  if (srcs.length === 0) {
    console.error('NOT_CHECKED no script src= in HTML');
    process.exit(3);
  }

  let jwt = 0;
  let pub = 0;
  const hits = [];
  for (const url of srcs) {
    const body = await get(url);
    if (body.status !== 200) continue;
    const j = (body.text.match(JWT) || []).length;
    const p = (body.text.match(PUB) || []).length;
    if (j || p) hits.push({ url, jwt: j, pub: p });
    jwt += j;
    pub += p;
  }

  console.log(JSON.stringify({ origin: ORIGIN, scripts: srcs.length, jwt, pub, hits }, null, 2));

  if (jwt > 0) {
    console.error(`FAILED dead JWT still inlined (${jwt}); publishable=${pub}`);
    process.exit(1);
  }
  if (pub < 1) {
    console.error('FAILED no sb_publishable_ key inlined');
    process.exit(1);
  }
  console.error('VERIFIED bundle ships publishable key, no legacy JWT');
  process.exit(0);
} catch (err) {
  console.error(`NOT_CHECKED ${err instanceof Error ? err.message : err}`);
  process.exit(3);
}
