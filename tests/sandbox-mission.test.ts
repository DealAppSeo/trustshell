/**
 * Sandbox mission runner, without Docker: fail closed when there is no container runtime, build the
 * hardened `docker create` arguments, refuse to START a container whose read-back profile differs, and
 * prove destroy. The real-Docker run is .github/workflows/sandbox-mission.yml.
 */
import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkProfile,
  createArgs,
  DEFAULT_LIMITS,
  deleteMissionDirs,
  destroyContainer,
  MissionRefused,
  MOUNTS,
  observeProfile,
  PINNED_DIGEST,
  PINNED_IMAGE,
  prepareMission,
  runMission,
  TMPFS_OPTS,
  type Exec,
  type ExecResult,
  type ExpectedProfile,
} from '../src/sandbox/mission';

const ok = (stdout = ''): ExecResult => ({ status: 0, stdout, stderr: '', error: null, timedOut: false });
const fail = (stderr: string, error: string | null = null): ExecResult => ({ status: error ? null : 1, stdout: '', stderr, error, timedOut: false });

const IMAGE_ENV = ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'NODE_VERSION=22.0.0'];

/** A docker inspect document that matches the profile, for the given host paths. */
function goodInspect(paths: { input: string; outbox: string; tokenFile: string }, runtime = 'runc') {
  return {
    Id: 'c0ffee',
    Config: { User: '65534:65534', Env: [...IMAGE_ENV] },
    HostConfig: {
      NetworkMode: 'none',
      ReadonlyRootfs: true,
      CapDrop: ['ALL'],
      CapAdd: null,
      SecurityOpt: ['no-new-privileges'],
      Privileged: false,
      PidsLimit: DEFAULT_LIMITS.pids,
      Memory: DEFAULT_LIMITS.memoryBytes,
      MemorySwap: DEFAULT_LIMITS.memoryBytes,
      NanoCpus: DEFAULT_LIMITS.cpus * 1e9,
      Runtime: runtime,
      Tmpfs: { '/tmp': TMPFS_OPTS },
    },
    Mounts: <{ Type: string; Source: string; Destination: string; RW: boolean }[]>[
      { Type: 'bind', Source: paths.input, Destination: MOUNTS.input, RW: false },
      { Type: 'bind', Source: paths.outbox, Destination: MOUNTS.outbox, RW: true },
      { Type: 'bind', Source: paths.tokenFile, Destination: MOUNTS.token, RW: false },
    ],
    State: { ExitCode: 0, OOMKilled: false },
  };
}

/** A fake docker CLI. `mutate` changes the container inspect document; every call is recorded. */
function fakeDocker(base: string, mutate: (j: ReturnType<typeof goodInspect>) => void = () => {}) {
  const calls: string[][] = [];
  const exec: Exec = (_cmd, args) => {
    calls.push(args);
    const [a, b] = args;
    if (a === 'version') return ok('27.0.0\n');
    if (a === 'info') return ok('{"runc":{},"io.containerd.runc.v2":{}}');
    if (a === 'image' && b === 'inspect') return ok(JSON.stringify([{ Id: 'sha256:img', RepoDigests: [`node@${PINNED_DIGEST}`], Config: { Env: IMAGE_ENV } }]));
    if (a === 'create') return ok('c0ffee\n');
    if (a === 'container' && b === 'inspect') {
      const root = readdirSync(base).find((d) => d.startsWith('mission-'))!;
      const r = realpathSync(join(base, root));
      const j = goodInspect({ input: join(r, 'input'), outbox: join(r, 'outbox'), tokenFile: join(r, 'token') });
      mutate(j);
      return ok(JSON.stringify([j]));
    }
    if (a === 'start' || a === 'kill' || a === 'logs' || a === 'rm') return ok('');
    if (a === 'wait') return ok('0\n');
    return fail(`unexpected ${args.join(' ')}`);
  };
  return { exec, calls };
}

let base: string;
beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'sbx-mission-test-'));
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

const opts = (runtime: 'runc' | 'runsc' = 'runc') => ({
  baseDir: base,
  missionId: 'aabbccddeeff0011',
  runtime,
  command: ['node', '-e', 'console.log(1)'],
  inputFiles: { 'numbers.json': '[1,2]' },
});

