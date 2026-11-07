/**
 * C5 (docs/CONTAINMENT_MATRIX.md): an allowed interpreter runs only scripts the policy pins by sha256.
 * Before this, `guard allow tool:node` let `trustshell run --tool node -- node -e '<anything>'` start: allowing an
 * interpreter allowed any code it was given. Every test uses a temp TRUSTSHELL_HOME and a fake spawner, so no
 * interpreter is started and the real home is never read or written.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CliIO } from '../src/cli';
import { EXIT_REFUSED, runGuard, runRun, type Spawner } from '../src/cli/guard';
import { GUARD_RECEIPTS_FILE, POLICY_FILE, defaultPolicy, parsePolicy, readLedger, renderPolicyDocument, type GuardRecord, type LocalPolicy } from '../src/lib/guardrails';

/** The rule every interpreter denial states, word for word. */
const RULE = 'an allowed interpreter runs only a script the policy pins by sha256';
/** Variables that make an interpreter run code before the script: the tests start from an environment without them. */
const STARTUP_VARS = ['NODE_OPTIONS', 'BASH_ENV', 'ENV', 'ZDOTDIR', 'PYTHONSTARTUP', 'PYTHONINSPECT', 'PYTHONPATH', 'PYTHONHOME'];
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

let canLink = false;
beforeAll(() => {
  const d = mkdtempSync(join(tmpdir(), 'ts-c5-link-'));
  try {
    writeFileSync(join(d, 't'), 'x');
    symlinkSync(join(d, 't'), join(d, 'l'));
    canLink = true;
  } catch {
    /* Windows without the symlink privilege: the symlink test reports as skipped, not passed */
  }
  rmSync(d, { recursive: true, force: true });
});

