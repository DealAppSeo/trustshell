/**
 * TrustMedic passport v0 (Agent Immune System IS-P1-10/11): an agent security passport for one sandbox mission.
 *
 * Measured by the SUPERVISOR, never reported by the worker. Every value comes from the supervisor's own
 * observations: `docker inspect` of the container it created, `docker image inspect` of the digest it pinned,
 * the Guard policy file in its own home, the grant it passed to `docker create`, and its own signing key.
 * Nothing here reads the container's filesystem, the outbox, or anything the worker printed or wrote.
 * Each field names its source. The harness key signs the passport (RFC 8785 JCS + Ed25519).
 *
 * Compare passports at mission boundaries, deployments and tool-belt changes (`comparePassports`).
 * A match does not make the worker safe: see NOT_PROVEN, which every passport and comparison carries.
 */
import type { KeyObject } from 'node:crypto';
import { type Signer } from '../lib/install-key';
import { type MissionRun } from './mission';
export declare const PASSPORT_SCHEMA = "trustshell.trustmedic-passport/v0";
export declare const ATTESTATION_SOURCE = "supervisor:docker-inspect";
export declare const NOT_PROVEN: string;
export interface Field<T> {
    value: T;
    source: string;
}
export interface PolicyState {
    state: 'ok' | 'absent' | 'invalid';
    sha256: string | null;
}
/** What the mission was granted: the command, the mounts, the network, the limits. */
export interface ToolBelt {
    commands: string[][];
    mounts: {
        destination: string | null;
        rw: boolean | null;
    }[];
    network: string | null;
    limits: {
        pids: number | null;
        memory: number | null;
        memory_swap: number | null;
        nano_cpus: number | null;
        timeout_ms: number;
    };
}
export interface Passport {
    schema: string;
    mission: Field<{
        mission_id: string;
    }>;
    identity: Field<{
        kind: 'sandbox-worker';
        program_sha256: string;
    }>;
    model_build: Field<{
        image_ref: string;
        pinned_digest: string;
        image_id: string | null;
        pin_in_repo_digests: boolean;
    }>;
    tool_belt: Field<{
        manifest: ToolBelt;
        manifest_sha256: string;
    }>;
    permissions: Field<{
        user: string | null;
        cap_drop: string[];
        cap_add: string[];
        privileged: boolean | null;
        security_opt: string[];
    }>;
    policy: Field<PolicyState>;
    isolation: Field<{
        readonly_rootfs: boolean | null;
        tmpfs: Record<string, string>;
    }>;
    runtime: Field<{
        requested: string;
        observed: string | null;
    }>;
    trusted_memory: Field<{
        version: 'none' | 'unknown';
    }>;
    deployment: Field<{
        docker_server_version: string;
    }>;
    attestation: Field<{
        source: string;
        harness_key_fingerprint: string;
    }>;
    not_proven: string;
}
/** The parts of a mission run (or of a receipt, which carries the same fields) a passport is measured from. */
export type PassportRun = Pick<MissionRun, 'mission_id' | 'image' | 'runtime' | 'limits' | 'profile' | 'worker'>;
/** The Guard policy in the supervisor's home, named by policySha256. Never a file from the mission. */
export declare function supervisorPolicy(home: string): PolicyState;
export declare function buildPassport(r: PassportRun, policy: PolicyState, harness: Signer): Passport;
export interface SignedPassport {
    passport: Passport;
    sha256: string;
    signature: string;
}
export declare function signPassport(p: Passport, harnessKey: KeyObject): SignedPassport;
/** Every reason this signed passport should not be believed. Empty means it verifies against `harness`. */
export declare function verifyPassport(s: SignedPassport, harness: Signer): string[];
export type DriftClass = 'requalify' | 'review' | 'ignored';
/** Severity of a change per field. A field not listed here (unknown, added) requalifies. */
export declare const DRIFT_CLASS: Record<string, DriftClass>;
export interface Drift {
    field: string;
    status: 'identical' | 'changed' | 'missing';
    class: DriftClass;
    a?: unknown;
    b?: unknown;
}
export interface Comparison {
    verdict: 'match' | 'review' | 'requalify';
    drifts: Drift[];
    not_proven: string;
}
/** Field-by-field drift between two passports (value and source both count). */
export declare function comparePassports(a: Passport, b: Passport): Comparison;
