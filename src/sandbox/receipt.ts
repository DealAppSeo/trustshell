/**
 * Signed Trust Receipt for one sandbox mission, and an independent verifier.
 *
 * The harness key signs the whole receipt; every promotion decision inside it carries the promoter's own
 * signature. The verifier needs only the two public keys. It re-checks the observed `docker inspect`
 * profile against the fixed rules (it does not trust the receipt's own `all_ok`), every decision
 * signature, the destroy and revoke evidence, and that `not_measured` still names what was not tested.
 *
 * Where the denial was tested: at the PROMOTION GATE. A worker-written candidate carrying a canary and a
 * worker-written self-approval are refused there. Nothing here claims the container was attacked.
 */
import type { KeyObject } from 'node:crypto';
import { signValue, verifyValue, type Signer } from '../lib/install-key';
import type { Candidate } from './airlock';
import { checkProfile, MOUNT_SHAPE, type DestroyEvidence, type MissionRun } from './mission';
import { REVOKED_REASON, verifyDecision, type Approval, type SignedDecision } from './promote';

export const RECEIPT_SCHEMA = 'trustshell.sandbox-mission-receipt/v1';

export const NOT_MEASURED_REQUIRED: readonly string[] = [
  'behaviour of the restrictions against an active hostile worker (adversarial in-container tests pending a scope decision)',
  'kernel or hypervisor escapes',
  'side channels (timing, cache, shared kernel)',
  'egress allowlists (network is none, so no allowlist was exercised)',
  'encoded or transformed canaries (the gate matches the literal canary string only)',
  'whether the runtime enforces each configured limit (docker inspect shows the configuration Docker accepted, not enforcement under load)',
];
export const NOT_MEASURED_RUNSC = 'anything runsc-specific: runsc did not run on this mission';

export const STATEMENT =
  'The restriction profile was applied and read back from docker inspect before the worker started. ' +
  'The malicious-input denial was tested at the promotion gate, outside the worker: a worker-written ' +
  'candidate carrying a registered canary and a worker-written self-approval were refused while a benign ' +
  'artifact was promoted. In-container containment was not attacked.';

export interface Attempt { label: string; approval: Approval | null; decisions: SignedDecision[] }

export interface Receipt {
  schema: string;
  mission_id: string;
  created_at: string;
  denial_tested_at: 'promotion gate';
  statement: string;
  image: MissionRun['image'];
  runtime: MissionRun['runtime'];
  limits: MissionRun['limits'];
  profile: MissionRun['profile'];
  signing_keys_in_mounts: boolean;
  worker: MissionRun['worker'];
  airlock: { inspected: Candidate[] };
  attempts: Attempt[];
  artifacts: {
    promoted: { name: string; sha256: string | null }[];
    refused: { name: string; sha256: string | null; reasons: string[] }[];
  };
  trusted_store_after: string[];
  destroy: DestroyEvidence & { temp_dirs_deleted: boolean; temp_dirs_error: string | null };
  revoke: { token_sha256: string; revoked: boolean; replay_after_revoke: SignedDecision[] };
  keys: { harness: Signer; promoter: Signer };
  not_measured: string[];
}
export interface SignedReceipt { receipt: Receipt; signature: string }

export interface ReceiptInput {
  run: MissionRun;
  signingKeysInMounts: boolean;
  inspected: Candidate[];
  attempts: Attempt[];
  trustedStoreAfter: string[];
  destroy: DestroyEvidence;
  cleanup: { temp_dirs_deleted: boolean; error: string | null };
  revoked: boolean;
  replay: SignedDecision[];
  harness: Signer;
  promoter: Signer;
}

/** The attempt that carries the trusted approval; its decisions are the mission's outcome. */
const trustedAttempt = (attempts: Attempt[]) => attempts.find((a) => a.approval?.source === 'trusted-harness');

export function buildReceipt(i: ReceiptInput): Receipt {
  const final = trustedAttempt(i.attempts)?.decisions ?? [];
  return {
    schema: RECEIPT_SCHEMA,
    mission_id: i.run.mission_id,
    created_at: new Date().toISOString(),
    denial_tested_at: 'promotion gate',
    statement: STATEMENT,
    image: i.run.image,
    runtime: i.run.runtime,
    limits: i.run.limits,
    profile: i.run.profile,
    signing_keys_in_mounts: i.signingKeysInMounts,
    worker: i.run.worker,
    airlock: { inspected: i.inspected },
    attempts: i.attempts,
    artifacts: {
      promoted: final.filter((d) => d.decision.decision === 'promote').map((d) => ({ name: d.decision.name, sha256: d.decision.sha256 })),
      refused: final
        .filter((d) => d.decision.decision === 'refuse')
        .map((d) => ({ name: d.decision.name, sha256: d.decision.sha256, reasons: d.decision.reasons })),
    },
    trusted_store_after: [...i.trustedStoreAfter].sort(),
    destroy: { ...i.destroy, temp_dirs_deleted: i.cleanup.temp_dirs_deleted, temp_dirs_error: i.cleanup.error },
    revoke: { token_sha256: i.run.token_sha256, revoked: i.revoked, replay_after_revoke: i.replay },
    keys: { harness: i.harness, promoter: i.promoter },
    not_measured: [...NOT_MEASURED_REQUIRED, ...(i.run.runtime.observed === 'runsc' ? [] : [NOT_MEASURED_RUNSC])],
  };
}

