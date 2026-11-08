/**
 * Executable identity (PR #679): `run --tool git` must start the executable the owner approved, not merely a file
 * whose BASENAME is `git`. Before this, the guard matched `basename(command[0])` against `--tool` and then spawned
 * `command[0]` verbatim, so `run --tool git -- /attacker/git` (same basename, different file), a PATH entry planted
 * ahead of the real one, or a repointed symlink all passed. A new `executables` pin binds the tool to one file by
 * resolved path + sha256; an unpinned tool stays name-only (the weaker, legacy check, labelled as such on the card).
 *
 * Every test uses a temp TRUSTSHELL_HOME and a fake spawner, so nothing is started and the real home is never touched.
 */
import { createHash } from 'node:crypto';
import { delimiter, join } from 'node:path';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import type { CliIO } from '../src/cli';
import { EXIT_REFUSED, runGuard, runRun, type Spawner } from '../src/cli/guard';
import { GUARD_RECEIPTS_FILE, POLICY_FILE, defaultPolicy, parsePolicy, renderPolicyDocument, type GuardRecord, type LocalPolicy } from '../src/lib/guardrails';

/** The rule every executable-identity denial states, word for word. */
const RULE = 'a pinned tool starts only the executable the policy pins by path and sha256';

let canLink = false;
beforeAll(() => {
  const d = mkdtempSync(join(tmpdir(), 'ts-exe-link-'));
  try {
    writeFileSync(join(d, 't'), 'x');
    symlinkSync(join(d, 't'), join(d, 'l'));
    canLink = true;
  } catch {
    /* Windows without the symlink privilege: the symlink test reports as skipped, not passed */
  }
  rmSync(d, { recursive: true, force: true });
});

