/**
 * Sandbox mission runner (Agent Immune System, IS-P0, defensive half).
 *
 * Sean's rule: untrusted work never hands its running process back to the trusted core. It hands back
 * candidate files through an independently enforced promotion gate (`promote.ts`), and the disposable
 * runtime is destroyed. This file is the disposable runtime: one BENIGN worker command in one throwaway
 * Docker container with a hardened profile.
 *
 * Three rules this file keeps:
 *   1. Fail closed. No container runtime, or a runtime that was asked for and is missing, is a refusal.
 *      Nothing here ever runs the worker on the host.
 *   2. Verify, do not assume. The container is CREATED, then `docker inspect` is read back and checked
 *      field by field; only a container whose observed profile matches is STARTED. A mismatch removes it.
 *   3. Record only what was observed. The receipt carries the inspect values, not the flags we passed.
 *
 * What this does NOT show: that the profile holds against an active hostile worker. That needs
 * adversarial in-container tests, which await a scope decision (see the receipt's `not_measured`).
 */
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** node:22-alpine, OCI index digest read from registry-1.docker.io on 2026-11-02 17:03 UTC. */
export const PINNED_DIGEST = 'sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914';
export const PINNED_IMAGE = `node:22-alpine@${PINNED_DIGEST}`;

export type Runtime = 'runc' | 'runsc';
export const RUNTIMES: readonly Runtime[] = ['runc', 'runsc'];

export interface Limits { pids: number; memoryBytes: number; cpus: number; timeoutMs: number }
export const DEFAULT_LIMITS: Limits = { pids: 64, memoryBytes: 256 * 1024 * 1024, cpus: 0.5, timeoutMs: 60_000 };

export const TMPFS_OPTS = 'noexec,nosuid,nodev,size=64m';
export const WORKER_USER = '65534:65534';
/** Where things appear inside the container. Only the outbox is writable. */
export const MOUNTS = { input: '/mission/input', outbox: '/mission/outbox', token: '/run/mission/token' } as const;

export interface ExecResult { status: number | null; stdout: string; stderr: string; error: string | null; timedOut: boolean }
export type Exec = (cmd: string, args: string[], timeoutMs?: number) => ExecResult;

/** Runs the docker CLI. The CLI's own environment never reaches the container: no `-e` or `--env-file` is ever passed. */
export const nodeExec: Exec = (cmd, args, timeoutMs = 120_000) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 });
  const err = r.error as NodeJS.ErrnoException | undefined;
  return {
    status: r.status,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
    error: err ? String(err.code ?? err.message) : null,
    timedOut: err?.code === 'ETIMEDOUT',
  };
};

export class MissionRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissionRefused';
  }
}

export interface MissionPaths { root: string; input: string; outbox: string; tokenFile: string }

export interface ObservedMount { Type: string | null; Source: string | null; Destination: string | null; RW: boolean | null }
/** The fields read back from `docker inspect`. Every one is JSON (no undefined), so it can be signed. */
export interface ObservedProfile {
  NetworkMode: string | null;
  ReadonlyRootfs: boolean | null;
  CapDrop: string[];
  CapAdd: string[];
  SecurityOpt: string[];
  User: string | null;
  Privileged: boolean | null;
  PidsLimit: number | null;
  Memory: number | null;
  MemorySwap: number | null;
  NanoCpus: number | null;
  Runtime: string | null;
  Tmpfs: Record<string, string>;
  Mounts: ObservedMount[];
  Env: string[];
}

export interface ExpectedMount { destination: string; rw: boolean; source: string | null }
export interface ExpectedProfile { runtime: Runtime; limits: Limits; imageEnv: string[]; mounts: ExpectedMount[] }
export interface ProfileCheck { field: string; expected: unknown; observed: unknown; ok: boolean }

/** The mount shape every mission must have. Sources are added by the runner, which knows the host paths. */
export const MOUNT_SHAPE: ExpectedMount[] = [
  { destination: MOUNTS.input, rw: false, source: null },
  { destination: MOUNTS.outbox, rw: true, source: null },
  { destination: MOUNTS.token, rw: false, source: null },
];

