/**
 * 1.8.1: the parts of #647's first-run polish that touch code already in 1.8.0 (F3 learn inject, F4 the SQLite
 * warning, F9 a refused TRUSTSHELL_API_URL). Ported from tests/harness-first-run.test.ts on main, minus every case
 * that needs guard, run or bundle, which 1.8.0 does not ship. Each fails on 4b01ec34 (the 1.8.0 source).
 * Every test uses a temp TRUSTSHELL_HOME and memory file; the real home is never read or written.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fatalLine, quietSqliteWarning } from '../src/cli';
import { ApiUrlError } from '../src/lib/api-url';
import { runLearn } from '../src/learn/cli';

describe('F3: learn inject with nothing to inject says why, on stderr only', () => {
  const prevEnv = { ...process.env };
  let home = '';
  let out: string[] = [];
  let err: string[] = [];
  const io = { out: (s: string) => out.push(s), err: (s: string) => err.push(s) };
  const env = () => ({ ...process.env, TRUSTSHELL_HOME: home, TRUSTSHELL_MEMORY: join(home, 'memory.sqlite') });

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'ts-181-first-run-'));
    process.env.TRUSTSHELL_HOME = home;
    out = [];
    err = [];
  });
  afterEach(() => {
    process.env = { ...prevEnv };
    rmSync(home, { recursive: true, force: true });
  });

  it("the README's own steps: a lesson scoped to ship-tests prints with --check ship-tests; without it, stdout is empty and stderr says why", async () => {
    const e = env();
    expect(await runLearn(['job', 'add', 'ship', '--mode', 'delegate', 'When I ship a change, I want the tests green, so I can merge.'], io, e)).toBe(0);
    expect(await runLearn(['check', 'add', '--job', 'ship', '--id', 'ship-tests', '--cmd', 'npm test'], io, e)).toBe(0);
    expect(await runLearn(['correct', '--job', 'ship', '--check', 'ship-tests', 'Run the linter before you say done.'], io, e)).toBe(0);
    expect(await runLearn(['accept', '1'], io, e)).toBe(0);
    out = [];
    err = [];
    expect(await runLearn(['inject', '--job', 'ship'], io, e)).toBe(0);
    expect(out).toEqual([]); // what a hook injects: nothing
    expect(err.join('\n')).toContain('no lesson applies to this turn of job ship');
    expect(err.join('\n')).toContain('--check <check>');
    out = [];
    err = [];
    expect(await runLearn(['inject', '--job', 'ship', '--check', 'ship-tests'], io, e)).toBe(0);
    expect(out.join('\n')).toContain('Run the linter before you say done.');
    expect(err).toEqual([]);
  });

  it('an unknown job still prints nothing at all (the documented no-op)', async () => {
    const e = env();
    expect(await runLearn(['job', 'add', 'ship', '--mode', 'delegate', 'When I ship, I want green tests, so I can merge.'], io, e)).toBe(0);
    out = [];
    err = [];
    expect(await runLearn(['inject', '--job', 'nope'], io, e)).toBe(0);
    expect(out).toEqual([]);
    expect(err).toEqual([]);
  });

  it('the README example injects with --check ship-tests', () => {
    const readme = readFileSync(join(__dirname, '..', 'README.md'), 'utf8');
    expect(readme).toContain('trustshell learn inject --job ship --check ship-tests');
  });
});

describe('F9: a refused TRUSTSHELL_API_URL is one line with the next step', () => {
  it('a refused TRUSTSHELL_API_URL is one line with the next step, never a stack trace', () => {
    const line = fatalLine(new ApiUrlError('TRUSTSHELL_API_URL must be https (plain http only for localhost), so nothing was sent to http://example.com'));
    expect(line).toContain('Unset TRUSTSHELL_API_URL, or point it at an https URL');
    expect(line).not.toContain('fatal');
    expect(line).not.toMatch(/\n\s+at /);
  });

  it('any other crash still prints "fatal" and its stack (control)', () => {
    expect(fatalLine(new Error('boom'))).toMatch(/^trustshell: fatal: Error: boom\n\s+at /);
  });

  it('the built CLI: `recall` with an http TRUSTSHELL_API_URL exits 3 with the one line, no stack', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ts-181-first-run-url-'));
    try {
      const r = spawnSync(process.execPath, [join(__dirname, '..', 'dist', 'cli', 'index.js'), 'recall'], {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, TRUSTSHELL_HOME: dir, TRUSTSHELL_MEMORY: join(dir, 'memory.sqlite'), TRUSTSHELL_API_URL: 'http://example.com' },
      });
      expect(r.status).toBe(3);
      expect(r.stderr).toContain('Unset TRUSTSHELL_API_URL');
      expect(r.stderr).not.toMatch(/\n\s+at /);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("F4: the CLI drops Node's SQLite ExperimentalWarning, and only that warning", () => {
  const fake = () => {
    const seen: unknown[][] = [];
    const proc = { emitWarning: ((...a: unknown[]) => void seen.push(a)) as unknown as NodeJS.Process['emitWarning'] };
    quietSqliteWarning(proc);
    return { proc, seen };
  };

  it('the SQLite experimental warning is dropped, as a string and as an Error', () => {
    const { proc, seen } = fake();
    proc.emitWarning('SQLite is an experimental feature and might change at any time', 'ExperimentalWarning');
    const e = new Error('SQLite is an experimental feature and might change at any time');
    e.name = 'ExperimentalWarning';
    proc.emitWarning(e);
    expect(seen).toEqual([]);
  });

  it.each([
    ['another experimental feature', ['WASI is an experimental feature and might change at any time', 'ExperimentalWarning']],
    ['the same text as another type', ['SQLite is an experimental feature and might change at any time', 'DeprecationWarning']],
    ['an options object of another type', ['SQLite is an experimental feature', { type: 'Warning' }]],
    ['a plain warning', ['something else']],
  ])('%s still prints', (_n, args) => {
    const { proc, seen } = fake();
    (proc.emitWarning as unknown as (...a: unknown[]) => void)(...args);
    expect(seen).toEqual([args]);
  });

  // The built CLI, spawned the way npm's bin runs it, with Node's warnings left ON.
  const cli = join(__dirname, '..', 'dist', 'cli', 'index.js');
  const spawnEnv = (extra: Record<string, string>) => {
    const e: NodeJS.ProcessEnv = { ...process.env, ...extra };
    delete e.NODE_NO_WARNINGS;
    delete e.NODE_OPTIONS;
    return e;
  };
  // Control: does this Node warn on node:sqlite at all? If not, the dist test below proves nothing, so it is SKIPPED.
  const nodeWarns = /ExperimentalWarning: SQLite/.test(
    spawnSync(process.execPath, ['-e', "require('node:sqlite')"], { encoding: 'utf8', env: spawnEnv({}) }).stderr ?? '',
  );
  (nodeWarns ? it : it.skip)('`trustshell recall` from dist prints no SQLite warning (this Node warns on a bare require: control)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ts-181-first-run-dist-'));
    try {
      const r = spawnSync(process.execPath, [cli, 'recall'], {
        cwd: dir,
        encoding: 'utf8',
        env: spawnEnv({ TRUSTSHELL_HOME: dir, TRUSTSHELL_MEMORY: join(dir, 'memory.sqlite') }),
      });
      expect(r.status).toBe(0);
      expect(r.stderr).not.toContain('ExperimentalWarning');
      expect(r.stdout).toContain('do_not_send COUNT 0'); // it ran, and it opened the memory file
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
