/** node:22-alpine, OCI index digest read from registry-1.docker.io on 2026-11-02 17:03 UTC. */
export declare const PINNED_DIGEST = "sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914";
export declare const PINNED_IMAGE = "node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914";
export type Runtime = 'runc' | 'runsc';
export declare const RUNTIMES: readonly Runtime[];
export interface Limits {
    pids: number;
    memoryBytes: number;
    cpus: number;
    timeoutMs: number;
}
export declare const DEFAULT_LIMITS: Limits;
export declare const TMPFS_OPTS = "noexec,nosuid,nodev,size=64m";
export declare const WORKER_USER = "65534:65534";
/** Where things appear inside the container. Only the outbox is writable. */
export declare const MOUNTS: {
    readonly input: "/mission/input";
    readonly outbox: "/mission/outbox";
    readonly token: "/run/mission/token";
};
export interface ExecResult {
    status: number | null;
    stdout: string;
    stderr: string;
    error: string | null;
    timedOut: boolean;
}
export type Exec = (cmd: string, args: string[], timeoutMs?: number) => ExecResult;
/** Runs the docker CLI. The CLI's own environment never reaches the container: no `-e` or `--env-file` is ever passed. */
export declare const nodeExec: Exec;
export declare class MissionRefused extends Error {
    constructor(message: string);
}
export interface MissionPaths {
    root: string;
    input: string;
    outbox: string;
    tokenFile: string;
}
export interface ObservedMount {
    Type: string | null;
    Source: string | null;
    Destination: string | null;
    RW: boolean | null;
}
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
export interface ExpectedMount {
    destination: string;
    rw: boolean;
    source: string | null;
}
export interface ExpectedProfile {
    runtime: Runtime;
    limits: Limits;
    imageEnv: string[];
    mounts: ExpectedMount[];
}
export interface ProfileCheck {
    field: string;
    expected: unknown;
    observed: unknown;
    ok: boolean;
}
/** The mount shape every mission must have. Sources are added by the runner, which knows the host paths. */
export declare const MOUNT_SHAPE: ExpectedMount[];
export declare function observeProfile(j: any): ObservedProfile;
/** Compare what docker reports with what a mission requires. Used before start, and again by the verifier. */
export declare function checkProfile(o: ObservedProfile, e: ExpectedProfile): ProfileCheck[];
/** The `docker create` arguments. Pure, so the profile is unit-tested without Docker. */
export declare function createArgs(name: string, image: string, runtime: Runtime, limits: Limits, paths: MissionPaths, command: string[], workdir?: string): string[];
/** Is there a container runtime, and the one asked for? Throws MissionRefused otherwise. */
export declare function containerRuntime(exec: Exec, want: Runtime): {
    server_version: string;
    available: string[];
};
/** Make the host side: input (read-only to the worker), outbox (the one writable place), token file. */
export declare function prepareMission(baseDir: string, missionId: string, inputFiles: Record<string, string>): {
    paths: MissionPaths;
    token: string;
};
export interface MissionOptions {
    baseDir: string;
    missionId: string;
    runtime: Runtime;
    command: string[];
    inputFiles: Record<string, string>;
    /**
     * A host directory bound READ-ONLY as the input instead of a copy of `inputFiles` (`trustshell run --sandbox`
     * binds the current directory). The command starts in it. It is never written or deleted by the runner.
     */
    inputDir?: string;
    limits?: Limits;
}
export interface MissionRun {
    mission_id: string;
    container_name: string;
    container_id: string;
    image: {
        ref: string;
        pinned_digest: string;
        id: string | null;
        repo_digests: string[];
        env: string[];
    };
    runtime: {
        requested: Runtime;
        observed: string | null;
        docker_server_version: string;
        available: string[];
    };
    limits: Limits;
    profile: {
        observed: ObservedProfile;
        checks: ProfileCheck[];
        all_ok: boolean;
        post_run_all_ok: boolean;
    };
    /** Logs are hashed, never copied: a worker could print anything, including a secret it read. */
    worker: {
        command: string[];
        exit_code: number | null;
        timed_out: boolean;
        oom_killed: boolean | null;
        logs_sha256: string;
        logs_bytes: number;
    };
    token_sha256: string;
    paths: MissionPaths;
}
/**
 * Run one worker command in a fresh container. Returns the run and the mission token (the caller keeps the
 * token in memory only; the receipt records its sha256). Throws MissionRefused on any failed precondition,
 * and in that case no worker process was started.
 */
export declare function runMission(o: MissionOptions, exec?: Exec): {
    run: MissionRun;
    token: string;
};
export interface DestroyEvidence {
    container_removed: boolean;
    rm_exit_code: number | null;
    inspect_after_exit_code: number | null;
    inspect_after_error: string;
}
/** Remove the container, then prove it is gone: `docker inspect` must now fail with "No such". */
export declare function destroyContainer(id: string, exec?: Exec): DestroyEvidence;
/** Delete the mission's host dirs (input, outbox, token file) and prove they are gone. */
export declare function deleteMissionDirs(paths: MissionPaths): {
    temp_dirs_deleted: boolean;
    error: string | null;
};
