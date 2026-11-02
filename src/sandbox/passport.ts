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
import { loadPolicy } from '../lib/guardrails';
import { signValue, verifyValue, type Signer } from '../lib/install-key';
import { canonicalize, jcsSha256 } from '../lib/jcs';
import { MOUNT_SHAPE, type MissionRun } from './mission';

export const PASSPORT_SCHEMA = 'trustshell.trustmedic-passport/v0';
export const ATTESTATION_SOURCE = 'supervisor:docker-inspect';
export const NOT_PROVEN =
  'A matching passport means the supervisor measured the same configuration twice. It does not prove that the ' +
  "worker's reasoning, outputs or memory are safe, and it says nothing about what ran inside the container.";

export interface Field<T> { value: T; source: string }
export interface PolicyState { state: 'ok' | 'absent' | 'invalid'; sha256: string | null }
/** What the mission was granted: the command, the mounts, the network, the limits. */
export interface ToolBelt {
  commands: string[][];
  mounts: { destination: string | null; rw: boolean | null }[];
  network: string | null;
  limits: { pids: number | null; memory: number | null; memory_swap: number | null; nano_cpus: number | null; timeout_ms: number };
}

export interface Passport {
  schema: string;
  mission: Field<{ mission_id: string }>;
  identity: Field<{ kind: 'sandbox-worker'; program_sha256: string }>;
  model_build: Field<{ image_ref: string; pinned_digest: string; image_id: string | null; pin_in_repo_digests: boolean }>;
  tool_belt: Field<{ manifest: ToolBelt; manifest_sha256: string }>;
  permissions: Field<{ user: string | null; cap_drop: string[]; cap_add: string[]; privileged: boolean | null; security_opt: string[] }>;
  policy: Field<PolicyState>;
  isolation: Field<{ readonly_rootfs: boolean | null; tmpfs: Record<string, string> }>;
  runtime: Field<{ requested: string; observed: string | null }>;
  trusted_memory: Field<{ version: 'none' | 'unknown' }>;
  deployment: Field<{ docker_server_version: string }>;
  attestation: Field<{ source: string; harness_key_fingerprint: string }>;
  not_proven: string;
}

/** The parts of a mission run (or of a receipt, which carries the same fields) a passport is measured from. */
export type PassportRun = Pick<MissionRun, 'mission_id' | 'image' | 'runtime' | 'limits' | 'profile' | 'worker'>;

/** The Guard policy in the supervisor's home, named by policySha256. Never a file from the mission. */
export function supervisorPolicy(home: string): PolicyState {
  const p = loadPolicy(home);
  return p.state === 'ok' ? { state: 'ok', sha256: p.sha256 } : { state: p.state, sha256: null };
}

export function buildPassport(r: PassportRun, policy: PolicyState, harness: Signer): Passport {
  const o = r.profile.observed;
  const manifest: ToolBelt = {
    commands: [r.worker.command],
    // Destinations and modes only: host-side sources are per-run temp paths.
    mounts: o.Mounts.map((m) => ({ destination: m.Destination, rw: m.RW })).sort((a, b) => (String(a.destination) < String(b.destination) ? -1 : 1)),
    network: o.NetworkMode,
    limits: { pids: o.PidsLimit, memory: o.Memory, memory_swap: o.MemorySwap, nano_cpus: o.NanoCpus, timeout_ms: r.limits.timeoutMs },
  };
  const granted = new Set(MOUNT_SHAPE.map((m) => m.destination));
  return {
    schema: PASSPORT_SCHEMA,
    mission: { value: { mission_id: r.mission_id }, source: 'supervisor:mission id it generated' },
    identity: { value: { kind: 'sandbox-worker', program_sha256: jcsSha256(r.worker.command) }, source: 'supervisor:docker-create arguments (worker command)' },
    model_build: {
      value: { image_ref: r.image.ref, pinned_digest: r.image.pinned_digest, image_id: r.image.id, pin_in_repo_digests: r.image.repo_digests.some((d) => d.endsWith(`@${r.image.pinned_digest}`)) },
      source: 'supervisor:docker-image-inspect of the pinned digest',
    },
    tool_belt: { value: { manifest, manifest_sha256: jcsSha256(manifest) }, source: 'supervisor:docker-inspect (Mounts, NetworkMode, limits) + docker-create command + wall-clock limit' },
    permissions: { value: { user: o.User, cap_drop: o.CapDrop, cap_add: o.CapAdd, privileged: o.Privileged, security_opt: o.SecurityOpt }, source: ATTESTATION_SOURCE },
    policy: { value: policy, source: 'supervisor:Guard policy file in the supervisor home (policySha256)' },
    isolation: { value: { readonly_rootfs: o.ReadonlyRootfs, tmpfs: o.Tmpfs }, source: ATTESTATION_SOURCE },
    runtime: { value: { requested: r.runtime.requested, observed: r.runtime.observed }, source: 'supervisor:docker-inspect HostConfig.Runtime' },
    // The mission is granted no memory: a mount beyond input, outbox and token would make this unknown.
    trusted_memory: { value: { version: o.Mounts.every((m) => granted.has(String(m.Destination))) ? 'none' : 'unknown' }, source: 'supervisor:docker-inspect Mounts' },
    deployment: { value: { docker_server_version: r.runtime.docker_server_version }, source: 'supervisor:docker version' },
    attestation: { value: { source: ATTESTATION_SOURCE, harness_key_fingerprint: harness.fingerprint }, source: 'supervisor:harness key' },
    not_proven: NOT_PROVEN,
  };
}

