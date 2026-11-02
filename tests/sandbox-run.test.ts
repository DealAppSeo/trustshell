/**
 * C2 (docs/CONTAINMENT_MATRIX.md): `trustshell run --sandbox` runs the started command in the disposable mission
 * container, and the owner can require it (`run.require_sandbox`). No Docker here: a fake docker CLI stands in,
 * so these check the wiring (Guard first, the runner second, the airlock, an explicit promote), not containment.
 * The real-Docker run is the `run --sandbox` step of .github/workflows/sandbox-mission.yml.
 * Every test uses a temp TRUSTSHELL_HOME, a temp project directory and a spawner that records instead of starting.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import type { CliIO } from '../src/cli';
import { parseArgs } from '../src/cli';
import { EXIT_REFUSED, NEVER_GUARDED, runGuard, runRun, type Spawner } from '../src/cli/guard';
import { GUARD_RECEIPTS_FILE, POLICY_FILE, defaultPolicy, parsePolicy, policySha256, readLedger, type GuardRecord } from '../src/lib/guardrails';
import { MOUNTS, PINNED_DIGEST, type Exec, type ExecResult } from '../src/sandbox/mission';
import { verifyPassport } from '../src/sandbox/passport';
import { verifyReceipt, type SignedReceipt } from '../src/sandbox/receipt';

// Loose types on purpose: written before the feature, these compile against main and fail on behaviour there.
type Run = (argv: string[], io: CliIO, env: NodeJS.ProcessEnv, spawn: Spawner, exec: Exec) => number;
const runRunSandboxable = runRun as unknown as Run;
const sandboxCli = (argv: string[], io: CliIO, env: NodeJS.ProcessEnv): number =>
  (require('../src/sandbox/run') as { sandboxCli: (a: string[], i: CliIO, e: NodeJS.ProcessEnv) => number }).sandboxCli(argv, io, env);
const sandboxOf = (r: GuardRecord | undefined): unknown => (r?.requested as Record<string, unknown> | undefined)?.sandbox;

const ok = (stdout = ''): ExecResult => ({ status: 0, stdout, stderr: '', error: null, timedOut: false });
const fail = (stderr: string, error: string | null = null): ExecResult => ({ status: error ? null : 1, stdout: '', stderr, error, timedOut: false });
const IMAGE_ENV = ['PATH=/usr/local/bin:/usr/bin:/bin', 'NODE_VERSION=22.0.0'];
const RULE = 'an allowed interpreter runs only a script the policy pins by sha256';

/**
 * A fake docker CLI that behaves like a working one: the inspect document is built from the `docker create`
 * arguments, `start` runs `worker` against the host side of the mounts, `rm` makes the container disappear.
 */
function fakeDocker(worker: (outbox: string) => void = () => {}, runtimes = ['runc', 'runsc']) {
  const calls: string[][] = [];
  let created: string[] = [];
  let removed = false;
  const src = (dst: string) => {
    const m = created.find((a) => a.includes(`dst=${dst}`))?.match(/src=([^,]+)/);
    return m ? (m[1] as string) : '';
  };
  const opt = (name: string) => created[created.indexOf(name) + 1] ?? '';
  const exec: Exec = (_cmd, args) => {
    calls.push(args);
    const [a, b] = args;
    if (a === 'version') return ok('27.0.0\n');
    if (a === 'info') return ok(JSON.stringify(Object.fromEntries(runtimes.map((r) => [r, {}]))));
    if (a === 'image' && b === 'inspect') return ok(JSON.stringify([{ Id: 'sha256:img', RepoDigests: [`node@${PINNED_DIGEST}`], Config: { Env: IMAGE_ENV } }]));
    if (a === 'create') {
      created = args;
      return ok('c0ffee\n');
    }
    if (a === 'container' && b === 'inspect') {
      return ok(
        JSON.stringify([
          {
            Config: { User: opt('--user'), Env: IMAGE_ENV },
            HostConfig: {
              NetworkMode: opt('--network'),
              ReadonlyRootfs: created.includes('--read-only'),
              CapDrop: [opt('--cap-drop')],
              CapAdd: null,
              SecurityOpt: [opt('--security-opt')],
              Privileged: false,
              PidsLimit: Number(opt('--pids-limit')),
              Memory: Number(opt('--memory')),
              MemorySwap: Number(opt('--memory-swap')),
              NanoCpus: Math.round(Number(opt('--cpus')) * 1e9),
              Runtime: opt('--runtime'),
              Tmpfs: { '/tmp': opt('--tmpfs').slice('/tmp:'.length) },
            },
            Mounts: [
              { Type: 'bind', Source: src(MOUNTS.input), Destination: MOUNTS.input, RW: false },
              { Type: 'bind', Source: src(MOUNTS.outbox), Destination: MOUNTS.outbox, RW: true },
              { Type: 'bind', Source: src(MOUNTS.token), Destination: MOUNTS.token, RW: false },
            ],
            State: { ExitCode: 0, OOMKilled: false },
          },
        ]),
      );
    }
    if (a === 'inspect') return removed ? fail('Error: No such object: c0ffee') : ok('[{}]');
    if (a === 'start') {
      worker(src(MOUNTS.outbox));
      return ok('');
    }
    if (a === 'wait') return ok('0\n');
    if (a === 'logs' || a === 'kill') return ok('');
    if (a === 'rm') {
      removed = true;
      return ok('');
    }
    return fail(`unexpected ${args.join(' ')}`);
  };
  return { exec, calls, created: () => created };
}

