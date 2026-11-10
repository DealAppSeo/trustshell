#!/usr/bin/env node
// Decides whether a release-e2e result proves the package works on this machine:
//   node scripts/release-e2e-gate.mjs <out-dir>
// EXIT 0 only if nothing FAILED and every NOT_CHECKED step is one this machine cannot run by design.
// The one such step: `path2.sandbox` when a container runtime is present, because the E2E never starts
// containers (GitHub's Ubuntu runners ship Docker). It stays NOT_CHECKED in the summary; it is never a pass.
// Anything else NOT_CHECKED, such as GitHub rate-limiting the inspect steps, means the run proves nothing
// about those steps, so this exits 1 and says which.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'e2e-out';
const name = readdirSync(dir).find((f) => f.startsWith('e2e-') && f.endsWith('.json'));
if (!name) {
  console.error('::error::the E2E wrote no result file, so nothing was proven');
  process.exit(1);
}
const s = JSON.parse(readFileSync(join(dir, name), 'utf8'));
const byDesign = (r) => r.id === 'path2.sandbox' && /container runtime is present/.test(r.evidence ?? '');
const blocking = s.results.filter((r) => r.status === 'FAIL' || (r.status === 'NOT_CHECKED' && !byDesign(r)));
for (const r of blocking) console.error(`::error::${r.status} ${r.id}: ${r.what}${r.evidence ? ` (${r.evidence.slice(0, 160)})` : ''}`);
for (const r of s.results.filter((x) => x.status === 'NOT_CHECKED' && byDesign(x))) console.log(`::notice::NOT_CHECKED by design here: ${r.id} (${r.evidence})`);
if (!(s.pass > 0)) console.error('::error::no step passed');
process.exit(blocking.length || !(s.pass > 0) ? 1 : 0);