describe('C5: an allowed interpreter runs only scripts the policy pins by sha256', () => {
  const prevCwd = process.cwd();
  let root = '';
  let home = '';
  let work = '';
  let out: string[] = [];
  let err: string[] = [];
  let started: string[][] = [];
  const io: CliIO = { out: (s) => out.push(s), err: (s) => err.push(s) };
  const spawner: Spawner = (cmd, args) => (started.push([cmd, ...args]), { status: 0, signal: null });
  const env = (extra: Record<string, string> = {}): NodeJS.ProcessEnv => {
    const e: NodeJS.ProcessEnv = { ...process.env, TRUSTSHELL_HOME: home, ...extra };
    for (const k of STARTUP_VARS) if (!(k in extra)) delete e[k];
    return e;
  };
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
  const doc = () => JSON.parse(readFileSync(join(home, POLICY_FILE), 'utf8')) as { policy: LocalPolicy & { scripts?: { tool: string; path: string; sha256: string }[] } };
  const policyFile = (p: Record<string, unknown>) => {
    mkdirSync(home, { recursive: true });
    writeFileSync(join(home, POLICY_FILE), renderPolicyDocument({ policy: { ...defaultPolicy(), ...p } as LocalPolicy, signature: null }));
  };
  const real = (f: string) => realpathSync.native(join(work, f));
  const pin = (tool: string, f: string) => ({ tool, path: real(f), sha256: sha(readFileSync(join(work, f), 'utf8')) });

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ts-c5-'));
    home = join(root, 'home');
    work = join(root, 'work');
    mkdirSync(work, { recursive: true });
    writeFileSync(join(work, 'ok.js'), 'console.log("pinned")\n');
    writeFileSync(join(work, 'other.js'), 'console.log("not pinned")\n');
    process.chdir(work);
    started = [];
  });
  afterEach(() => {
    process.chdir(prevCwd);
    rmSync(root, { recursive: true, force: true });
  });

  it('guard allow tool:node --script pins the file by sha256 (a policy-change record names it); the pinned script runs, recorded by hash', () => {
    expect(guard('init')).toBe(0);
    expect(guard('allow', 'tool:node', '--script', 'ok.js')).toBe(0);
    expect(doc().policy.actions).toContain('tool:node');
    expect(doc().policy.scripts).toEqual([pin('node', 'ok.js')]);
    const change = last();
    expect(change.kind).toBe('policy-change');
    expect(change.change?.via).toContain('guard allow tool:node --script');
    expect(change.change?.via).toContain(pin('node', 'ok.js').sha256);

    expect(runIt(['--tool', 'node', '--', 'node', 'ok.js', '--a-script-flag'])).toBe(0);
    expect(started).toEqual([['node', 'ok.js', '--a-script-flag']]);
    const [d, o] = records().slice(-2);
    expect(d).toMatchObject({ kind: 'decision', authorized: { decision: 'ALLOWED' }, requested: { executable: 'node', script_sha256: pin('node', 'ok.js').sha256 } });
    expect(o).toMatchObject({ kind: 'outcome', executed: { exit_code: 0 } });
    // The run records hash the script; they never carry its path (the command is recorded by hash, never by its text).
    expect(JSON.stringify(records().filter((r) => r.kind !== 'policy-change'))).not.toContain('ok.js');

    // The interpreter named by a PATH is now refused (Strix CWE-184, #679): a binary elsewhere that only shares the
    // basename "node" must not satisfy tool:node. The tool is named plainly and resolved on PATH; the script may still
    // be an absolute path. Was previously ALLOWED ("same file by absolute path = same pin") — that was the bypass surface.
    expect(runIt(['--tool', 'node', '--', '/usr/local/bin/node', join(work, 'ok.js')])).toBe(EXIT_REFUSED);
    expect(started).toHaveLength(1); // only the bare-name run above spawned
    expect(last().authorized.reasons.join(' ')).toMatch(/by path/);
  });

  it('an unpinned script is refused before it starts, with a reason that states the rule', () => {
    policyFile({ actions: ['tool:node'], scripts: [pin('node', 'ok.js')] });
    expect(runIt(['--tool', 'node', '--', 'node', 'other.js'])).toBe(EXIT_REFUSED);
    expect(started).toEqual([]);
    expect(last()).toMatchObject({ kind: 'decision', authorized: { decision: 'DENIED' }, executed: 'not run' });
    expect(last().authorized.reasons.join(' ')).toMatch(/is not pinned for node/);
    expect(last().authorized.reasons.join(' ')).toContain(RULE);
  });

  it('the pinned path with changed content is refused; pinning it again is an explicit, recorded change', () => {
    expect(guard('init')).toBe(0);
    expect(guard('allow', 'tool:node', '--script', 'ok.js')).toBe(0);
    writeFileSync(join(work, 'ok.js'), 'require("child_process").execSync("anything")\n');
    expect(runIt(['--tool', 'node', '--', 'node', 'ok.js'])).toBe(EXIT_REFUSED);
    expect(started).toEqual([]);
    expect(last().authorized.reasons.join(' ')).toMatch(/changed since it was pinned/);
    expect(guard('allow', 'tool:node', '--script', 'ok.js')).toBe(0);
    expect(doc().policy.scripts).toEqual([pin('node', 'ok.js')]); // replaced, not added beside the old hash
    expect(runIt(['--tool', 'node', '--', 'node', 'ok.js'])).toBe(0);
  });

  it('COMPATIBILITY: a policy from before C5 that allows a bare interpreter now refuses every run of it and says how to pin; nothing is widened', () => {
    policyFile({ actions: ['tool:node', 'tool:python', 'tool:git'] });
    for (const argv of [['node', 'ok.js'], ['node', '-e', '0'], ['python', 'ok.js']]) {
      expect(runIt(['--tool', argv[0] as string, '--', ...argv])).toBe(EXIT_REFUSED);
      expect(last().authorized.reasons.join(' ')).toContain(`trustshell guard allow tool:${argv[0]} --script <path>`);
    }
    expect(started).toEqual([]);
    expect(runIt(['--tool', 'git', '--', 'git', 'status'])).toBe(0); // C1 unchanged for a non-interpreter
    expect(guard('show')).toBe(0);
    expect(out.join('\n')).toMatch(/scripts {5}none pinned/);
  });

  it('the `tool` wildcard allows any executable by name (C1) but no interpreter without a pin', () => {
    policyFile({ actions: ['tool'] });
    expect(runIt(['--tool', 'git', '--', 'git', 'status'])).toBe(0);
    expect(runIt(['--tool', 'node', '--', 'node', 'ok.js'])).toBe(EXIT_REFUSED);
    expect(runIt(['--tool', 'bash', '--', 'bash', 'ok.js'])).toBe(EXIT_REFUSED);
    expect(started).toEqual([['git', 'status']]);
    expect(records().find((r) => r.requested.executable === 'git')?.requested).not.toHaveProperty('script_sha256');
  });

  const TOOLS = ['node', 'nodejs', 'python', 'python3', 'py', 'sh', 'bash', 'dash', 'zsh', 'powershell', 'pwsh'];
  const pinAll = () => policyFile({ actions: TOOLS.map((t) => `tool:${t}`), scripts: TOOLS.map((t) => pin(t, 'ok.js')) });

  it.each([
    ['node', 'ok.js', '--x'],
    ['nodejs', 'ok.js'],
    ['python', 'ok.js'],
    ['python3', 'ok.js', '-c', 'is a script argument here'],
    ['py', 'ok.js'],
    ['sh', 'ok.js'],
    ['bash', 'ok.js', '-c'],
    ['zsh', 'ok.js'],
    ['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'ok.js', '-Command', 'a script argument'],
    ['pwsh', '-noprofile', '-NonInteractive', '-NoLogo', '-file', 'ok.js'],
  ])('ALLOWED when the script is pinned: %s %s', (...argv: string[]) => {
    pinAll();
    expect(runIt(['--tool', argv[0] as string, '--', ...argv])).toBe(0);
    expect(started).toEqual([argv]);
    expect(records().slice(-2)[0]?.requested).toMatchObject({ script_sha256: pin('node', 'ok.js').sha256 });
  });

  it.each([
    // node: inline code, stdin, REPL, preloaded modules and loaders, subcommands, anything before the script
    ['node'],
    ['node', '-'],
    ['node', '-e', '0'],
    ['node', '--eval', '0'],
    ['node', '-p', '1'],
    ['node', '--print', '1'],
    ['node', '-i'],
    ['node', '-r', './ok.js', 'ok.js'],
    ['node', '--require=./ok.js', 'ok.js'],
    ['node', '--import', './ok.js', 'ok.js'],
    ['node', '--loader', './ok.js', 'ok.js'],
    ['node', '--experimental-loader', './ok.js', 'ok.js'],
    ['node', '--env-file=.env', 'ok.js'],
    ['node', '--run', 'build'],
    ['node', '--', 'ok.js'],
    ['node', 'inspect', 'ok.js'],
    ['nodejs', '-e', '0'],
    // python: inline code, stdin, REPL, modules, any option
    ['python'],
    ['python', '-'],
    ['python', '-c', '0'],
    ['python', '-m', 'http.server'],
    ['python', '-i', 'ok.js'],
    ['python3', '-I', 'ok.js'],
    ['py', '-3', 'ok.js'],
    // sh and its kin: inline code, stdin, interactive, any option
    ['sh'],
    ['sh', '-'],
    ['sh', '-c', 'true'],
    ['sh', '-s'],
    ['bash', '-c', 'true'],
    ['bash', '-i'],
    ['bash', '--rcfile', 'ok.js', '-i'],
    ['bash', '+x', 'ok.js'],
    ['dash', '-c', 'true'],
    ['zsh', '-c', 'true'],
    // powershell: -Command (and its positional form), -EncodedCommand, stdin, REPL, profiles, anything unlisted
    ['powershell'],
    ['powershell', '-Command', '0'],
    ['powershell', '-c', '0'],
    ['powershell', '-EncodedCommand', 'MAA='],
    ['powershell', '-NoProfile', '-Command', '-'],
    ['powershell', '-NoProfile', '-File', '-'],
    ['powershell', '-NoProfile'],
    ['powershell', 'ok.js'],
    ['powershell', '-File', 'ok.js'],
    ['powershell', '-NoProfile', '-NoExit', '-File', 'ok.js'],
    ['powershell', '-NoProfile', '/Command', '0'],
    ['powershell', '-NoProfile', '-ExecutionPolicy', '-Command', '0'],
    ['pwsh', '-Command', '0'],
    ['pwsh', '-File', 'ok.js'],
  ])('REFUSED even with ok.js pinned: %s %s %s', (...argv: string[]) => {
    pinAll();
    expect(runIt(['--tool', argv[0] as string, '--', ...argv])).toBe(EXIT_REFUSED);
    expect(started).toEqual([]);
    expect(last()).toMatchObject({ kind: 'decision', authorized: { decision: 'DENIED' }, executed: 'not run' });
    expect(last().authorized.reasons.join(' ')).toContain(RULE);
  });

  it.each([
    ['node', 'NODE_OPTIONS', '--require ./other.js'],
    ['bash', 'BASH_ENV', './other.js'],
    ['sh', 'ENV', './other.js'],
    ['zsh', 'ZDOTDIR', '.'],
    ['python', 'PYTHONINSPECT', '1'],
    ['python', 'PYTHONSTARTUP', './other.js'],
    ['python', 'PYTHONPATH', '.'],
    ['python', 'PYTHONHOME', '.'],
  ])('REFUSED when %s would run code before the script: %s is set', (tool, name, value) => {
    pinAll();
    expect(runIt(['--tool', tool, '--', tool, 'ok.js'], { [name]: value })).toBe(EXIT_REFUSED);
    expect(started).toEqual([]);
    expect(last().authorized.reasons.join(' ')).toContain(`${name} is set`);
    expect(runIt(['--tool', tool, '--', tool, 'ok.js'])).toBe(0); // control: the same run without it starts
  });

  it('a script that cannot be resolved to one regular file is refused: missing, or a directory', () => {
    pinAll();
    mkdirSync(join(work, 'pkg'));
    for (const f of ['missing.js', 'pkg']) {
      expect(runIt(['--tool', 'node', '--', 'node', f])).toBe(EXIT_REFUSED);
      expect(last().authorized.reasons.join(' ')).toMatch(/cannot be resolved to one regular file|is not a regular file/);
    }
    expect(started).toEqual([]);
  });

  (canLink ? it : it.skip)('symlinks: the pin is the file the interpreter opens; repointing the link is refused', () => {
    symlinkSync(join(work, 'ok.js'), join(work, 'link.js'));
    expect(guard('init')).toBe(0);
    expect(guard('allow', 'tool:node', '--script', 'link.js')).toBe(0);
    expect(doc().policy.scripts?.[0]?.path).toBe(real('ok.js'));
    expect(runIt(['--tool', 'node', '--', 'node', 'link.js'])).toBe(0);
    unlinkSync(join(work, 'link.js'));
    symlinkSync(join(work, 'other.js'), join(work, 'link.js'));
    expect(runIt(['--tool', 'node', '--', 'node', 'link.js'])).toBe(EXIT_REFUSED);
    expect(started).toHaveLength(1);
  });

  it('guard allow --script refuses a non-interpreter and an unresolvable path, and writes nothing', () => {
    expect(guard('init')).toBe(0);
    const before = readFileSync(join(home, POLICY_FILE), 'utf8');
    const n = records().length;
    expect(guard('allow', 'tool:git', '--script', 'ok.js')).toBe(2);
    expect(guard('allow', 'tool:node', '--script', 'missing.js')).toBe(2);
    expect(guard('allow', 'spend', '--script', 'ok.js')).toBe(2);
    expect(guard('allow', 'tool:node', '--script')).toBe(2);
    expect(readFileSync(join(home, POLICY_FILE), 'utf8')).toBe(before);
    expect(records()).toHaveLength(n);
  });

  it('a bare guard allow of an interpreter says it starts nothing until a script is pinned', () => {
    expect(guard('init')).toBe(0);
    expect(guard('allow', 'tool:node')).toBe(0);
    expect(out.join('\n')).toContain('trustshell guard allow tool:node --script <path>');
  });

  it('guard deny --script removes one pin; guard deny tool:node removes its pins too, so allowing it again revives none', () => {
    expect(guard('init')).toBe(0);
    expect(guard('allow', 'tool:node', '--script', 'ok.js')).toBe(0);
    expect(guard('allow', 'tool:node', '--script', 'other.js')).toBe(0);
    expect(guard('deny', 'tool:node', '--script', 'other.js')).toBe(0);
    expect(doc().policy.scripts).toEqual([pin('node', 'ok.js')]);
    expect(doc().policy.actions).toContain('tool:node');
    expect(guard('deny', 'tool:node')).toBe(0);
    expect(doc().policy.scripts).toBeUndefined();
    expect(guard('allow', 'tool:node')).toBe(0);
    expect(runIt(['--tool', 'node', '--', 'node', 'ok.js'])).toBe(EXIT_REFUSED);
  });

  it('ledger: allow, pin, an allowed run, a denied run and an unpin each leave a record, in one intact chain', () => {
    expect(guard('init')).toBe(0);
    expect(guard('allow', 'tool:node', '--script', 'ok.js')).toBe(0);
    expect(runIt(['--tool', 'node', '--', 'node', 'ok.js'])).toBe(0);
    expect(runIt(['--tool', 'node', '--', 'node', '-e', '0'])).toBe(EXIT_REFUSED);
    expect(guard('deny', 'tool:node', '--script', 'ok.js')).toBe(0);
    const rs = records();
    expect(rs.map((r) => [r.kind, r.authorized.decision])).toEqual([
      ['policy-change', 'ALLOWED'],
      ['policy-change', 'ALLOWED'],
      ['decision', 'ALLOWED'],
      ['outcome', 'ALLOWED'],
      ['decision', 'DENIED'],
      ['policy-change', 'ALLOWED'],
    ]);
    expect(rs[5]?.change?.via).toContain('guard deny tool:node --script');
    for (let i = 1; i < rs.length; i++) if (rs[i]?.kind === 'policy-change' && i > 1) expect(rs[i]?.change?.before_sha256).not.toBe(rs[i]?.change?.after_sha256);
    expect(readLedger(readFileSync(join(home, GUARD_RECEIPTS_FILE), 'utf8')).verdict).toBe('INTACT');
  });
});