/** Every file under `dir` with the sha256 of its bytes: the host working directory, before and after. */
function snapshot(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const n of readdirSync(d).sort()) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(`${relative(dir, p)} ${createHash('sha256').update(readFileSync(p)).digest('hex')}`);
    }
  };
  walk(dir);
  return out;
}

describe('C2: trustshell run --sandbox, and the owner switch run.require_sandbox', () => {
  const prevCwd = process.cwd();
  let root = '';
  let home = '';
  let proj = '';
  let out: string[] = [];
  let err: string[] = [];
  let started: string[][] = [];
  const io: CliIO = { out: (s) => out.push(s), err: (s) => err.push(s) };
  const spawner: Spawner = (cmd, args) => (started.push([cmd, ...args]), { status: 0, signal: null });
  const env = (): NodeJS.ProcessEnv => ({ ...process.env, TRUSTSHELL_HOME: home });
  const guard = (...argv: string[]) => {
    out = [];
    err = [];
    return runGuard(argv, io, env());
  };
  const run = (argv: string[], exec: Exec) => {
    out = [];
    err = [];
    return runRunSandboxable(argv, io, env(), spawner, exec);
  };
  const noDocker = () => {
    const calls: string[][] = [];
    const exec: Exec = (_c, args) => (calls.push(args), fail('', 'ENOENT'));
    return { exec, calls };
  };
  const ledger = (): GuardRecord[] => {
    const text = readFileSync(join(home, GUARD_RECEIPTS_FILE), 'utf8');
    expect(readLedger(text).verdict).toBe('INTACT');
    return text.split('\n').filter(Boolean).map((l) => JSON.parse(l) as GuardRecord);
  };
  const policy = () => JSON.parse(readFileSync(join(home, POLICY_FILE), 'utf8')).policy;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'ts-c2-')));
    home = join(root, 'home');
    proj = join(root, 'proj');
    mkdirSync(join(proj, 'sub'), { recursive: true });
    writeFileSync(join(proj, 'notes.txt'), 'project notes\n');
    writeFileSync(join(proj, 'sub', 'data.json'), '[1,2,3]\n');
    process.chdir(proj);
    started = [];
    expect(guard('init')).toBe(0);
    expect(guard('allow', 'tool:ls')).toBe(0);
  });
  afterEach(() => {
    process.chdir(prevCwd);
    rmSync(root, { recursive: true, force: true });
  });

  describe('flags', () => {
    it('--runtime is refused without --sandbox, and an unknown runtime is refused; neither runs anything', () => {
      const d = noDocker();
      expect(run(['--runtime', 'runsc', '--tool', 'ls', '--', 'ls'], d.exec)).toBe(2);
      expect(err.join('\n')).toMatch(/--runtime .*--sandbox/);
      expect(run(['--sandbox', '--runtime', 'kata', '--tool', 'ls', '--', 'ls'], d.exec)).toBe(2);
      expect(err.join('\n')).toMatch(/--runtime takes runc or runsc/);
      expect(d.calls).toEqual([]);
      expect(started).toEqual([]);
    });

    it('--sandbox --runtime runsc reaches the runner asking for runsc, and is refused when docker does not have it', () => {
      const f = fakeDocker(() => {}, ['runc']);
      expect(run(['--sandbox', '--runtime', 'runsc', '--tool', 'ls', '--', 'ls'], f.exec)).toBe(3);
      expect(err.join('\n')).toMatch(/runtime runsc was requested/);
      expect(f.calls.some((a) => a[0] === 'create')).toBe(false);
      expect(started).toEqual([]);
    });

    it('the usage names --sandbox and --runtime', () => {
      run(['--help'], noDocker().exec);
      expect(out.join('\n')).toMatch(/--sandbox \[--runtime runc\|runsc\]/);
    });
  });

  describe('Guard decides first; a denied command never reaches the runner', () => {
    it('a tool the policy does not list is DENIED and docker is never called', () => {
      const d = noDocker();
      expect(run(['--sandbox', '--tool', 'cat', '--', 'cat', 'notes.txt'], d.exec)).toBe(EXIT_REFUSED);
      expect(d.calls).toEqual([]);
      expect(started).toEqual([]);
      expect(ledger().slice(-1)[0]?.authorized.decision).toBe('DENIED');
    });

    it('C1 still applies: the tool label must be the executable', () => {
      const d = noDocker();
      expect(run(['--sandbox', '--tool', 'ls', '--', 'cat', 'notes.txt'], d.exec)).toBe(EXIT_REFUSED);
      expect(d.calls).toEqual([]);
    });

    it('C5 still applies: an interpreter with inline code is DENIED before the sandbox is used', () => {
      expect(guard('allow', 'tool:node')).toBe(0);
      const d = noDocker();
      expect(run(['--sandbox', '--tool', 'node', '--', 'node', '-e', '1'], d.exec)).toBe(EXIT_REFUSED);
      expect(err.join('\n')).toContain(RULE);
      expect(d.calls).toEqual([]);
    });

    it('an ALLOWED decision is in the ledger, marked sandboxed, before docker is first called', () => {
      let seenAtFirstCall: GuardRecord | undefined;
      const exec: Exec = (_c, _args) => {
        seenAtFirstCall ??= ledger().slice(-1)[0];
        return fail('', 'ENOENT');
      };
      run(['--sandbox', '--tool', 'ls', '--', 'ls'], exec);
      expect(seenAtFirstCall?.authorized.decision).toBe('ALLOWED');
      expect(sandboxOf(seenAtFirstCall)).toBe(true);
    });
  });

  describe('no container runtime: refused, never run on the host', () => {
    it('refuses with exit 3, says nothing ran, records the outcome as not run, and never calls the spawner', () => {
      const d = noDocker();
      expect(run(['--sandbox', '--tool', 'ls', '--', 'ls'], d.exec)).toBe(3);
      expect(err.join('\n')).toMatch(/no container runtime/);
      expect(err.join('\n')).toMatch(/nothing was run/i);
      expect(started).toEqual([]);
      expect(d.calls.every((a) => a[0] === 'version')).toBe(true);
      const last = ledger().slice(-1)[0];
      expect(last?.kind).toBe('outcome');
      expect(last?.executed).toBe('not run');
      expect(existsSync(join(home, 'sandbox', 'missions'))).toBe(false);
    });

    it('refuses a current directory that holds the TrustShell home (its keys would be mounted), before docker is called', () => {
      process.chdir(root); // root holds home/
      const d = noDocker();
      expect(run(['--sandbox', '--tool', 'ls', '--', 'ls'], d.exec)).toBe(3);
      expect(err.join('\n')).toMatch(/TrustShell home/);
      expect(d.calls).toEqual([]);
      expect(started).toEqual([]);
    });

    it("refuses when the current directory nests a second TrustShell home's signing keys, before docker is called", () => {
      // A non-active TrustShell home left inside the project: a read-only cwd mount would expose its keys.
      mkdirSync(join(proj, 'old', '.trustshell', 'sandbox', 'keys-harness'), { recursive: true });
      writeFileSync(join(proj, 'old', '.trustshell', 'sandbox', 'keys-harness', 'ed25519'), 'PRIVATE\n');
      const d = noDocker();
      expect(run(['--sandbox', '--tool', 'ls', '--', 'ls'], d.exec)).toBe(3);
      expect(err.join('\n')).toMatch(/signing keys/i);
      expect(d.calls).toEqual([]);
      expect(started).toEqual([]);
    });
  });

  describe('run.require_sandbox: the owner switch', () => {
    it('is off by default, and a policy without it hashes exactly as before', () => {
      const p = defaultPolicy(1_800_000_000);
      const parsed = parsePolicy(p);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect('run' in parsed.policy).toBe(false);
      expect(policySha256(parsed.policy)).toBe(policySha256(p));
      expect('run' in policy()).toBe(false);
    });

    it('parses only { require_sandbox: boolean }', () => {
      const p = defaultPolicy(1_800_000_000);
      const on = parsePolicy({ ...p, run: { require_sandbox: true } });
      expect(on.ok && (on.policy as unknown as Record<string, unknown>).run).toEqual({ require_sandbox: true });
      expect(on.ok && policySha256(on.policy) !== policySha256(p)).toBe(true);
      for (const bad of [{ require_sandbox: 'yes' }, { require_sandbox: true, other: 1 }, [], 'on', {}]) {
        expect(parsePolicy({ ...p, run: bad }).ok).toBe(false);
      }
    });

    it('guard require-sandbox on/off each leave a C10 policy-change record with the hash before and after', () => {
      const before = ledger().length;
      expect(guard('require-sandbox', 'on')).toBe(0);
      expect(policy().run).toEqual({ require_sandbox: true });
      let rec = ledger().slice(-1)[0];
      expect(rec?.kind).toBe('policy-change');
      expect(rec?.change?.via).toBe('guard require-sandbox on');
      expect(rec?.change?.before_sha256).not.toBe(rec?.change?.after_sha256);
      expect(guard('require-sandbox', 'off')).toBe(0);
      expect('run' in policy()).toBe(false);
      rec = ledger().slice(-1)[0];
      expect(rec?.change?.via).toBe('guard require-sandbox off');
      expect(ledger().length).toBe(before + 2);
      expect(guard('require-sandbox', 'maybe')).toBe(2);
    });

    it('when on, plain run is DENIED and never starts; --sandbox passes Guard; C1/C5 are unchanged', () => {
      expect(guard('require-sandbox', 'on')).toBe(0);
      expect(run(['--tool', 'ls', '--', 'ls'], noDocker().exec)).toBe(EXIT_REFUSED);
      expect(err.join('\n')).toMatch(/requires --sandbox/);
      expect(started).toEqual([]);
      expect(ledger().slice(-1)[0]?.authorized.decision).toBe('DENIED');

      const d = noDocker();
      expect(run(['--sandbox', '--tool', 'ls', '--', 'ls'], d.exec)).toBe(3); // past Guard, refused only for no runtime
      expect(d.calls.length).toBeGreaterThan(0);

      expect(run(['--sandbox', '--tool', 'ls', '--', 'cat', 'x'], noDocker().exec)).toBe(EXIT_REFUSED); // C1
      expect(guard('allow', 'tool:node')).toBe(0);
      expect(run(['--sandbox', '--tool', 'node', '--', 'node', '-e', '1'], noDocker().exec)).toBe(EXIT_REFUSED); // C5
      expect(err.join('\n')).toContain(RULE);
      expect(started).toEqual([]);
    });

    it('when off again, plain run starts as before', () => {
      expect(guard('require-sandbox', 'on')).toBe(0);
      expect(guard('require-sandbox', 'off')).toBe(0);
      expect(run(['--tool', 'ls', '--', 'ls'], noDocker().exec)).toBe(0);
      expect(started).toEqual([['ls']]);
      expect(sandboxOf(ledger().slice(-1)[0])).toBeUndefined();
    });

    it('guard show says whether --sandbox is required', () => {
      guard('show');
      expect(out.join('\n')).toMatch(/run +plain trustshell run allowed/);
      guard('require-sandbox', 'on');
      guard('show');
      expect(out.join('\n')).toMatch(/run +--sandbox required/);
    });
  });

  describe('a mission end to end (fake docker): outputs come home only through the airlock and an explicit promote', () => {
    const worker = (outbox: string) => {
      writeFileSync(join(outbox, 'result.txt'), 'interfaces: lo\n');
      writeFileSync(join(outbox, 'memory.md'), 'remember this\n');
    };

    it('runs in the container with the current directory read-only, promotes nothing by itself, and promote is the owner step', () => {
      const before = snapshot(proj);
      const f = fakeDocker(worker);
      expect(run(['--sandbox', '--tool', 'ls', '--', 'ls', '-la'], f.exec)).toBe(0);
      expect(started).toEqual([]);
      const c = f.created();
      expect(c[c.indexOf('--workdir') + 1]).toBe(MOUNTS.input);
      expect(c).toContain(`type=bind,src=${realpathSync(proj)},dst=${MOUNTS.input},readonly`);
      expect(c.slice(-2)).toEqual(['ls', '-la']);
      expect(snapshot(proj)).toEqual(before); // nothing landed in the working directory

      const missions = readdirSync(join(home, 'sandbox', 'missions'));
      expect(missions).toHaveLength(1);
      const id = missions[0] as string;
      const dir = join(home, 'sandbox', 'missions', id);
      expect(existsSync(join(dir, 'trusted-store'))).toBe(false); // quarantined, not promoted
      expect(err.join('\n')).toContain(`trustshell sandbox promote ${id}`);
      const passport = JSON.parse(readFileSync(join(dir, 'passport.json'), 'utf8'));
      expect(passport.signature).toEqual(expect.any(String));
      expect(passport.passport.tool_belt.value.manifest.network).toBe('none');
      expect(f.calls.filter((a) => a[0] === 'rm')).toHaveLength(1);

      out = [];
      err = [];
      expect(sandboxCli(['promote', id], io, env())).toBe(0);
      const store = join(dir, 'trusted-store');
      const sha = createHash('sha256').update('interfaces: lo\n').digest('hex');
      expect(readdirSync(store)).toEqual([sha]);
      expect(readFileSync(join(store, sha), 'utf8')).toBe('interfaces: lo\n');
      const signed = JSON.parse(readFileSync(join(dir, 'receipt.json'), 'utf8')) as SignedReceipt;
      expect(verifyReceipt(signed)).toEqual({ ok: true, errors: [] });
      expect(verifyPassport(signed.receipt.passport!, signed.receipt.keys.harness)).toEqual([]);
      expect(signed.receipt.passport).toEqual(passport); // the passport printed at run time is the one the receipt carries
      expect(signed.receipt.artifacts.promoted.map((p) => p.name)).toEqual(['result.txt']);
      expect(signed.receipt.artifacts.refused.map((p) => p.name)).toEqual(['memory.md']);
      expect(signed.receipt.revoke.revoked).toBe(true);
      expect(signed.receipt.statement).toMatch(/trustshell sandbox promote/);
      expect(signed.receipt.not_measured.join(' ')).toMatch(/current directory/);
      expect(existsSync(join(dir, 'pending.json'))).toBe(false); // the mission token went with it
      expect(out.join('\n')).toContain(join(store, sha));
      expect(snapshot(proj)).toEqual(before);

      expect(sandboxCli(['promote', id], io, env())).toBe(3); // once only
      expect(err.join('\n')).toMatch(/already promoted/);
    });

    it('an empty outbox still gives a receipt that verifies', () => {
      expect(run(['--sandbox', '--tool', 'ls', '--', 'ls'], fakeDocker().exec)).toBe(0);
      const id = readdirSync(join(home, 'sandbox', 'missions'))[0] as string;
      expect(sandboxCli(['promote', id], io, env())).toBe(0);
      const signed = JSON.parse(readFileSync(join(home, 'sandbox', 'missions', id, 'receipt.json'), 'utf8')) as SignedReceipt;
      expect(verifyReceipt(signed)).toEqual({ ok: true, errors: [] });
    });

    it('promote refuses an id that is not a pending mission', () => {
      expect(sandboxCli(['promote', '0123456789abcdef'], io, env())).toBe(3);
      expect(sandboxCli(['promote', '../x'], io, env())).toBe(2);
      expect(sandboxCli([], io, env())).toBe(2);
    });
  });

  it('`trustshell sandbox` is a command the CLI gate weighs (tool:sandbox), not one it always lets through', () => {
    expect(parseArgs(['sandbox', 'promote', 'abc']).command).toBe('sandbox');
    expect(NEVER_GUARDED.has('sandbox')).toBe(false);
  });
});
