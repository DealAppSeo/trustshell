"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MOUNT_SHAPE = exports.MissionRefused = exports.nodeExec = exports.MOUNTS = exports.WORKER_USER = exports.TMPFS_OPTS = exports.DEFAULT_LIMITS = exports.RUNTIMES = exports.PINNED_IMAGE = exports.PINNED_DIGEST = void 0;
exports.observeProfile = observeProfile;
exports.checkProfile = checkProfile;
exports.createArgs = createArgs;
exports.containerRuntime = containerRuntime;
exports.prepareMission = prepareMission;
exports.runMission = runMission;
exports.destroyContainer = destroyContainer;
exports.deleteMissionDirs = deleteMissionDirs;
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
const node_child_process_1 = require("node:child_process");
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
/** node:22-alpine, OCI index digest read from registry-1.docker.io on 2026-11-02 17:03 UTC. */
exports.PINNED_DIGEST = 'sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914';
exports.PINNED_IMAGE = `node:22-alpine@${exports.PINNED_DIGEST}`;
exports.RUNTIMES = ['runc', 'runsc'];
exports.DEFAULT_LIMITS = { pids: 64, memoryBytes: 256 * 1024 * 1024, cpus: 0.5, timeoutMs: 60000 };
exports.TMPFS_OPTS = 'noexec,nosuid,nodev,size=64m';
exports.WORKER_USER = '65534:65534';
/** Where things appear inside the container. Only the outbox is writable. */
exports.MOUNTS = { input: '/mission/input', outbox: '/mission/outbox', token: '/run/mission/token' };
/** Runs the docker CLI. The CLI's own environment never reaches the container: no `-e` or `--env-file` is ever passed. */
const nodeExec = (cmd, args, timeoutMs = 120000) => {
    const r = (0, node_child_process_1.spawnSync)(cmd, args, { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 });
    const err = r.error;
    return {
        status: r.status,
        stdout: r.stdout ?? '',
        stderr: r.stderr ?? '',
        error: err ? String(err.code ?? err.message) : null,
        timedOut: err?.code === 'ETIMEDOUT',
    };
};
exports.nodeExec = nodeExec;
class MissionRefused extends Error {
    constructor(message) {
        super(message);
        this.name = 'MissionRefused';
    }
}
exports.MissionRefused = MissionRefused;
/** The mount shape every mission must have. Sources are added by the runner, which knows the host paths. */
exports.MOUNT_SHAPE = [
    { destination: exports.MOUNTS.input, rw: false, source: null },
    { destination: exports.MOUNTS.outbox, rw: true, source: null },
    { destination: exports.MOUNTS.token, rw: false, source: null },
];
/* eslint-disable @typescript-eslint/no-explicit-any */
function observeProfile(j) {
    const hc = j?.HostConfig ?? {};
    const arr = (v) => (Array.isArray(v) ? v.map(String) : []);
    const num = (v) => (typeof v === 'number' ? v : null);
    const bool = (v) => (typeof v === 'boolean' ? v : null);
    const str = (v) => (typeof v === 'string' ? v : null);
    const mounts = (Array.isArray(j?.Mounts) ? j.Mounts : []).map((m) => ({
        Type: str(m?.Type),
        Source: str(m?.Source),
        Destination: str(m?.Destination),
        RW: bool(m?.RW),
    }));
    const tmpfs = {};
    for (const [k, v] of Object.entries(hc.Tmpfs ?? {}))
        tmpfs[k] = String(v);
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
function checkProfile(o, e) {
    const c = (field, expected, observed, ok) => ({ field, expected, observed, ok });
    const mountsOk = o.Mounts.length === e.mounts.length &&
        e.mounts.every((m) => o.Mounts.some((x) => x.Destination === m.destination && x.Type === 'bind' && x.RW === m.rw && (m.source === null || x.Source === m.source)));
    const tmpfsKeys = Object.keys(o.Tmpfs);
    return [
        c('NetworkMode', 'none', o.NetworkMode, o.NetworkMode === 'none'),
        c('ReadonlyRootfs', true, o.ReadonlyRootfs, o.ReadonlyRootfs === true),
        c('CapDrop', ['ALL'], o.CapDrop, o.CapDrop.some((x) => /^(CAP_)?ALL$/i.test(x))),
        c('CapAdd', [], o.CapAdd, o.CapAdd.length === 0),
        c('SecurityOpt', ['no-new-privileges'], o.SecurityOpt, o.SecurityOpt.some((s) => /^no-new-privileges([:=]true)?$/.test(s))),
        c('User', exports.WORKER_USER, o.User, o.User === exports.WORKER_USER),
        c('Privileged', false, o.Privileged, o.Privileged === false),
        c('PidsLimit', e.limits.pids, o.PidsLimit, o.PidsLimit === e.limits.pids),
        c('Memory', e.limits.memoryBytes, o.Memory, o.Memory === e.limits.memoryBytes),
        c('MemorySwap', e.limits.memoryBytes, o.MemorySwap, o.MemorySwap === e.limits.memoryBytes),
        c('NanoCpus', Math.round(e.limits.cpus * 1e9), o.NanoCpus, o.NanoCpus === Math.round(e.limits.cpus * 1e9)),
        c('Runtime', e.runtime, o.Runtime, o.Runtime === e.runtime),
        c('Tmpfs', { '/tmp': exports.TMPFS_OPTS }, o.Tmpfs, tmpfsKeys.length === 1 && o.Tmpfs['/tmp'] === exports.TMPFS_OPTS),
        c('Mounts', e.mounts, o.Mounts, mountsOk),
        // Docker always adds the image's own ENV (PATH, NODE_VERSION, ...). Nothing beyond that may appear.
        c('Env', 'only the image defaults', o.Env, o.Env.every((v) => e.imageEnv.includes(v))),
    ];
}
/** The `docker create` arguments. Pure, so the profile is unit-tested without Docker. */
function createArgs(name, image, runtime, limits, paths, command, workdir = '/tmp') {
    for (const p of [paths.input, paths.outbox, paths.tokenFile]) {
        if (p.includes(','))
            throw new MissionRefused(`mount source contains a comma: ${p}`);
    }
    return [
        'create',
        '--name', name,
        '--read-only',
        '--network', 'none',
        '--cap-drop', 'ALL',
        '--security-opt', 'no-new-privileges',
        '--user', exports.WORKER_USER,
        '--pids-limit', String(limits.pids),
        '--memory', String(limits.memoryBytes),
        '--memory-swap', String(limits.memoryBytes),
        '--cpus', String(limits.cpus),
        '--tmpfs', `/tmp:${exports.TMPFS_OPTS}`,
        '--mount', `type=bind,src=${paths.input},dst=${exports.MOUNTS.input},readonly`,
        '--mount', `type=bind,src=${paths.outbox},dst=${exports.MOUNTS.outbox}`,
        '--mount', `type=bind,src=${paths.tokenFile},dst=${exports.MOUNTS.token},readonly`,
        '--workdir', workdir,
        '--runtime', runtime,
        image,
        ...command,
    ];
}
/** Is there a container runtime, and the one asked for? Throws MissionRefused otherwise. */
function containerRuntime(exec, want) {
    const v = exec('docker', ['version', '--format', '{{.Server.Version}}'], 30000);
    if (v.error || v.status !== 0 || !v.stdout.trim()) {
        const why = v.error ?? (v.stderr.trim() || `exit ${v.status}`);
        throw new MissionRefused(`no container runtime: docker is not available (${why}). Refusing to run the worker uncontained.`);
    }
    const info = exec('docker', ['info', '--format', '{{json .Runtimes}}'], 30000);
    let available = [];
    try {
        available = info.status === 0 ? Object.keys(JSON.parse(info.stdout.trim() || '{}')) : [];
    }
    catch {
        available = [];
    }
    if (!available.includes(want)) {
        throw new MissionRefused(`runtime ${want} was requested but docker reports [${available.join(', ')}]. Refusing rather than falling back.`);
    }
    return { server_version: v.stdout.trim(), available };
}
const sha256 = (s) => (0, node_crypto_1.createHash)('sha256').update(s).digest('hex');
/** Make the host side: input (read-only to the worker), outbox (the one writable place), token file. */
function prepareMission(baseDir, missionId, inputFiles) {
    for (const name of Object.keys(inputFiles)) {
        if (!/^[A-Za-z0-9._-]+$/.test(name) || name.startsWith('.'))
            throw new MissionRefused(`bad input file name: ${name}`);
    }
    const root = (0, node_fs_1.realpathSync)((0, node_fs_1.mkdtempSync)((0, node_path_1.join)(baseDir, `mission-${missionId}-`))); // 0700: other host users cannot reach the outbox
    const input = (0, node_path_1.join)(root, 'input');
    const outbox = (0, node_path_1.join)(root, 'outbox');
    (0, node_fs_1.mkdirSync)(input, { mode: 0o755 });
    (0, node_fs_1.mkdirSync)(outbox);
    (0, node_fs_1.chmodSync)(input, 0o755);
    (0, node_fs_1.chmodSync)(outbox, 0o777); // the worker runs as 65534, not as the host user
    for (const [name, body] of Object.entries(inputFiles)) {
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(input, name), body, { mode: 0o444, flag: 'wx' });
    }
    const token = (0, node_crypto_1.randomBytes)(32).toString('hex');
    const tokenFile = (0, node_path_1.join)(root, 'token');
    (0, node_fs_1.writeFileSync)(tokenFile, token, { mode: 0o444, flag: 'wx' });
    return { paths: { root, input, outbox, tokenFile }, token };
}
function inspect(exec, kind, ref) {
    const r = exec('docker', [kind, 'inspect', ref], 60000);
    if (r.status !== 0)
        return null;
    try {
        const arr = JSON.parse(r.stdout);
        return Array.isArray(arr) ? (arr[0] ?? null) : null;
    }
    catch {
        return null;
    }
}
/**
 * Run one worker command in a fresh container. Returns the run and the mission token (the caller keeps the
 * token in memory only; the receipt records its sha256). Throws MissionRefused on any failed precondition,
 * and in that case no worker process was started.
 */