describe('fail closed: no container runtime means no mission', () => {
  it('refuses when the docker binary is missing, and creates nothing', () => {
    const calls: string[][] = [];
    const exec: Exec = (_c, args) => {
      calls.push(args);
      return fail('', 'ENOENT');
    };
    expect(() => runMission(opts(), exec)).toThrow(MissionRefused);
    expect(() => runMission(opts(), exec)).toThrow(/no container runtime.*Refusing to run the worker uncontained/);
    expect(calls.every((a) => a[0] === 'version')).toBe(true);
    expect(readdirSync(base)).toEqual([]);
  });

  it('refuses when the docker daemon is down', () => {
    const exec: Exec = () => fail('Cannot connect to the Docker daemon');
    expect(() => runMission(opts(), exec)).toThrow(/no container runtime/);
  });

  it('refuses runsc when it was requested and docker does not have it, rather than falling back to runc', () => {
    const { exec, calls } = fakeDocker(base);
    expect(() => runMission(opts('runsc'), exec)).toThrow(/runtime runsc was requested/);
    expect(calls.some((a) => a[0] === 'create')).toBe(false);
  });

  it('refuses an image that does not carry the pinned digest', () => {
    const { exec } = fakeDocker(base);
    const wrongImage: Exec = (c, args) =>
      args[0] === 'image' ? ok(JSON.stringify([{ Id: 'x', RepoDigests: ['node@sha256:' + '0'.repeat(64)], Config: { Env: [] } }])) : exec(c, args);
    expect(() => runMission(opts(), wrongImage)).toThrow(/pinned digest/);
  });
});

describe('the hardened profile', () => {
  const paths = { root: '/m', input: '/m/input', outbox: '/m/outbox', tokenFile: '/m/token' };
  const args = createArgs('ts-mission-x', PINNED_IMAGE, 'runsc', DEFAULT_LIMITS, paths, ['node', '-e', '1']);
  const pairs = (flag: string) => args.flatMap((a, i) => (a === flag ? [args[i + 1]] : []));

  it('passes every restriction', () => {
    expect(args).toContain('--read-only');
    expect(pairs('--network')).toEqual(['none']);
    expect(pairs('--cap-drop')).toEqual(['ALL']);
    expect(pairs('--security-opt')).toEqual(['no-new-privileges']);
    expect(pairs('--user')).toEqual(['65534:65534']);
    expect(pairs('--pids-limit')).toEqual([String(DEFAULT_LIMITS.pids)]);
    expect(pairs('--memory')).toEqual([String(DEFAULT_LIMITS.memoryBytes)]);
    expect(pairs('--cpus')).toEqual([String(DEFAULT_LIMITS.cpus)]);
    expect(pairs('--tmpfs')).toEqual([`/tmp:${TMPFS_OPTS}`]);
    expect(pairs('--runtime')).toEqual(['runsc']);
    expect(args).toContain(PINNED_IMAGE);
    expect(PINNED_IMAGE).toMatch(/@sha256:[0-9a-f]{64}$/);
  });

  it('mounts input and token read-only, only the outbox writable, and passes no environment', () => {
    const mounts = pairs('--mount');
    expect(mounts).toEqual([
      `type=bind,src=/m/input,dst=${MOUNTS.input},readonly`,
      `type=bind,src=/m/outbox,dst=${MOUNTS.outbox}`,
      `type=bind,src=/m/token,dst=${MOUNTS.token},readonly`,
    ]);
    for (const banned of ['-e', '--env', '--env-file', '--privileged', '-v', '--volume', '--cap-add', '--network=host', '--pid', '--ipc']) {
      expect(args.slice(0, args.indexOf(PINNED_IMAGE))).not.toContain(banned); // docker options only; the worker command follows the image
    }
  });
});

