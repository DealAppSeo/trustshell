/**
 * FIRST RUN: what a stranger meets on guard, run, bundle, inspect and learn, typed the way the docs print them.
 * Each case is one friction from the stranger walk of 2026-10-23 (E:\dev\reports\2026-10-23\harness\FRICTION.md,
 * Git Bash and Windows PowerShell 5.1, installed from the packed tarball), and fails on the code before its fix.
 * Wording and guidance only: no decision, exit code of a decision, record or permission changes here.
 * Every test uses a temp TRUSTSHELL_HOME and memory file; the real home is never read or written.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GUARD_LEDGER_NOT_A_SESSION_LOG, fatalLine, isGuardLedger, parseArgs, quietSqliteWarning, run, type CliIO } from '../src/cli';
import { runBundle } from '../src/cli/bundle';
import { RUN_POWERSHELL, runGuard, runRun, zeroLimitNote, type Spawner } from '../src/cli/guard';
import { ApiUrlError } from '../src/lib/api-url';
import { GUARD_RECEIPTS_FILE, POLICY_FILE, defaultPolicy, renderPolicyDocument } from '../src/lib/guardrails';
import { runLearn } from '../src/learn/cli';

const CLI_SOURCE = readFileSync(join(__dirname, '..', 'src', 'cli', 'index.ts'), 'utf8');
const HELP = (CLI_SOURCE.match(/const HELP = `([\s\S]*?)`;/) ?? [])[1] ?? '';

describe('first run: guard, run, bundle and learn, as a stranger types them', () => {
  const prevEnv = { ...process.env };
  let home = '';
  let out: string[] = [];
  let err: string[] = [];
  const io: CliIO = { out: (s) => out.push(s), err: (s) => err.push(s) };
  let started: string[][] = [];
  const spawner: Spawner = (cmd, args) => {
    started.push([cmd, ...args]);
    return { status: 0, signal: null };
  };
  const env = () => ({ ...process.env, TRUSTSHELL_HOME: home, TRUSTSHELL_MEMORY: join(home, 'memory.sqlite') });
  const policy = (actions: string[]) =>
    writeFileSync(join(home, POLICY_FILE), renderPolicyDocument({ policy: { ...defaultPolicy(), actions }, signature: null }));
  const policyText = () => readFileSync(join(home, POLICY_FILE), 'utf8');

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'ts-first-run-'));
    process.env.TRUSTSHELL_HOME = home;
    out = [];
    err = [];
    started = [];
  });
  afterEach(() => {
    process.env = { ...prevEnv };
    rmSync(home, { recursive: true, force: true });
  });

  describe('F1: Windows PowerShell drops a bare -- before trustshell.ps1 sees it', () => {
    it('`run --tool git git --version` (the -- eaten) is still refused, and the error says how to write -- in PowerShell', () => {
      policy(['tool:git']);
      expect(runRun(['--tool', 'git', 'git', '--version'], io, env(), spawner)).toBe(2);
      expect(started).toEqual([]);
      const e = err.join('\n');
      expect(e).toContain('unexpected git: run needs -- before the command');
      expect(e).toContain("'--'");
      expect(e).toContain('trustshell.cmd');
    });

    it('`run --tool git` with no -- and no command names the PowerShell form too', () => {
      expect(runRun(['--tool', 'git'], io, env(), spawner)).toBe(2);
      expect(err.join('\n')).toContain(RUN_POWERSHELL);
    });

    it('with the -- present, a missing command keeps the plain message (no PowerShell detour)', () => {
      expect(runRun(['--tool', 'git', '--'], io, env(), spawner)).toBe(2);
      expect(err.join('\n')).toContain('error: run needs the command after --');
      expect(err.join('\n')).not.toContain('PowerShell');
    });

    it('the quoted form works: the -- arrives, and the allowed command starts', () => {
      policy(['tool:git']);
      expect(runRun(['--tool', 'git', '--', 'git', '--version'], io, env(), spawner)).toBe(0);
      expect(started).toEqual([['git', '--version']]);
    });

    it('`trustshell --help` says how to write run\'s -- in PowerShell', () => {
      expect(HELP).toContain("trustshell run --tool git '--' git status");
    });
  });

  describe('F5: --help after a command is help, not an error', () => {
    it('run --help prints run\'s usage and the PowerShell form, exit 0, and starts nothing', () => {
      expect(runRun(['--help'], io, env(), spawner)).toBe(0);
      expect(out.join('\n')).toContain('trustshell run --tool <name>');
      expect(out.join('\n')).toContain(RUN_POWERSHELL);
      expect(err).toEqual([]);
      expect(started).toEqual([]);
    });

    it('a --help AFTER the -- belongs to the command, not to run', () => {
      policy(['tool:git']);
      expect(runRun(['--tool', 'git', '--', 'git', '--help'], io, env(), spawner)).toBe(0);
      expect(started).toEqual([['git', '--help']]);
    });

    it.each([['--help'], ['-h'], ['help']])('guard %s prints guard\'s usage, exit 0, and writes nothing', (flag) => {
      expect(runGuard([flag], io, env())).toBe(0);
      expect(out.join('\n')).toContain('trustshell guard init [--force] [--days N]');
      expect(err).toEqual([]);
    });

    it.each([['--help'], ['-h'], ['help']])('bundle %s prints bundle\'s usage, exit 0', (flag) => {
      expect(runBundle([flag], io, env())).toBe(0);
      expect(out.join('\n')).toContain('trustshell bundle export <file>');
      expect(err).toEqual([]);
    });

    it.each([['--help'], ['-h'], ['help']])('learn %s prints learn\'s verbs, exit 0', async (flag) => {
      expect(await runLearn([flag], io, env())).toBe(0);
      expect(out.join('\n')).toContain('learn job add <slug>');
      expect(err).toEqual([]);
    });

    it('`trustshell --help` names the per-command help', () => {
      expect(HELP).toContain('trustshell guard --help');
    });
  });

  describe('F10 / F11 / F12: guard errors and help', () => {
    it('`guard allow git` names the tool:git form, writes nothing, exit 2', () => {
      policy(['tool:inspect']);
      const before = policyText();
      expect(runGuard(['allow', 'git'], io, env())).toBe(2);
      expect(err.join('\n')).toContain('git is not an action, so nothing was written');
      expect(err.join('\n')).toContain('the action is tool:git');
      expect(policyText()).toBe(before);
    });

    it('`guard deny git` the same', () => {
      policy(['tool:git']);
      const before = policyText();
      expect(runGuard(['deny', 'git'], io, env())).toBe(2);
      expect(err.join('\n')).toContain('the action is tool:git');
      expect(policyText()).toBe(before);
    });

    it('a guard usage error prints guard\'s usage, not run\'s', () => {
      expect(runGuard(['allowed', 'tool:git'], io, env())).toBe(2);
      const e = err.join('\n');
      expect(e).toContain('trustshell guard init');
      expect(e).not.toContain('trustshell run --tool');
    });

    it('a run usage error prints run\'s usage, not guard\'s', () => {
      expect(runRun(['--class', 'nope'], io, env(), spawner)).toBe(2);
      const e = err.join('\n');
      expect(e).toContain('trustshell run --tool');
      expect(e).not.toContain('trustshell guard init');
    });

    it('`trustshell --help` lists guard init --force', () => {
      expect(HELP).toContain('guard init [--days N] [--force]');
    });
  });

  describe('F7: a limit of 0 still binds, and guard limit says so', () => {
    it('zeroLimitNote names every 0 limit and the command that raises it; none once all are above 0', () => {
      const p = { ...defaultPolicy(), per_tx_raw: '100', daily_raw: '0', total_raw: '0' };
      expect(zeroLimitNote(p)).toBe(
        'note        an amount must fit all three limits, and 0 allows none: daily and total are 0, so no amount passes yet (trustshell guard limit daily <n>, trustshell guard limit total <n>)',
      );
      expect(zeroLimitNote({ ...p, daily_raw: '500' })).toContain('total is 0');
      expect(zeroLimitNote({ ...p, daily_raw: '500', total_raw: '1000' })).toBeNull();
    });

    it('`guard allow spend` then `guard limit per-tx 100`: each says what is still 0; the decision itself is unchanged', () => {
      policy(['tool:inspect']);
      expect(runGuard(['allow', 'spend'], io, env())).toBe(0);
      expect(out.join('\n')).toContain('per-tx, daily and total are 0, so no amount passes yet');
      out = [];
      expect(runGuard(['limit', 'per-tx', '100'], io, env())).toBe(0);
      expect(out.join('\n')).toContain('daily and total are 0, so no amount passes yet');
      out = [];
      expect(runGuard(['check', '--tool', 'pay', '--class', 'spend', '--amount', '50'], io, env())).toBe(5); // still DENIED
      out = [];
      expect(runGuard(['limit', 'daily', '500'], io, env())).toBe(0);
      expect(out.join('\n')).toContain('total is 0, so no amount passes yet');
      out = [];
      expect(runGuard(['limit', 'total', '1000'], io, env())).toBe(0);
      expect(out.join('\n')).not.toContain('no amount passes yet');
      expect(runGuard(['check', '--tool', 'pay', '--class', 'spend', '--amount', '50'], io, env())).toBe(0);
    });

    it('`guard allow tool:git` adds no limit note: it is not about amounts', () => {
      policy(['tool:inspect']);
      expect(runGuard(['allow', 'tool:git'], io, env())).toBe(0);
      expect(out.join('\n')).not.toContain('note ');
    });
  });

  describe('F6: verifying your own export does not read as "a downgrade or a replay" and nothing more', () => {
    const prevCwd = process.cwd();
    afterEach(() => process.chdir(prevCwd));

    it('same policy as the one in force: the pinned reason stays, and the line adds that it is the same one', () => {
      process.chdir(home); // no .trustshell/profile.md here: the bundle carries no profile
      policy(['tool:bundle']);
      expect(runGuard(['sign'], io, env())).toBe(0);
      const file = join(home, 'my.bundle');
      expect(runBundle(['export', file], io, env())).toBe(0);
      out = [];
      expect(runBundle(['verify', file], io, env())).toBe(0);
      const v = out.join('\n');
      expect(v).toContain('would be suggested, NOT enforced: its nonce');
      expect(v).toMatch(/does not supersede .*a downgrade or a replay/);
      expect(v).toContain('It is the policy already in force here (same sha256), so importing it changes nothing');
    });

    it('a different, newer policy in force: no "same sha256" line (control)', () => {
      process.chdir(home);
      policy(['tool:bundle']);
      expect(runGuard(['sign'], io, env())).toBe(0);
      const file = join(home, 'old.bundle');
      expect(runBundle(['export', file], io, env())).toBe(0);
      expect(runGuard(['allow', 'tool:git'], io, env())).toBe(0); // nonce +1, a different policy
      out = [];
      expect(runBundle(['verify', file], io, env())).toBe(0);
      expect(out.join('\n')).toContain('a downgrade or a replay');
      expect(out.join('\n')).not.toContain('same sha256');
    });
  });

  describe('F3: learn inject with nothing to inject says why, on stderr only', () => {
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
});

describe('F2: inspect pointed at the guard ledger says what it is looking at', () => {
  const prevEnv = { ...process.env };
  let home = '';
  let out: string[] = [];
  let err: string[] = [];
  const io: CliIO = { out: (s) => out.push(s), err: (s) => err.push(s) };
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'ts-first-run-inspect-'));
    process.env.TRUSTSHELL_HOME = home;
    out = [];
    err = [];
  });
  afterEach(() => {
    process.env = { ...prevEnv };
    rmSync(home, { recursive: true, force: true });
  });

  it('`inspect ~/.trustshell/guard-receipts.jsonl`: the verdict and exit are unchanged (BROKEN, 1), and stderr names the format and guard show', async () => {
    expect(runGuard(['init'], io, process.env)).toBe(0);
    const ledger = join(home, GUARD_RECEIPTS_FILE);
    expect(isGuardLedger(readFileSync(ledger, 'utf8'))).toBe(true);
    out = [];
    err = [];
    expect(await run(parseArgs(['inspect', ledger]), {} as never, io)).toBe(1);
    expect(out.join('\n')).toContain('trustshell inspect  —  BROKEN');
    expect(err).toStrictEqual([GUARD_LEDGER_NOT_A_SESSION_LOG]);
    expect(err[0]).toContain('trustshell guard show verifies the ledger');
  });

  it('--json stdout is the same record as before: the note is on stderr only', async () => {
    expect(runGuard(['init'], io, process.env)).toBe(0);
    out = [];
    err = [];
    expect(await run(parseArgs(['inspect', join(home, GUARD_RECEIPTS_FILE), '--json']), {} as never, io)).toBe(1);
    expect(JSON.parse(out.join('\n'))).toMatchObject({ verdict: 'BROKEN', format: 'trustshell' });
    expect(err).toStrictEqual([GUARD_LEDGER_NOT_A_SESSION_LOG]);
  });

  it('a broken session log that is NOT a guard ledger gets no such line (control)', async () => {
    const log = join(home, 'session.jsonl');
    writeFileSync(log, '{"seq":1}\nnot json\n');
    expect(isGuardLedger(readFileSync(log, 'utf8'))).toBe(false);
    expect(await run(parseArgs(['inspect', log]), {} as never, io)).toBe(1);
    expect(err).toEqual([]);
  });
});

describe('F8 / F9: TRUSTSHELL_HOME and TRUSTSHELL_API_URL, as a stranger meets them', () => {
  it('`trustshell --help` says TRUSTSHELL_HOME moves neither the notes nor the profile, and names TRUSTSHELL_MEMORY', () => {
    expect(HELP).toContain('It does not move your notes or your profile');
    expect(HELP).toMatch(/\n {2}TRUSTSHELL_MEMORY {4}the local memory file/);
  });

  it('a refused TRUSTSHELL_API_URL is one line with the next step, never a stack trace', () => {
    const line = fatalLine(new ApiUrlError('TRUSTSHELL_API_URL must be https (plain http only for localhost), so nothing was sent to http://example.com'));
    expect(line).toContain('Unset TRUSTSHELL_API_URL, or point it at an https URL');
    expect(line).not.toContain('fatal');
    expect(line).not.toMatch(/\n\s+at /);
  });

  it('any other crash still prints "fatal" and its stack (control)', () => {
    expect(fatalLine(new Error('boom'))).toMatch(/^trustshell: fatal: Error: boom\n\s+at /);
  });

  it('the built CLI: `guard show` with an http TRUSTSHELL_API_URL exits 3 with the one line, no stack', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ts-first-run-url-'));
    try {
      const r = spawnSync(process.execPath, [join(__dirname, '..', 'dist', 'cli', 'index.js'), 'guard', 'show'], {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, TRUSTSHELL_HOME: dir, TRUSTSHELL_API_URL: 'http://example.com' },
      });
      expect(r.status).toBe(3);
      expect(r.stderr).toContain('Unset TRUSTSHELL_API_URL');
      expect(r.stderr).not.toMatch(/\n\s+at /);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('F4: the CLI drops Node\'s SQLite ExperimentalWarning, and only that warning', () => {
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
    const dir = mkdtempSync(join(tmpdir(), 'ts-first-run-dist-'));
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