function runMission(o, exec = exports.nodeExec) {
    const limits = o.limits ?? exports.DEFAULT_LIMITS;
    if (!exports.RUNTIMES.includes(o.runtime))
        throw new MissionRefused(`unknown runtime ${String(o.runtime)}`);
    if (!/^[a-f0-9]{8,32}$/.test(o.missionId))
        throw new MissionRefused('mission id must be 8-32 lowercase hex characters');
    const rt = containerRuntime(exec, o.runtime); // fail closed before anything is created
    // The image, by digest. Pull only if it is not already present.
    /* eslint-disable @typescript-eslint/no-explicit-any */
    let img = inspect(exec, 'image', exports.PINNED_IMAGE);
    if (!img) {
        const pull = exec('docker', ['pull', exports.PINNED_IMAGE], 300000);
        if (pull.status !== 0)
            throw new MissionRefused(`could not pull ${exports.PINNED_IMAGE}: ${pull.error ?? pull.stderr.trim()}`);
        img = inspect(exec, 'image', exports.PINNED_IMAGE);
    }
    const repoDigests = Array.isArray(img?.RepoDigests) ? img.RepoDigests.map(String) : [];
    if (!repoDigests.some((d) => d.endsWith(`@${exports.PINNED_DIGEST}`))) {
        throw new MissionRefused(`image does not carry the pinned digest ${exports.PINNED_DIGEST} (saw ${repoDigests.join(', ') || 'none'})`);
    }
    const imageEnv = Array.isArray(img?.Config?.Env) ? img.Config.Env.map(String) : [];
    const prepared = prepareMission(o.baseDir, o.missionId, o.inputDir ? {} : o.inputFiles);
    const { token } = prepared;
    const paths = o.inputDir ? { ...prepared.paths, input: (0, node_fs_1.realpathSync)(o.inputDir) } : prepared.paths;
    const name = `ts-mission-${o.missionId}`;
    const refuse = (why, containerId) => {
        if (containerId)
            exec('docker', ['rm', '-f', containerId], 60000);
        (0, node_fs_1.rmSync)(paths.root, { recursive: true, force: true });
        throw new MissionRefused(why);
    };
    const created = exec('docker', createArgs(name, exports.PINNED_IMAGE, o.runtime, limits, paths, o.command, o.inputDir ? exports.MOUNTS.input : '/tmp'), 60000);
    if (created.status !== 0)
        refuse(`docker create failed: ${created.error ?? created.stderr.trim()}`);
    const id = created.stdout.trim().split('\n').pop() ?? '';
    // Read back what docker actually configured, BEFORE anything runs.
    const expected = {
        runtime: o.runtime,
        limits,
        imageEnv,
        mounts: [
            { destination: exports.MOUNTS.input, rw: false, source: paths.input },
            { destination: exports.MOUNTS.outbox, rw: true, source: paths.outbox },
            { destination: exports.MOUNTS.token, rw: false, source: paths.tokenFile },
        ],
    };
    const before = inspect(exec, 'container', id);
    if (!before)
        refuse(`docker inspect failed for ${id}`, id);
    const observed = observeProfile(before);
    const checks = checkProfile(observed, expected);
    const bad = checks.filter((c) => !c.ok);
    if (bad.length)
        refuse(`observed profile does not match; not started: ${bad.map((c) => `${c.field}=${JSON.stringify(c.observed)}`).join('; ')}`, id);
    // Start, wait with a wall-clock limit, kill on timeout.
    const started = exec('docker', ['start', id], 60000);
    if (started.status !== 0)
        refuse(`docker start failed: ${started.error ?? started.stderr.trim()}`, id);
    const waited = exec('docker', ['wait', id], limits.timeoutMs);
    if (waited.timedOut || waited.status !== 0)
        exec('docker', ['kill', id], 30000);
    const logs = exec('docker', ['logs', id], 30000);
    const logText = logs.stdout + logs.stderr;
    const after = inspect(exec, 'container', id);
    const postChecks = after ? checkProfile(observeProfile(after), expected) : [];
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return {
        token,
        run: {
            mission_id: o.missionId,
            container_name: name,
            container_id: id,
            image: { ref: exports.PINNED_IMAGE, pinned_digest: exports.PINNED_DIGEST, id: typeof img?.Id === 'string' ? img.Id : null, repo_digests: repoDigests, env: imageEnv },
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
/** Remove the container, then prove it is gone: `docker inspect` must now fail with "No such". */
function destroyContainer(id, exec = exports.nodeExec) {
    const rm = exec('docker', ['rm', '-f', id], 60000);
    const after = exec('docker', ['inspect', id], 30000);
    const err = (after.stderr.trim().split('\n')[0] ?? '').slice(0, 200);
    return {
        container_removed: rm.status === 0 && after.status !== 0 && /no such/i.test(err),
        rm_exit_code: rm.status,
        inspect_after_exit_code: after.status,
        inspect_after_error: err,
    };
}
/** Delete the mission's host dirs (input, outbox, token file) and prove they are gone. */
function deleteMissionDirs(paths) {
    try {
        (0, node_fs_1.rmSync)(paths.root, { recursive: true, force: true });
    }
    catch (e) {
        return { temp_dirs_deleted: !(0, node_fs_1.existsSync)(paths.root), error: String(e.code ?? e) };
    }
    return { temp_dirs_deleted: !(0, node_fs_1.existsSync)(paths.root), error: null };
}