/* eslint-disable @typescript-eslint/no-explicit-any */
export function observeProfile(j: any): ObservedProfile {
  const hc = j?.HostConfig ?? {};
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
  const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
  const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);
  const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
  const mounts: ObservedMount[] = (Array.isArray(j?.Mounts) ? j.Mounts : []).map((m: any) => ({
    Type: str(m?.Type),
    Source: str(m?.Source),
    Destination: str(m?.Destination),
    RW: bool(m?.RW),
  }));
  const tmpfs: Record<string, string> = {};
  for (const [k, v] of Object.entries(hc.Tmpfs ?? {})) tmpfs[k] = String(v);
  return {
    NetworkMode: str(hc.NetworkMode),
    ReadonlyRootfs: bool(hc.ReadonlyRootfs),
    CapDrop: arr(hc.CapDrop),
    CapAdd: arr(hc.CapAdd),
    SecurityOpt: arr(hc.SecurityOpt),
    User: str(j?.Config?.User),
    Privileged: bool(hc.Privileged),
    PidsLimit: num(hc.PidsLimit),
    Memory: num(hc.Memory),
    MemorySwap: num(hc.MemorySwap),
    NanoCpus: num(hc.NanoCpus),
    Runtime: str(hc.Runtime),
    Tmpfs: tmpfs,
    Mounts: mounts,
    Env: arr(j?.Config?.Env),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Compare what docker reports with what a mission requires. Used before start, and again by the verifier. */
export function checkProfile(o: ObservedProfile, e: ExpectedProfile): ProfileCheck[] {
  const c = (field: string, expected: unknown, observed: unknown, ok: boolean): ProfileCheck => ({ field, expected, observed, ok });
  const mountsOk =
    o.Mounts.length === e.mounts.length &&
    e.mounts.every((m) =>
      o.Mounts.some((x) => x.Destination === m.destination && x.Type === 'bind' && x.RW === m.rw && (m.source === null || x.Source === m.source)),
    );
  const tmpfsKeys = Object.keys(o.Tmpfs);
  return [
    c('NetworkMode', 'none', o.NetworkMode, o.NetworkMode === 'none'),
    c('ReadonlyRootfs', true, o.ReadonlyRootfs, o.ReadonlyRootfs === true),
    c('CapDrop', ['ALL'], o.CapDrop, o.CapDrop.some((x) => /^(CAP_)?ALL$/i.test(x))),
    c('CapAdd', [], o.CapAdd, o.CapAdd.length === 0),
    c('SecurityOpt', ['no-new-privileges'], o.SecurityOpt, o.SecurityOpt.some((s) => /^no-new-privileges([:=]true)?$/.test(s))),
    c('User', WORKER_USER, o.User, o.User === WORKER_USER),
    c('Privileged', false, o.Privileged, o.Privileged === false),
    c('PidsLimit', e.limits.pids, o.PidsLimit, o.PidsLimit === e.limits.pids),
    c('Memory', e.limits.memoryBytes, o.Memory, o.Memory === e.limits.memoryBytes),
    c('MemorySwap', e.limits.memoryBytes, o.MemorySwap, o.MemorySwap === e.limits.memoryBytes),
    c('NanoCpus', Math.round(e.limits.cpus * 1e9), o.NanoCpus, o.NanoCpus === Math.round(e.limits.cpus * 1e9)),
    c('Runtime', e.runtime, o.Runtime, o.Runtime === e.runtime),
    c('Tmpfs', { '/tmp': TMPFS_OPTS }, o.Tmpfs, tmpfsKeys.length === 1 && o.Tmpfs['/tmp'] === TMPFS_OPTS),
    c('Mounts', e.mounts, o.Mounts, mountsOk),
    // Docker always adds the image's own ENV (PATH, NODE_VERSION, ...). Nothing beyond that may appear.
    c('Env', 'only the image defaults', o.Env, o.Env.every((v) => e.imageEnv.includes(v))),
  ];
}

/** The `docker create` arguments. Pure, so the profile is unit-tested without Docker. */
export function createArgs(name: string, image: string, runtime: Runtime, limits: Limits, paths: MissionPaths, command: string[]): string[] {
  for (const p of [paths.input, paths.outbox, paths.tokenFile]) {
    if (p.includes(',')) throw new MissionRefused(`mount source contains a comma: ${p}`);
  }
  return [
    'create',
    '--name', name,
    '--read-only',
    '--network', 'none',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--user', WORKER_USER,
    '--pids-limit', String(limits.pids),
    '--memory', String(limits.memoryBytes),
    '--memory-swap', String(limits.memoryBytes),
    '--cpus', String(limits.cpus),
    '--tmpfs', `/tmp:${TMPFS_OPTS}`,
    '--mount', `type=bind,src=${paths.input},dst=${MOUNTS.input},readonly`,
    '--mount', `type=bind,src=${paths.outbox},dst=${MOUNTS.outbox}`,
    '--mount', `type=bind,src=${paths.tokenFile},dst=${MOUNTS.token},readonly`,
    '--workdir', '/tmp',
    '--runtime', runtime,
    image,
    ...command,
  ];
}

/** Is there a container runtime, and the one asked for? Throws MissionRefused otherwise. */
export function containerRuntime(exec: Exec, want: Runtime): { server_version: string; available: string[] } {
  const v = exec('docker', ['version', '--format', '{{.Server.Version}}'], 30_000);
  if (v.error || v.status !== 0 || !v.stdout.trim()) {
    const why = v.error ?? (v.stderr.trim() || `exit ${v.status}`);
    throw new MissionRefused(`no container runtime: docker is not available (${why}). Refusing to run the worker uncontained.`);
  }
  const info = exec('docker', ['info', '--format', '{{json .Runtimes}}'], 30_000);
  let available: string[] = [];
  try {
    available = info.status === 0 ? Object.keys(JSON.parse(info.stdout.trim() || '{}')) : [];
  } catch {
    available = [];
  }
  if (!available.includes(want)) {
    throw new MissionRefused(`runtime ${want} was requested but docker reports [${available.join(', ')}]. Refusing rather than falling back.`);
  }
  return { server_version: v.stdout.trim(), available };
}

const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');

/** Make the host side: input (read-only to the worker), outbox (the one writable place), token file. */
export function prepareMission(baseDir: string, missionId: string, inputFiles: Record<string, string>): { paths: MissionPaths; token: string } {
  for (const name of Object.keys(inputFiles)) {
    if (!/^[A-Za-z0-9._-]+$/.test(name) || name.startsWith('.')) throw new MissionRefused(`bad input file name: ${name}`);
  }
  const root = realpathSync(mkdtempSync(join(baseDir, `mission-${missionId}-`))); // 0700: other host users cannot reach the outbox
  const input = join(root, 'input');
  const outbox = join(root, 'outbox');
  mkdirSync(input, { mode: 0o755 });
  mkdirSync(outbox);
  chmodSync(input, 0o755);
  chmodSync(outbox, 0o777); // the worker runs as 65534, not as the host user
  for (const [name, body] of Object.entries(inputFiles)) {
    writeFileSync(join(input, name), body, { mode: 0o444, flag: 'wx' });
  }
  const token = randomBytes(32).toString('hex');
  const tokenFile = join(root, 'token');
  writeFileSync(tokenFile, token, { mode: 0o444, flag: 'wx' });
  return { paths: { root, input, outbox, tokenFile }, token };
}

export interface MissionOptions {
  baseDir: string;
  missionId: string;
  runtime: Runtime;
  command: string[];
  inputFiles: Record<string, string>;
  limits?: Limits;
}

export interface MissionRun {
  mission_id: string;
  container_name: string;
  container_id: string;
  image: { ref: string; pinned_digest: string; id: string | null; repo_digests: string[]; env: string[] };
  runtime: { requested: Runtime; observed: string | null; docker_server_version: string; available: string[] };
  limits: Limits;
  profile: { observed: ObservedProfile; checks: ProfileCheck[]; all_ok: boolean; post_run_all_ok: boolean };
  /** Logs are hashed, never copied: a worker could print anything, including a secret it read. */
  worker: { command: string[]; exit_code: number | null; timed_out: boolean; oom_killed: boolean | null; logs_sha256: string; logs_bytes: number };
  token_sha256: string;
  paths: MissionPaths;
}

function inspect(exec: Exec, kind: 'container' | 'image', ref: string): unknown | null {
  const r = exec('docker', [kind, 'inspect', ref], 60_000);
  if (r.status !== 0) return null;
  try {
    const arr = JSON.parse(r.stdout);
    return Array.isArray(arr) ? (arr[0] ?? null) : null;
  } catch {
    return null;
  }
}

/**
 * Run one worker command in a fresh container. Returns the run and the mission token (the caller keeps the
 * token in memory only; the receipt records its sha256). Throws MissionRefused on any failed precondition,
 * and in that case no worker process was started.
 */
export function runMission(o: MissionOptions, exec: Exec = nodeExec): { run: MissionRun; token: string } {
  const limits = o.limits ?? DEFAULT_LIMITS;
  if (!RUNTIMES.includes(o.runtime)) throw new MissionRefused(`unknown runtime ${String(o.runtime)}`);
  if (!/^[a-f0-9]{8,32}$/.test(o.missionId)) throw new MissionRefused('mission id must be 8-32 lowercase hex characters');
  const rt = containerRuntime(exec, o.runtime); // fail closed before anything is created

  // The image, by digest. Pull only if it is not already present.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let img = inspect(exec, 'image', PINNED_IMAGE) as any;
  if (!img) {
    const pull = exec('docker', ['pull', PINNED_IMAGE], 300_000);
    if (pull.status !== 0) throw new MissionRefused(`could not pull ${PINNED_IMAGE}: ${pull.error ?? pull.stderr.trim()}`);
    img = inspect(exec, 'image', PINNED_IMAGE) as any;
  }
  const repoDigests: string[] = Array.isArray(img?.RepoDigests) ? img.RepoDigests.map(String) : [];
  if (!repoDigests.some((d) => d.endsWith(`@${PINNED_DIGEST}`))) {
    throw new MissionRefused(`image does not carry the pinned digest ${PINNED_DIGEST} (saw ${repoDigests.join(', ') || 'none'})`);
  }
  const imageEnv: string[] = Array.isArray(img?.Config?.Env) ? img.Config.Env.map(String) : [];

  const { paths, token } = prepareMission(o.baseDir, o.missionId, o.inputFiles);
  const name = `ts-mission-${o.missionId}`;
  const refuse = (why: string, containerId?: string): never => {
    if (containerId) exec('docker', ['rm', '-f', containerId], 60_000);
    rmSync(paths.root, { recursive: true, force: true });
    throw new MissionRefused(why);
  };

  const created = exec('docker', createArgs(name, PINNED_IMAGE, o.runtime, limits, paths, o.command), 60_000);
  if (created.status !== 0) refuse(`docker create failed: ${created.error ?? created.stderr.trim()}`);
  const id = created.stdout.trim().split('\n').pop() ?? '';

  // Read back what docker actually configured, BEFORE anything runs.
  const expected: ExpectedProfile = {
    runtime: o.runtime,
    limits,
    imageEnv,
    mounts: [
      { destination: MOUNTS.input, rw: false, source: paths.input },
      { destination: MOUNTS.outbox, rw: true, source: paths.outbox },
      { destination: MOUNTS.token, rw: false, source: paths.tokenFile },
    ],
  };
  const before = inspect(exec, 'container', id);
  if (!before) refuse(`docker inspect failed for ${id}`, id);
  const observed = observeProfile(before);
  const checks = checkProfile(observed, expected);
  const bad = checks.filter((c) => !c.ok);
  if (bad.length) refuse(`observed profile does not match; not started: ${bad.map((c) => `${c.field}=${JSON.stringify(c.observed)}`).join('; ')}`, id);

  // Start, wait with a wall-clock limit, kill on timeout.
  const started = exec('docker', ['start', id], 60_000);
  if (started.status !== 0) refuse(`docker start failed: ${started.error ?? started.stderr.trim()}`, id);
  const waited = exec('docker', ['wait', id], limits.timeoutMs);
  if (waited.timedOut || waited.status !== 0) exec('docker', ['kill', id], 30_000);
  const logs = exec('docker', ['logs', id], 30_000);
  const logText = logs.stdout + logs.stderr;
  const after = inspect(exec, 'container', id) as any;
  const postChecks = after ? checkProfile(observeProfile(after), expected) : [];
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return {
    token,
    run: {
      mission_id: o.missionId,
      container_name: name,
      container_id: id,
      image: { ref: PINNED_IMAGE, pinned_digest: PINNED_DIGEST, id: typeof img?.Id === 'string' ? img.Id : null, repo_digests: repoDigests, env: imageEnv },
      runtime: { requested: o.runtime, observed: observed.Runtime, docker_server_version: rt.server_version, available: rt.available },
      limits,
      profile: { observed, checks, all_ok: checks.every((c) => c.ok), post_run_all_ok: postChecks.length > 0 && postChecks.every((c) => c.ok) },
      worker: {
        command: o.command,
        exit_code: typeof after?.State?.ExitCode === 'number' ? after.State.ExitCode : null,
        timed_out: waited.timedOut,
        oom_killed: typeof after?.State?.OOMKilled === 'boolean' ? after.State.OOMKilled : null,
        logs_sha256: sha256(logText),
        logs_bytes: Buffer.byteLength(logText),
      },
      token_sha256: sha256(token),
      paths,
    },
  };
}

export interface DestroyEvidence { container_removed: boolean; rm_exit_code: number | null; inspect_after_exit_code: number | null; inspect_after_error: string }

/** Remove the container, then prove it is gone: `docker inspect` must now fail with "No such". */
export function destroyContainer(id: string, exec: Exec = nodeExec): DestroyEvidence {
  const rm = exec('docker', ['rm', '-f', id], 60_000);
  const after = exec('docker', ['inspect', id], 30_000);
  const err = (after.stderr.trim().split('\n')[0] ?? '').slice(0, 200);
  return {
    container_removed: rm.status === 0 && after.status !== 0 && /no such/i.test(err),
    rm_exit_code: rm.status,
    inspect_after_exit_code: after.status,
    inspect_after_error: err,
  };
}

/** Delete the mission's host dirs (input, outbox, token file) and prove they are gone. */
export function deleteMissionDirs(paths: MissionPaths): { temp_dirs_deleted: boolean; error: string | null } {
  try {
    rmSync(paths.root, { recursive: true, force: true });
  } catch (e) {
    return { temp_dirs_deleted: !existsSync(paths.root), error: String((e as NodeJS.ErrnoException).code ?? e) };
  }
  return { temp_dirs_deleted: !existsSync(paths.root), error: null };
}