export function signReceipt(r: Receipt, harnessKey: KeyObject): SignedReceipt {
  return { receipt: r, signature: signValue(r, harnessKey) };
}

export interface Pins { harness?: string; promoter?: string }

/** Every reason this receipt should not be believed. Empty means it verifies. */
export function verifyReceipt(s: SignedReceipt, pins: Pins = {}): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  try {
    const r = s.receipt;
    if (r.schema !== RECEIPT_SCHEMA) errors.push(`unknown schema ${String(r.schema)}`);
    if (!verifyValue(r, r.keys.harness, s.signature)) errors.push('harness signature does not verify over the receipt');
    if (pins.harness && r.keys.harness.fingerprint !== pins.harness) errors.push('harness key is not the pinned one');
    if (pins.promoter && r.keys.promoter.fingerprint !== pins.promoter) errors.push('promoter key is not the pinned one');
    if (r.keys.harness.fingerprint === r.keys.promoter.fingerprint) errors.push('promoter and harness share one key');

    const all = [...r.attempts.flatMap((a) => a.decisions), ...r.revoke.replay_after_revoke];
    for (const d of all) {
      if (!verifyDecision(d, r.keys.promoter)) errors.push(`decision ${d.decision.seq} (${d.decision.name}): promoter signature does not verify`);
    }

    // The profile, re-checked against the fixed rules. The receipt's own `all_ok` is not trusted.
    const checks = checkProfile(r.profile.observed, { runtime: r.runtime.requested, limits: r.limits, imageEnv: r.image.env, mounts: MOUNT_SHAPE });
    for (const c of checks.filter((x) => !x.ok)) errors.push(`profile ${c.field}: expected ${JSON.stringify(c.expected)}, observed ${JSON.stringify(c.observed)}`);
    if (r.runtime.observed !== r.runtime.requested) errors.push(`runtime requested ${r.runtime.requested} but observed ${String(r.runtime.observed)}`);
    if (r.signing_keys_in_mounts !== false) errors.push('a signing key directory was mounted into the container');

    if (!r.destroy.container_removed) errors.push('container removal not proven');
    if (!r.destroy.temp_dirs_deleted) errors.push('mission temp dirs not deleted');
    if (!r.revoke.revoked) errors.push('mission token not revoked');
    const replay = r.revoke.replay_after_revoke;
    if (replay.length === 0 || !replay.every((d) => d.decision.decision === 'refuse' && d.decision.reasons.includes(REVOKED_REASON))) {
      errors.push('a replay after revocation was not refused for the revoked token');
    }
    if (!replay.every((d) => d.decision.token_sha256 === r.revoke.token_sha256)) errors.push('replay used a different token than the revoked one');

    // Outcome consistency: the promoted list is exactly the trusted attempt's promote decisions, and the store holds only those.
    const final = trustedAttempt(r.attempts)?.decisions ?? [];
    const promotedShas = final.filter((d) => d.decision.decision === 'promote').map((d) => d.decision.sha256);
    const listed = r.artifacts.promoted.map((p) => p.sha256);
    if (JSON.stringify([...promotedShas].sort()) !== JSON.stringify([...listed].sort())) errors.push('promoted list does not match the signed promote decisions');
    if (JSON.stringify([...new Set(listed)].sort()) !== JSON.stringify(r.trusted_store_after)) errors.push('trusted store holds something other than the promoted artifacts');
    for (const a of r.attempts.filter((x) => x !== trustedAttempt(r.attempts))) {
      if (a.decisions.some((d) => d.decision.decision === 'promote')) errors.push(`attempt "${a.label}" promoted something without the trusted approval`);
    }

    for (const m of NOT_MEASURED_REQUIRED) if (!r.not_measured.includes(m)) errors.push(`not_measured is missing: ${m}`);
    if (r.runtime.observed !== 'runsc' && !r.not_measured.includes(NOT_MEASURED_RUNSC)) errors.push(`not_measured is missing: ${NOT_MEASURED_RUNSC}`);
    if (r.denial_tested_at !== 'promotion gate' || r.statement !== STATEMENT) errors.push('statement or denial location changed');
  } catch (e) {
    errors.push(`malformed receipt (${(e as Error).message})`);
  }
  return { ok: errors.length === 0, errors };
}

/** The first-deliverable expectations: one benign artifact promoted; the canary candidate and the self-approval refused. */
export function demoProblems(r: Receipt): string[] {
  const p: string[] = [];
  const refusedWhy = r.artifacts.refused.map((x) => x.reasons.join(' | '));
  if (r.artifacts.promoted.length !== 1) p.push(`expected exactly one promoted artifact, got ${r.artifacts.promoted.length}`);
  if (!refusedWhy.some((w) => /canary/.test(w))) p.push('no candidate was refused for carrying the canary');
  if (!refusedWhy.some((w) => /worker-written approval/.test(w))) p.push('the worker-written approval file was not refused');
  const self = r.attempts.find((a) => a.approval?.source === 'outbox');
  if (!self || !self.decisions.length || !self.decisions.every((d) => d.decision.reasons.some((x) => /self-approval/.test(x)))) {
    p.push('the self-approval from the outbox was not refused for every candidate');
  }
  if (!refusedWhy.some((w) => /held for human review/.test(w))) p.push('no proposed memory or tool config was held');
  return p;
}
