/**
 * `trustshell run` binds the executable to the --tool NAME, resolved on PATH at spawn. A path- or drive-qualified
 * command[0] is refused, so a binary elsewhere on disk cannot satisfy a grant by sharing a basename.
 *
 * Regression for the Strix CWE-184 finding on PR #679: `run --tool node -- /tmp/attacker/node script.js` was ALLOWED
 * (basename "node" matched the grant, the script pin held) and then `spawn(command[0])` ran the attacker's binary
 * VERBATIM, which ignores the pinned script. Pre-fix, the by-path case below returns 0 and the spawner runs it;
 * post-fix it is EXIT_REFUSED and the spawner is never touched. Fake spawner + temp home: no real interpreter starts.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CliIO } from '../src/cli';
import { EXIT_REFUSED, executableIdentity, runRun, type Spawner } from '../src/cli/guard';
import { defaultPolicy, POLICY_FILE, GUARD_RECEIPTS_FILE, renderPolicyDocument, type GuardRecord, type LocalPolicy } from '../src/lib/guardrails';

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const STARTUP_VARS = ['NODE_OPTIONS', 'BASH_ENV', 'ENV', 'ZDOTDIR', 'PYTHONSTARTUP', 'PYTHONINSPECT', 'PYTHONPATH', 'PYTHONHOME'];

describe('run binds the executable to the tool name, not a spoofable basename (CWE-184, #679)', () => {
  const prevCwd = process.cwd();
  let root = '';
  let home = '';
  let work = '';
  let started: string[][] = [];
  const io: CliIO = { out: () => undefined, err: () => undefined };
  const spawner: Spawner = (cmd, args) => (started.push([cmd, ...args]), { status: 0, signal: null });
  const env = (): NodeJS.ProcessEnv => {
    const e: NodeJS.ProcessEnv = { ...process.env, TRUSTSHELL_HOME: home };
    for (const k of STARTUP_VARS) delete e[k];
    return e;
  };
  const real = (f: string) => realpathSync.native(join(work, f));
  const lastReasons = () => {
    const recs = readFileSync(join(home, GUARD_RECEIPTS_FILE), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as GuardRecord);
    return (recs.pop() as GuardRecord).authorized.reasons.join(' ');
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ts-exeid-'));
    home = join(root, 'home');
    work = join(root, 'work');
    mkdirSync(work, { recursive: true });
    writeFileSync(join(work, 'ok.js'), 'console.log("pinned")\n');
    mkdirSync(home, { recursive: true });
    const scripts = [{ tool: 'node', path: real('ok.js'), sha256: sha(readFileSync(join(work, 'ok.js'), 'utf8')) }];
    writeFileSync(join(home, POLICY_FILE), renderPolicyDocument({ policy: { ...defaultPolicy(), actions: ['tool:node'], scripts } as LocalPolicy, signature: null }));
    process.chdir(work);
    started = [];
  });
  afterEach(() => {
    process.chdir(prevCwd);
    rmSync(root, { recursive: true, force: true });
  });

  it('the genuine bare-name interpreter with a pinned script is ALLOWED and spawns', () => {
    expect(runRun(['--tool', 'node', '--', 'node', 'ok.js'], io, env(), spawner)).toBe(0);
    expect(started).toEqual([['node', 'ok.js']]);
  });

  it('an interpreter supplied BY PATH is REFUSED before anything spawns, even with the pinned script (the bypass)', () => {
    const attacker = join(work, 'node'); // basename "node", but given as a path
    expect(runRun(['--tool', 'node', '--', attacker, 'ok.js'], io, env(), spawner)).toBe(EXIT_REFUSED);
    expect(started).toEqual([]); // the attacker binary never ran
    expect(lastReasons()).toMatch(/path|bare name/);
  });

  it('a relative path and a Windows drive-qualified command are refused too', () => {
    expect(runRun(['--tool', 'node', '--', './node', 'ok.js'], io, env(), spawner)).toBe(EXIT_REFUSED);
    expect(runRun(['--tool', 'node', '--', 'sub/node', 'ok.js'], io, env(), spawner)).toBe(EXIT_REFUSED);
    expect(runRun(['--tool', 'node', '--', 'C:\\x\\node.exe', 'ok.js'], io, env(), spawner)).toBe(EXIT_REFUSED);
    expect(started).toEqual([]);
  });

  it('executableIdentity (PURE): a bare name matches; a path or a different name is refused', () => {
    expect(executableIdentity('node', 'node').reasons).toEqual([]);
    expect(executableIdentity('NODE.EXE', 'node').reasons).toEqual([]); // case + .exe stripped
    expect(executableIdentity('/usr/local/bin/node', 'node').reasons.join(' ')).toMatch(/by path/);
    expect(executableIdentity('./node', 'node').reasons.join(' ')).toMatch(/by path/);
    expect(executableIdentity('sub/node', 'node').reasons.join(' ')).toMatch(/by path/);
    expect(executableIdentity('C:\\x\\node.exe', 'node').reasons.join(' ')).toMatch(/by path/);
    expect(executableIdentity('python', 'node').reasons.join(' ')).toMatch(/not node/);
  });
});
