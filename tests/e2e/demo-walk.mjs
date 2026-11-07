#!/usr/bin/env node
/**
 * test:demo — run the guided `trustshell demo` against the built dist and assert it stays honest.
 *
 * `trustshell demo` self-checks every step and exits non-zero on any failure, so the load-bearing assertion
 * is its exit code. On top of that we pin the things a refactor must not silently drop: the four verdict words
 * are taught, and the "honest seam" disclosure (local enforcement plane vs engine six-claim plane) is printed.
 * Offline, no network, no account — the demo runs entirely in a throwaway home it deletes.
 *
 * Run via `npm run test:demo` (which builds dist first).
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const CLI = join(REPO, 'dist', 'cli', 'index.js');

let failures = 0;
const ok = (m) => console.log(`OK   ${m}`);
const fail = (m) => { console.error(`FAIL ${m}`); failures += 1; };
const assert = (c, m) => (c ? ok(m) : fail(m));

const r = spawnSync(process.execPath, [CLI, 'demo'], { encoding: 'utf8', timeout: 120_000, windowsHide: true });
const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;

assert(r.status === 0, `demo exits 0 (its own 15 step-checks all held) — got ${r.status}`);
assert(/demo OK/.test(out), 'demo prints its OK summary');
// The enforcement journey actually happened (not just narrated):
assert(/ALLOWED/.test(out), 'an ALLOWED run is shown');
assert((out.match(/DENIED/g) ?? []).length >= 2, 'at least two DENIED runs are shown (capability + spend cap)');
assert(/chain INTACT/.test(out) && /chain BROKEN/.test(out), 'the ledger reads INTACT, then BROKEN after a tamper');
// The four verdict words are taught, and the honesty disclosure is not dropped:
for (const w of ['VERIFIED', 'NOT_CHECKED', 'FAILED', 'NOT_APPLICABLE']) assert(out.includes(w), `teaches ${w}`);
assert(/honest seam/i.test(out), 'the honest seam (two evidence planes, not yet joined) is disclosed');

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}: demo walk — ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