describe('executable identity: a pinned tool starts only the file the policy pins by path+sha256', () => {
  const prevCwd = process.cwd();
  const isWin = process.platform === 'win32';
  // Plain names (no extension) so basename stripping yields the same `git` on both platforms for the cross-platform tests.
  const EXE = 'git';
  let root = '';
  let home = '';
  let work = '';
  let out: string[] = [];
  let err: string[] = [];
  let started: string[][] = [];
  const io: CliIO = { out: (s) => out.push(s), err: (s) => err.push(s) };
  const spawner: Spawner = (cmd, args) => (started.push([cmd, ...args]), { status: 0, signal: null });
  const env = (extra: Record<string, string> = {}): NodeJS.ProcessEnv => ({ ...process.env, TRUSTSHELL_HOME: home, ...extra });
  const guard = (...argv: string[]) => {
    out = [];
    err = [];
    return runGuard(argv, io, env());
  };
  const runIt = (argv: string[], extra: Record<string, string> = {}) => {
    out = [];
    err = [];
    return runRun(argv, io, env(extra), spawner);
  };
  const records = (): GuardRecord[] => readFileSync(join(home, GUARD_RECEIPTS_FILE), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as GuardRecord);
  const last = () => records().pop() as GuardRecord;
  const real = (f: string) => realpathSync.native(join(work, f));
  const sha = (f: string) => createHash('sha256').update(readFileSync(join(work, f))).digest('hex');
  const exePin = (tool: string, f: string) => ({ tool, path: real(f), sha256: sha(f) });
  const policyFile = (p: Record<string, unknown>) => {
    mkdirSync(home, { recursive: true });
    writeFileSync(join(home, POLICY_FILE), renderPolicyDocument({ policy: { ...defaultPolicy(), ...p } as LocalPolicy, signature: null }));
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ts-exe-'));
    home = join(root, 'home');
    work = join(root, 'work');
    mkdirSync(join(work, 'bin'), { recursive: true });
    mkdirSync(join(work, 'evil'), { recursive: true });
    writeFileSync(join(work, 'bin', EXE), '#!/bin/sh\necho real-git\n');
    writeFileSync(join(work, 'evil', EXE), '#!/bin/sh\necho ATTACKER\n');
    process.chdir(work);
    started = [];
  });
  afterEach(() => {
    process.chdir(prevCwd);
    rmSync(root, { recursive: true, force: true });
  });

  it('BYPASS REPRO: a substituted file with the pinned tool’s basename is REFUSED before it starts', () => {
    policyFile({ actions: [`tool:${EXE}`], executables: [exePin(EXE, `bin/${EXE}`)] });
    // Same basename `git`, different file — the classic executable-substitution bypass.
    expect(runIt(['--tool', EXE, '--', real(`evil/${EXE}`), 'status'])).toBe(EXIT_REFUSED);
    expect(started).toEqual([]);
    expect(last()).toMatchObject({ kind: 'decision', authorized: { decision: 'DENIED' }, executed: 'not run' });
    expect(last().authorized.reasons.join(' ')).toMatch(/not the one pinned/);
    expect(last().authorized.reasons.join(' ')).toContain(RULE);
  });

  it('the exact pinned executable is ALLOWED and the RESOLVED absolute path is what starts', () => {
    policyFile({ actions: [`tool:${EXE}`], executables: [exePin(EXE, `bin/${EXE}`)] });
    expect(runIt(['--tool', EXE, '--', real(`bin/${EXE}`), 'status'])).toBe(0);
    expect(started).toEqual([[real(`bin/${EXE}`), 'status']]);
    // The run record carries the executable by hash, never the resolved path.
    expect(JSON.stringify(records().filter((r) => r.kind !== 'policy-change'))).not.toContain(real(`bin/${EXE}`));
    expect(records().slice(-2)[0]?.requested).toMatchObject({ executable: EXE, executable_sha256: sha(`bin/${EXE}`) });
  });

  it('the pinned path with changed bytes is REFUSED (digest), even though the path still matches', () => {
    policyFile({ actions: [`tool:${EXE}`], executables: [exePin(EXE, `bin/${EXE}`)] });
    writeFileSync(join(work, 'bin', EXE), '#!/bin/sh\necho swapped\n');
    expect(runIt(['--tool', EXE, '--', real(`bin/${EXE}`), 'status'])).toBe(EXIT_REFUSED);
    expect(started).toEqual([]);
    expect(last().authorized.reasons.join(' ')).toMatch(/changed since it was pinned/);
  });

  it('LEGACY name-only: an unpinned tool still runs any file by that basename, but the card labels it the weaker check', () => {
    policyFile({ actions: [`tool:${EXE}`] }); // no executables pin
    expect(runIt(['--tool', EXE, '--', real(`evil/${EXE}`), 'status'])).toBe(0);
    expect(started).toEqual([[real(`evil/${EXE}`), 'status']]);
    expect(err.join('\n')).toMatch(/name-only/);
    expect(err.join('\n')).toContain(`guard allow tool:${EXE} --exe`);
  });

  (canLink && !isWin ? it : it.skip)('PATH hijack: a planted entry ahead of the pinned path is REFUSED (bare name resolves to it)', () => {
    policyFile({ actions: [`tool:${EXE}`], executables: [exePin(EXE, `bin/${EXE}`)] });
    // chmod the fixtures executable so the PATH search finds them.
    require('node:fs').chmodSync(join(work, 'evil', EXE), 0o755);
    require('node:fs').chmodSync(join(work, 'bin', EXE), 0o755);
    const PATH = [join(work, 'evil'), join(work, 'bin')].join(delimiter);
    expect(runIt(['--tool', EXE, '--', EXE, 'status'], { PATH })).toBe(EXIT_REFUSED);
    expect(started).toEqual([]);
    expect(last().authorized.reasons.join(' ')).toContain(RULE);
    // Control: with the real dir first, the same bare name resolves to the pinned file and starts.
    const good = [join(work, 'bin'), join(work, 'evil')].join(delimiter);
    expect(runIt(['--tool', EXE, '--', EXE, 'status'], { PATH: good })).toBe(0);
    expect(started).toEqual([[real(`bin/${EXE}`), 'status']]);
  });

  (canLink && !isWin ? it : it.skip)('symlink substitution: a link that resolves to a different file than the pin is REFUSED', () => {
    symlinkSync(join(work, 'evil', EXE), join(work, EXE)); // ./git -> evil/git
    policyFile({ actions: [`tool:${EXE}`], executables: [exePin(EXE, `bin/${EXE}`)] });
    expect(runIt(['--tool', EXE, '--', `./${EXE}`, 'status'])).toBe(EXIT_REFUSED);
    expect(started).toEqual([]);
  });

  it('guard allow tool:git --exe pins the file by sha256; the pinned file runs and a substitute is refused', () => {
    expect(guard('init')).toBe(0);
    expect(guard('allow', `tool:${EXE}`, '--exe', `bin/${EXE}`)).toBe(0);
    const doc = JSON.parse(readFileSync(join(home, POLICY_FILE), 'utf8')) as { policy: LocalPolicy & { executables?: unknown } };
    expect(doc.policy.executables).toEqual([exePin(EXE, `bin/${EXE}`)]);
    const change = last();
    expect(change.kind).toBe('policy-change');
    expect(change.change?.via).toContain(`guard allow tool:${EXE} --exe`);
    expect(change.change?.via).toContain(sha(`bin/${EXE}`));
    expect(runIt(['--tool', EXE, '--', real(`bin/${EXE}`)])).toBe(0);
    expect(runIt(['--tool', EXE, '--', real(`evil/${EXE}`)])).toBe(EXIT_REFUSED);
    // Denying the tool drops its executable pin too, so re-allowing revives none.
    expect(guard('deny', `tool:${EXE}`)).toBe(0);
    const doc2 = JSON.parse(readFileSync(join(home, POLICY_FILE), 'utf8')) as { policy: { executables?: unknown } };
    expect(doc2.policy.executables).toBeUndefined();
  });

  (isWin ? it : it.skip)('WINDOWS: substitution past the .exe basename strip is refused', () => {
    writeFileSync(join(work, 'bin', 'git.exe'), 'MZreal');
    writeFileSync(join(work, 'evil', 'git.exe'), 'MZevil');
    policyFile({ actions: ['tool:git'], executables: [{ tool: 'git', path: real('bin/git.exe'), sha256: sha('bin/git.exe') }] });
    expect(runIt(['--tool', 'git', '--', real('evil/git.exe'), 'status'])).toBe(EXIT_REFUSED);
    expect(started).toEqual([]);
    expect(runIt(['--tool', 'git', '--', real('bin/git.exe'), 'status'])).toBe(0);
  });
});

