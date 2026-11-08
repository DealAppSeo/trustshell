#!/usr/bin/env node
/**
 * e2e:enforced-run (L-E2E) — a skeptic reproduces the ENFORCED path end to end, OFFLINE, from the
 * real CLI. No engine, no network. This is the one walk that drives #679's executable-identity pin
 * through the shipped binary — every other E2E runs the guard unpinned (name-only) or in-process.
 *
 * The chain, each step a spawned `trustshell …`:
 *   guard init  →  guard allow tool:node --exe <node>  (list + pin by path+sha256)
 *   run --tool node -- <node> …        ALLOWED, starts the pinned file                 (exit 0)
 *   run --tool node -- <fake-node> …   REFUSED: "not the one pinned" — substitution    (exit 5)
 *   verify-receipt <golden> --root <key>     Integrity VERIFIED                         (exit 0)
 *   verify-receipt <tampered> --root <key>   Integrity FAILED                           (exit 1)
 *   verify-receipt <golden>  --root <wrong>  Integrity FAILED (foreign key)             (exit 1)
 *
 * SOURCING. Default: run the built `dist/cli/index.js` in this tree (builds dist first). This is
 * runnable on every OS. E2E_PACK=1: `npm pack` + clean `npm install` the tarball and run the
 * INSTALLED binary instead (no local node_modules on the path) — the true fresh-install, run in CI
 * where `npm pack` is reliable; it is flaky on the Windows dev box, so that leg lives in CI, same as
 * #683's POSIX-only tests. Either way the assertions are identical.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const GOLDEN = join(ROOT, 'tests', 'fixtures', 'kernel-receipt-v2.golden.json');
const PACK = process.env.E2E_PACK === '1';
const EXE = process.platform === 'win32' ? '.exe' : '';
const dir = mkdtempSync(join(tmpdir(), 'ts-enforced-'));
const home = join(dir, 'home'); // the guarded home: a policy lives here, so every command is gated
const homeV = join(dir, 'home-verify'); // policy-free home for verify-receipt (else the gate denies it)
const findings = [];
const note = (ok, what, detail = '') => {
  findings.push({ ok, what, detail });
  console.log(`${ok ? 'OK  ' : 'GAP '} ${what}${detail ? ` — ${detail}` : ''}`);
};

/** Spawn the trustshell CLI with a given TRUSTSHELL_HOME; offline. Returns {code, out, err}. */
function ts(cli, args, hdir = home) {
  const r = spawnSync(process.execPath, [cli, ...args], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 120_000,
    windowsHide: true,
    env: { ...process.env, TRUSTSHELL_HOME: hdir, OFFLINE: '1' },
  });
  return { code: r.status, out: r.stdout ?? '', err: r.stderr ?? '' };
}

