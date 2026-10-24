#!/usr/bin/env node
/**
 * Does the proof pack FAIL when the artifact is broken? Packs this checkout, makes three deliberately broken copies of the
 * tarball, and runs the pack against each with `--tarball`. A mutant the pack does not catch, at the check meant to catch it,
 * means the pack is blind to that bug.
 *
 *   M1  inspect ignores a line whose content no longer matches its own hash     -> step 3, cause control-failed
 *   M2  guardedX402Payment swallows a writeReceipt failure and signs anyway     -> step 5, cause control-failed
 *   M3  digestRecord returns a constant                                         -> step 2, cause logic (digest != recomputed)
 *
 *   npm run test:proof-pack-mutants      needs the network (npm install of each tarball); about a minute per mutant when the
 *                                        machine is idle. Exit 0 every mutant caught where expected, 1 a mutant got through.
 * Reports land in a temp dir and are printed, nothing is written into the repo.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-mutants-'));
const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const pack = spawnSync(process.execPath, [npmCli, 'pack', '--json', '--pack-destination', WORK], { cwd: ROOT, encoding: 'utf8' });
if (pack.status !== 0) { console.error(`npm pack failed: ${pack.stderr}`); process.exit(2); }
const base = path.join(WORK, JSON.parse(pack.stdout)[0].filename);
// On Windows git-bash's GNU tar reads C: as a remote host, so use the system bsdtar there.
const TAR = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:/Windows', 'System32', 'tar.exe') : 'tar';
const tar = (...a) => { const r = spawnSync(TAR, a, { encoding: 'utf8' }); if (r.status !== 0) { console.error('tar failed: ' + (r.stderr || r.error)); process.exit(2); } };
const MUTANTS = [
  { id: 'm1-inspect-ignores-hash', file: 'dist/lib/inspect.js', from: 'if (recomputed !== e.hash) {', to: 'if (false) {', step: '3', cause: 'control-failed' },
  { id: 'm2-gate-swallows-receipt-failure', file: 'dist/lib/guarded-payment.js', from: 'await params.writeReceipt();', to: 'try { await params.writeReceipt(); } catch (e) { /* MUTANT */ }', step: '5', cause: 'control-failed' },
  { id: 'm3-digest-constant', file: 'dist/lib/action-evidence.js', from: 'value: (0, jcs_1.jcsSha256)(record) }', to: "value: '0'.repeat(64) }", step: '2', cause: 'logic' },
];
let bad = 0;
for (const m of MUTANTS) {
  const dir = path.join(WORK, m.id);
  fs.mkdirSync(dir);
  tar('-xzf', base, '-C', dir);
  const f = path.join(dir, 'package', m.file);
  const src = fs.readFileSync(f, 'utf8');
  if (!src.includes(m.from)) { console.error(`FAIL ${m.id}: the line to break is not in ${m.file} any more; update this test`); bad++; continue; }
  fs.writeFileSync(f, src.replace(m.from, m.to));
  const tgz = path.join(WORK, `${m.id}.tgz`);
  tar('-czf', tgz, '-C', dir, 'package');
  const out = path.join(WORK, `out-${m.id}`);
  const r = spawnSync(process.execPath, ['scripts/proof-pack.mjs', '--tarball', tgz, '--skip', 'published,hosted,erc8004,devnet', '--out-dir', out, '--stem', m.id], { cwd: ROOT, encoding: 'utf8', timeout: 20 * 60000 });
  let caught = [];
  try { caught = JSON.parse(fs.readFileSync(path.join(out, `${m.id}.json`), 'utf8')).steps.flatMap((s) => s.checks.filter((c) => c.verdict === 'FAIL').map((c) => ({ step: s.id, cause: c.cause, label: c.label }))); } catch { /* no report */ }
  const hit = caught.some((c) => c.step === m.step && c.cause === m.cause);
  if (!hit || r.status !== 1) bad++;
  console.log(`${hit && r.status === 1 ? 'ok  ' : 'FAIL'} ${m.id}: pack exit ${r.status}, ${caught.length} check(s) FAILED${hit ? `, including step ${m.step} [${m.cause}] as expected` : `, but none at step ${m.step} [${m.cause}]`}`);
  for (const c of caught.slice(0, 4)) console.log(`       ${c.step} [${c.cause}] ${c.label.slice(0, 110)}`);
}
fs.rmSync(WORK, { recursive: true, force: true });
console.log(bad ? `${bad} mutant(s) got through` : 'every mutant was caught where expected');
process.exit(bad ? 1 : 0);
