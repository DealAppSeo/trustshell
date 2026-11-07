#!/usr/bin/env node
/**
 * e2e:demo — the fresh-install smoke test for the guided first run.
 *
 * Packs THIS tree, installs the tarball into a throwaway project, and runs the guided `trustshell demo` from
 * the INSTALLED package (a real packaged artifact under node_modules, never a source-tree import). This proves
 * the five-minute first experience actually works for someone who just `npm install`ed the package: the shipped
 * sample receipt (examples/trust-receipt.sample.json) is present, the enforcement journey runs, and the demo's
 * own 15 step-checks all hold. Offline, no account, no network, no publish.
 *
 * Run via `npm run e2e:demo`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const dir = mkdtempSync(join(tmpdir(), 'ts-demo-pack-'));
const findings = [];
const note = (ok, what, detail = '') => {
  findings.push({ ok, what });
  console.log(`${ok ? 'OK  ' : 'GAP '} ${what}${detail ? ` — ${detail}` : ''}`);
};

try {
  execFileSync('npm', ['run', 'sdk:build'], { cwd: ROOT, stdio: 'inherit', shell: true });
  execFileSync('npm', ['pack', '--pack-destination', dir], { cwd: ROOT, stdio: 'inherit', shell: true });
  const tgz = readdirSync(dir).find((f) => f.endsWith('.tgz'));
  if (!tgz) throw new Error('npm pack produced no tarball');
  spawnSync('npm', ['init', '-y'], { cwd: dir, encoding: 'utf8', shell: true });
  const inst = spawnSync('npm', ['install', join(dir, tgz)], { cwd: dir, encoding: 'utf8', shell: true, timeout: 120_000 });
  note(inst.status === 0, 'install packed tarball', inst.stderr?.slice(0, 200));

  const pkgRoot = join(dir, 'node_modules', '@hyperdag', 'trustshell');
  note(existsSync(join(pkgRoot, 'examples', 'trust-receipt.sample.json')), 'sample receipt ships in the package');
  const cli = join(pkgRoot, 'dist', 'cli', 'index.js');
  note(existsSync(cli), 'CLI entry ships in the package');

  // The whole point: a freshly-installed user runs ONE command and sees the real enforcement + verify journey.
  const demo = spawnSync(process.execPath, [cli, 'demo'], { cwd: dir, encoding: 'utf8', timeout: 120_000, windowsHide: true });
  const out = `${demo.stdout ?? ''}${demo.stderr ?? ''}`;
  note(demo.status === 0, 'trustshell demo exits 0 from the installed package', `exit=${demo.status}`);
  note(/ALLOWED/.test(out) && (out.match(/DENIED/g) ?? []).length >= 2, 'ALLOW + two DENY decisions shown');
  note(/chain INTACT/.test(out) && /chain BROKEN/.test(out), 'ledger INTACT then BROKEN (tamper caught)');
  // A fresh install bundles keccak256 (@noble/hashes is a real dependency, not the optional `ethers` peer),
  // so offline hash verification reads VERIFIED out of the box — no `npm install ethers`, no account, no network.
  note(/Integrity\s+VERIFIED/.test(out), 'offline verify reads integrity VERIFIED out of the box (no ethers)');
  note(/honest seam/i.test(out), 'the honest seam is disclosed');
} catch (e) {
  note(false, 'e2e:demo crashed', e instanceof Error ? e.message : String(e));
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const failed = findings.filter((f) => !f.ok);
console.log(`\n${failed.length ? 'FAIL' : 'PASS'}: demo fresh-install smoke — ${failed.length} gap(s)`);
process.exit(failed.length ? 1 : 0);