describe('the profile is verified by reading docker inspect, not assumed', () => {
  const p = { input: '/m/input', outbox: '/m/outbox', tokenFile: '/m/token' };
  const expected: ExpectedProfile = {
    runtime: 'runc',
    limits: DEFAULT_LIMITS,
    imageEnv: IMAGE_ENV,
    mounts: [
      { destination: MOUNTS.input, rw: false, source: p.input },
      { destination: MOUNTS.outbox, rw: true, source: p.outbox },
      { destination: MOUNTS.token, rw: false, source: p.tokenFile },
    ],
  };

  it('a matching inspect passes every check', () => {
    expect(checkProfile(observeProfile(goodInspect(p)), expected).filter((c) => !c.ok)).toEqual([]);
  });

  // Non-vacuity: every check can fail.
  const flips: [string, (j: ReturnType<typeof goodInspect>) => void][] = [
    ['NetworkMode', (j) => (j.HostConfig.NetworkMode = 'bridge')],
    ['ReadonlyRootfs', (j) => (j.HostConfig.ReadonlyRootfs = false)],
    ['CapDrop', (j) => (j.HostConfig.CapDrop = [])],
    ['CapAdd', (j) => ((j.HostConfig as { CapAdd: unknown }).CapAdd = ['NET_RAW'])],
    ['SecurityOpt', (j) => (j.HostConfig.SecurityOpt = [])],
    ['User', (j) => (j.Config.User = 'root')],
    ['Privileged', (j) => (j.HostConfig.Privileged = true)],
    ['PidsLimit', (j) => (j.HostConfig.PidsLimit = 0)],
    ['Memory', (j) => (j.HostConfig.Memory = 0)],
    ['MemorySwap', (j) => (j.HostConfig.MemorySwap = -1)],
    ['NanoCpus', (j) => (j.HostConfig.NanoCpus = 0)],
    ['Runtime', (j) => (j.HostConfig.Runtime = 'runsc')],
    ['Tmpfs', (j) => (j.HostConfig.Tmpfs = { '/tmp': 'size=64m' })],
    ['Mounts', (j) => (j.Mounts[0]!.RW = true)],
    ['Mounts', (j) => j.Mounts.push({ Type: 'bind', Source: '/', Destination: '/host', RW: false })],
    ['Env', (j) => j.Config.Env.push('HOST_SECRET=1')],
  ];
  it.each(flips)('a wrong %s fails its check', (field, mutate) => {
    const j = goodInspect(p);
    mutate(j);
    const bad = checkProfile(observeProfile(j), expected).filter((c) => !c.ok).map((c) => c.field);
    expect(bad).toEqual([field]);
  });

  it('a mismatch removes the container and never starts it', () => {
    const { exec, calls } = fakeDocker(base, (j) => (j.HostConfig.NetworkMode = 'bridge'));
    expect(() => runMission(opts(), exec)).toThrow(/observed profile does not match; not started: NetworkMode="bridge"/);
    expect(calls.some((a) => a[0] === 'start')).toBe(false);
    expect(calls.some((a) => a[0] === 'rm' && a[1] === '-f')).toBe(true);
    expect(readdirSync(base)).toEqual([]); // mission dirs deleted on refusal
  });

  it('a matching container is started only after the check, and the run records what was observed', () => {
    const { exec, calls } = fakeDocker(base);
    const { run, token } = runMission(opts(), exec);
    const order = calls.map((a) => (a[0] === 'container' ? 'inspect' : a[0]));
    expect(order.indexOf('create')).toBeLessThan(order.indexOf('inspect'));
    expect(order.indexOf('inspect')).toBeLessThan(order.indexOf('start'));
    expect(run.profile.all_ok).toBe(true);
    expect(run.profile.post_run_all_ok).toBe(true);
    expect(run.runtime).toMatchObject({ requested: 'runc', observed: 'runc' });
    expect(run.token_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(run)).not.toContain(token); // only the hash is recorded
    expect(run.worker.exit_code).toBe(0);
  });
});

describe('destroy', () => {
  it('container_removed only when rm succeeded AND inspect now says no such object', () => {
    const gone: Exec = (_c, a) => (a[0] === 'rm' ? ok('c0ffee') : fail('Error: No such object: c0ffee'));
    expect(destroyContainer('c0ffee', gone)).toMatchObject({ container_removed: true, rm_exit_code: 0, inspect_after_exit_code: 1 });
    const stillThere: Exec = (_c, a) => (a[0] === 'rm' ? ok('c0ffee') : ok('[{}]'));
    expect(destroyContainer('c0ffee', stillThere).container_removed).toBe(false);
    const rmFailed: Exec = (_c, a) => (a[0] === 'rm' ? fail('permission denied') : fail('Error: No such object: c0ffee'));
    expect(destroyContainer('c0ffee', rmFailed).container_removed).toBe(false);
  });

  it('deletes the mission dirs and proves they are gone', () => {
    const { paths } = prepareMission(base, 'aabbccdd', { 'a.json': '{}' });
    expect(existsSync(paths.tokenFile)).toBe(true);
    expect(deleteMissionDirs(paths)).toEqual({ temp_dirs_deleted: true, error: null });
    expect(existsSync(paths.root)).toBe(false);
  });

  it('refuses an input file name that could escape the input dir', () => {
    expect(() => prepareMission(base, 'aabbccdd', { '../x': '1' })).toThrow(/bad input file name/);
  });
});