describe('parsePolicy: scripts, a local-only field like autonomy', () => {
  const NOW = 1_800_000_000;
  const ABS = join(tmpdir(), 'ok.js');
  const H = 'a'.repeat(64);
  const base = { subject: 'a', actions: ['tool:node'], expires_at: NOW, nonce: '1' };

  it('a well-formed pin list parses; a policy without one has no scripts key, so it hashes as before', () => {
    const r = parsePolicy({ ...base, scripts: [{ tool: 'node', path: ABS, sha256: H }] });
    expect(r.ok && (r.policy as unknown as Record<string, unknown>).scripts).toEqual([{ tool: 'node', path: ABS, sha256: H }]);
    const r0 = parsePolicy(base);
    expect(r0.ok && 'scripts' in r0.policy).toBe(false);
  });

  it.each([
    ['a sha256 that is not 64 hex', [{ tool: 'node', path: ABS, sha256: 'xyz' }]],
    ['a tool that is not an interpreter Guard pins', [{ tool: 'git', path: ABS, sha256: H }]],
    ['a relative path', [{ tool: 'node', path: 'ok.js', sha256: H }]],
    ['the same tool and path twice', [{ tool: 'node', path: ABS, sha256: H }, { tool: 'node', path: ABS, sha256: H }]],
    ['an unknown key', [{ tool: 'node', path: ABS, sha256: H, note: 'x' }]],
    ['not a list', { tool: 'node', path: ABS, sha256: H }],
  ])('%s is an error', (_n, scripts) => {
    expect(parsePolicy({ ...base, scripts }).ok).toBe(false);
  });
});