describe('parsePolicy: executables, a local-only pin list like scripts', () => {
  const NOW = 1_800_000_000;
  const ABS = join(tmpdir(), 'git');
  const H = 'a'.repeat(64);
  const base = { subject: 'a', actions: ['tool:git'], expires_at: NOW, nonce: '1' };

  it('a well-formed executable pin list parses; a policy without one has no executables key, so it hashes as before', () => {
    const r = parsePolicy({ ...base, executables: [{ tool: 'git', path: ABS, sha256: H }] });
    expect(r.ok && (r.policy as unknown as Record<string, unknown>).executables).toEqual([{ tool: 'git', path: ABS, sha256: H }]);
    const r0 = parsePolicy(base);
    expect(r0.ok && 'executables' in r0.policy).toBe(false);
  });

  it.each([
    ['a sha256 that is not 64 hex', [{ tool: 'git', path: ABS, sha256: 'xyz' }]],
    ['a relative path', [{ tool: 'git', path: 'git', sha256: H }]],
    ['the same tool and path twice', [{ tool: 'git', path: ABS, sha256: H }, { tool: 'git', path: ABS, sha256: H }]],
    ['an unknown key', [{ tool: 'git', path: ABS, sha256: H, note: 'x' }]],
    ['not a list', { tool: 'git', path: ABS, sha256: H }],
  ])('%s is an error', (_n, executables) => {
    expect(parsePolicy({ ...base, executables }).ok).toBe(false);
  });
});
