#!/usr/bin/env node
/**
 * Measure the NEW "spot the lie" sentences against production POST /api/v1/classify, as
 * docs/measurements/spot-the-lie-2026-10-24.md records: five calls each, 20 seconds apart (the pace and
 * count scripts/measure-home-samples.mjs uses, under the checkers' per-minute budget), every answer
 * written out exactly as it came back.
 *
 *   node scripts/measure-spot-the-lie.mjs runs.json
 *
 * Not part of pull-request CI: it sends sentences to the live engine. The sentences are public facts
 * about git, ssh, wallets and testing, none of them yours. A sentence goes into lib/spot-the-lie.ts only
 * if the same label came back on all five runs and its explanation has a source a person can open.
 * The two misquotes and the three stakes cards were measured on 2026-10-06
 * (docs/measurements/home-cards-2026-10-06.md).
 */
import { writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const API = (process.env.TRUSTSHELL_API_URL || 'https://repid-engine-production.up.railway.app').replace(/\/+$/, '') + '/api/v1/classify';

export const CANDIDATES = [
  ['key-in-js', "A secret API key placed in a web page's JavaScript stays hidden from the people who visit the page."],
  ['tests-pass', 'Passing unit tests prove the code has no bugs.'],
  ['chmod-777', 'Running chmod 777 on your private SSH key is the recommended way to protect it.'],
  ['npm-malware', 'Every package in the npm registry is checked for malware before it is listed.'],
  ['sha256', 'A hash function like SHA-256 always gives the same output for the same input.'],
  ['seed-phrase', "Anyone who knows your wallet's seed phrase can move all the funds in it."],
  ['stash-keeps', 'The git command git stash saves your uncommitted changes without deleting them.'],
];

const entry = process.argv[1] ? resolve(process.argv[1]) : '';
if (entry === fileURLToPath(import.meta.url)) {
  const out = process.argv[2];
  if (!out) {
    console.error('usage: node scripts/measure-spot-the-lie.mjs runs.json');
    process.exit(2);
  }
  const rows = [];
  let calls = 0;
  for (const [id, text] of CANDIDATES) {
    const runs = [];
    for (let i = 0; i < 5; i++) {
      if (calls++ > 0) await delay(20_000);
      const at = new Date().toISOString();
      try {
        const res = await fetch(API, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text, labels: ['pass', 'veto', 'not-checked'] }),
          signal: AbortSignal.timeout(60_000),
        });
        runs.push({ at, status: res.status, body: await res.json().catch(() => null) });
      } catch (e) {
        runs.push({ at, error: String(e && e.message ? e.message : e) });
      }
    }
    rows.push({ id, text, runs });
    writeFileSync(out, JSON.stringify(rows, null, 1));
    console.log(id, runs.map((r) => r.body?.label ?? 'ERR').join(','));
  }
}