try {
  // ── resolve the CLI the skeptic runs ───────────────────────────────────────────────────────────
  execFileSync('npm', ['run', 'sdk:build'], { cwd: ROOT, stdio: 'inherit', shell: true });
  let cli = join(ROOT, 'dist', 'cli', 'index.js');
  if (PACK) {
    execFileSync('npm', ['pack', '--pack-destination', dir], { cwd: ROOT, stdio: 'inherit', shell: true });
    const tgz = readdirSync(dir).find((f) => f.endsWith('.tgz'));
    if (!tgz) throw new Error('npm pack produced no tarball');
    spawnSync('npm', ['init', '-y'], { cwd: dir, encoding: 'utf8', shell: true });
    // ethers is an OPTIONAL peer (since 1.6.0); offline receipt verify needs it for keccak. Install it
    // the way the CLI tells a user to ("npm i ethers@^6") — a fresh install without it fail-closes
    // offline verify to NOT_CHECKED (never a false pass), which is correct, just not what we assert here.
    const inst = spawnSync('npm', ['install', join(dir, tgz), 'ethers@^6'], { cwd: dir, encoding: 'utf8', shell: true, timeout: 180_000 });
    note(inst.status === 0, 'fresh install of the packed tarball (+ ethers peer for offline verify)', inst.stderr?.slice(0, 160));
    cli = join(dir, 'node_modules', '@hyperdag', 'trustshell', 'dist', 'cli', 'index.js');
  }

  // The pinned tool is a NON-interpreter executable (a reserved name like `node`/`python` triggers the
  // stricter pinned-script rule instead). A copy of this node binary under a neutral name both resolves
  // and exits 0; the substitute is any other regular file at another path (refused before it ever runs).
  const binDir = join(dir, 'bin');
  mkdirSync(binDir, { recursive: true });
  const runner = join(binDir, `runner${EXE}`);
  copyFileSync(process.execPath, runner);
  try { chmodSync(runner, 0o755); } catch { /* no-op on Windows */ }
  const fakeDir = join(dir, 'evil');
  mkdirSync(fakeDir, { recursive: true });
  const fake = join(fakeDir, `runner${EXE}`); // same basename, different path — a planted substitute
  writeFileSync(fake, 'not the pinned binary\n');

  // ── owner authorization: a policy, then pin the tool's executable by path+sha256 ────────────────
  note(ts(cli, ['guard', 'init']).code === 0, 'guard init writes an owner policy');
  const allow = ts(cli, ['guard', 'allow', 'tool:runner', '--exe', runner]);
  note(allow.code === 0, 'guard allow tool:runner --exe <file> pins the executable', allow.err.slice(0, 160));
  const show = ts(cli, ['guard', 'show', '--json']);
  let pinned = false;
  try { pinned = (JSON.parse(show.out).policy.executables ?? []).some((e) => e.tool === 'runner'); } catch {}
  note(pinned, 'guard show lists the runner executable pin');

  // ── actual execution: the ALLOWED run starts the pinned file ────────────────────────────────────
  const ok = ts(cli, ['run', '--tool', 'runner', '--', runner, '-e', 'process.exit(0)']);
  note(ok.code === 0, 'run --tool runner (pinned file) is ALLOWED and exits 0', `code=${ok.code} ${ok.err.slice(0, 120)}`);
  note(/pinned by path\+sha256/.test(ok.err), 'the ALLOWED card states the run went through the path+sha256 pin');

  // ── the enforcement bites: a substituted executable is REFUSED before it starts ────────────────
  const sub = ts(cli, ['run', '--tool', 'runner', '--', fake, '-e', 'process.exit(0)']);
  note(sub.code === 5, 'run with a SUBSTITUTED executable is REFUSED (exit 5)', `code=${sub.code}`);
  note(/is not the one pinned for runner/.test(sub.out + sub.err), 'the refusal names the pin, not a generic deny');

  // ── signed receipt → independent offline verification, and its negative controls ───────────────
  // A policy-free home (homeV): once a policy exists, EVERY command is gated, so verify-receipt would be
  // denied for not being listed — which is correct behaviour, just not what this leg is testing.
  const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));
  const key = golden.public_key;
  const verified = ts(cli, ['verify-receipt', GOLDEN, '--root', key], homeV);
  note(verified.code === 0 && /Integrity\s+VERIFIED/.test(verified.out), 'verify-receipt: golden under its pinned root → Integrity VERIFIED (exit 0)', `code=${verified.code}`);

  const tampered = JSON.parse(JSON.stringify(golden.receipt_response));
  tampered.receipt.decision.verdict = 'DENY'; // mutates bytes; header.receipt_hash is now stale
  const tamperedPath = join(dir, 'tampered.json');
  writeFileSync(tamperedPath, JSON.stringify(tampered));
  const tamperOut = ts(cli, ['verify-receipt', tamperedPath, '--root', key], homeV);
  note(tamperOut.code === 1 && /Integrity\s+FAILED/.test(tamperOut.out + tamperOut.err), 'verify-receipt: a tampered receipt → Integrity FAILED (exit 1)', `code=${tamperOut.code}`);

  const wrongRoot = '0x' + 'ab'.repeat(32);
  const wrong = ts(cli, ['verify-receipt', GOLDEN, '--root', wrongRoot], homeV);
  note(wrong.code === 1 && /Integrity\s+FAILED/.test(wrong.out + wrong.err), 'verify-receipt: golden under a FOREIGN root → Integrity FAILED (exit 1)', `code=${wrong.code}`);
} catch (e) {
  note(false, 'enforced-run walk crashed', e instanceof Error ? e.message : String(e));
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const failed = findings.filter((f) => !f.ok);
console.log(`\n${failed.length ? `FAIL ${failed.length}/${findings.length}` : `PASS ${findings.length}/${findings.length}`} — enforced-run walk${PACK ? ' (packed install)' : ' (built dist)'}`);
process.exit(failed.length ? 1 : 0);
