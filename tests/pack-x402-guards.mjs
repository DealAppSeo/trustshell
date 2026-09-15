#!/usr/bin/env node
/**
 * T5 A1 — clean-install smoke from the packed tarball.
 * Proves guardedX402Payment, assertOriginCanPay, auditThenAct, getAllowance
 * are importable from what npm would publish — not just from git-main src.
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
execSync('npm run sdk:build', { cwd: ROOT, stdio: 'inherit' });
const packed = JSON.parse(execSync('npm pack --json --pack-destination .', { cwd: ROOT, encoding: 'utf8' }));
const tgz = join(ROOT, packed[0].filename);
const dir = mkdtempSync(join(tmpdir(), 't5-pack-'));
try {
  execSync(`tar -xzf "${tgz}" -C "${dir}"`, { stdio: 'inherit' });
  const pkg = join(dir, 'package');
  const entry = join(pkg, 'dist/lib/index.js');
  const req = createRequire(import.meta.url);
  const cjs = req(entry);
  const need = ['guardedX402Payment', 'assertOriginCanPay', 'auditThenAct', 'buildX402Payment'];
  let fail = 0;
  for (const n of need) {
    if (typeof cjs[n] !== 'function') {
      console.error(`FAIL packed CJS missing ${n}`);
      fail++;
    } else console.log(`OK   packed CJS ${n}`);
  }
  if (typeof cjs.TrustShell?.prototype?.getAllowance !== 'function') {
    console.error('FAIL packed CJS missing TrustShell#getAllowance');
    fail++;
  } else console.log('OK   packed CJS TrustShell#getAllowance');
  const esm = await import(pathToFileURL(entry).href);
  for (const n of need) {
    if (typeof esm[n] !== 'function') {
      console.error(`FAIL packed ESM missing ${n}`);
      fail++;
    } else console.log(`OK   packed ESM ${n}`);
  }
  process.exit(fail === 0 ? 0 : 1);
} finally {
  rmSync(dir, { recursive: true, force: true });
  try { rmSync(tgz, { force: true }); } catch { /* ignore */ }
}