export interface SignedPassport { passport: Passport; sha256: string; signature: string }

export function signPassport(p: Passport, harnessKey: KeyObject): SignedPassport {
  return { passport: p, sha256: jcsSha256(p), signature: signValue(p, harnessKey) };
}

/** Every reason this signed passport should not be believed. Empty means it verifies against `harness`. */
export function verifyPassport(s: SignedPassport, harness: Signer): string[] {
  const e: string[] = [];
  try {
    if (s.passport.schema !== PASSPORT_SCHEMA) e.push(`unknown passport schema ${String(s.passport.schema)}`);
    if (jcsSha256(s.passport) !== s.sha256) e.push('digest does not match the passport');
    if (!verifyValue(s.passport, harness, s.signature)) e.push('harness signature does not verify over the passport');
    if (s.passport.attestation?.value?.harness_key_fingerprint !== harness.fingerprint) e.push('the passport names a different harness key');
  } catch (x) {
    e.push(`malformed passport (${(x as Error).message})`);
  }
  return e;
}

export type DriftClass = 'requalify' | 'review' | 'ignored';
/** Severity of a change per field. A field not listed here (unknown, added) requalifies. */
export const DRIFT_CLASS: Record<string, DriftClass> = {
  schema: 'requalify',
  mission: 'ignored',
  identity: 'requalify',
  model_build: 'requalify',
  tool_belt: 'requalify',
  permissions: 'requalify',
  policy: 'requalify',
  isolation: 'requalify',
  runtime: 'requalify',
  trusted_memory: 'requalify',
  deployment: 'review',
  attestation: 'review',
  not_proven: 'review',
};

export interface Drift { field: string; status: 'identical' | 'changed' | 'missing'; class: DriftClass; a?: unknown; b?: unknown }
export interface Comparison { verdict: 'match' | 'review' | 'requalify'; drifts: Drift[]; not_proven: string }

/** Field-by-field drift between two passports (value and source both count). */
export function comparePassports(a: Passport, b: Passport): Comparison {
  const A = a as unknown as Record<string, unknown>;
  const B = b as unknown as Record<string, unknown>;
  const has = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);
  const drifts = [...new Set([...Object.keys(A), ...Object.keys(B)])].sort().map((field): Drift => {
    const cls = DRIFT_CLASS[field] ?? 'requalify';
    if (!has(A, field) || !has(B, field)) return { field, status: 'missing', class: cls, a: A[field] ?? null, b: B[field] ?? null };
    return canonicalize(A[field]) === canonicalize(B[field]) ? { field, status: 'identical', class: cls } : { field, status: 'changed', class: cls, a: A[field], b: B[field] };
  });
  const live = drifts.filter((d) => d.status !== 'identical' && d.class !== 'ignored');
  return { verdict: live.some((d) => d.class === 'requalify') ? 'requalify' : live.length ? 'review' : 'match', drifts, not_proven: NOT_PROVEN };
}
