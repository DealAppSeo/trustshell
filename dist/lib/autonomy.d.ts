import { type ClaimStatus, type ClaimTally } from './action-evidence';
import type { GuardFs, GuardRequest } from './guardrails';
export declare const AUTONOMY_FILE = "autonomy.jsonl";
export declare const AUTONOMY_RECORD_SCHEMA = "trustshell.autonomy-record/0.1-draft";
export type Level = 0 | 1 | 2 | 3;
export type AutonomyMode = 'shadow' | 'enforce';
export declare const LEVEL_MEANS: readonly string[];
/** Every agent starts here. L0 is where revocation puts it. */
export declare const START_LEVEL: Level;
/** trustshell commands that only read: L1 lets these start. A `run` names an executable, so it is never one of these. */
export declare const READ_ONLY_COMMANDS: readonly string[];
export interface AutonomyConfig {
    mode: AutonomyMode;
    /** Inspect records SUPPORTED in full, one per commit, needed to reach each level from the one below it. */
    promote_after: {
        L1: number;
        L2: number;
        L3: number;
    };
}
export declare const DEFAULT_AUTONOMY: AutonomyConfig;
/** PURE. The `autonomy` block of a policy, as strictly as the rest of it: unknown keys and missing ones are errors. */
export declare function parseAutonomy(v: unknown): {
    ok: true;
    config: AutonomyConfig;
} | {
    ok: false;
    errors: string[];
};
/** PURE. Whether a level lets this request start. The policy is weighed separately, and both must allow it. */
export declare function levelAllows(level: Level, req: Pick<GuardRequest, 'tool' | 'class' | 'executable'>): boolean;
type Ref = {
    seq: number;
    hash: string;
};
type Verdict = 'ALLOWED' | 'DENIED';
export type AutonomyEvent = 
/** One Inspect record, attributed to the policy's subject by whoever recorded it. */
{
    kind: 'evidence';
    subject: string;
    run: string;
    commit: string;
    record_sha256: string;
    outcome: ClaimStatus;
    tally: ClaimTally;
}
/** A Guard refusal of an out-of-lane attempt, by its guard record. */
 | {
    kind: 'incident';
    guard_record: Ref;
    action: string;
    reasons: string[];
} | {
    kind: 'revocation';
    via: string;
} | {
    kind: 'level-change';
    from: Level;
    to: Level;
    reason: string;
}
/** fixed: what the policy alone decided. earned: what the policy and the level decide together. */
 | {
    kind: 'would-be';
    guard_record: Ref;
    action: string;
    class: GuardRequest['class'];
    level: Level;
    fixed: Verdict;
    earned: Verdict;
};
export type AutonomyRecord = AutonomyEvent & {
    schema: typeof AUTONOMY_RECORD_SCHEMA;
    seq: number;
    ts: string;
    /** The mode in force when the record was written. */
    mode: AutonomyMode;
    prev: string | null;
    hash: string;
};
export interface AutonomyReading {
    verdict: 'INTACT' | 'BROKEN' | 'EMPTY';
    records: AutonomyRecord[];
    breaks: string[];
}
/** PURE. Check every hash and link of `autonomy.jsonl`, the guard ledger's way. */
export declare function readAutonomy(text: string): AutonomyReading;
export interface LevelState {
    level: Level;
    /** The reason of the last level change, or the start. */
    reason: string;
    /** Inspect records SUPPORTED in full since the last level change, each on a commit never counted before. */
    supported: number;
    /** What the next level needs: null at L3, or while the record is BROKEN. */
    needed: number | null;
    chain: AutonomyReading['verdict'];
}
/** PURE. The level is the last change's `to`; the count is what came after it. A BROKEN record reads as L0. */
export declare function levelState(reading: AutonomyReading, config: AutonomyConfig): LevelState;
/**
 * Append events to `autonomy.jsonl` in `dir`, each followed by the level change it causes, if any. The CALLER holds
 * the guard lock. `reading` is that file as the caller already read it.
 * ponytail: reads and verifies the whole file per guard decision, like the guard ledger before its checkpoint; add a
 * checkpoint (GUARD_CHECKPOINT_FILE's shape) when the would-be records make that measurable.
 */
export declare function appendAutonomy(dir: string, fs: GuardFs, config: AutonomyConfig, events: AutonomyEvent[], ts: string, reading?: AutonomyReading): AutonomyRecord[];
/**
 * PURE. An Inspect record, as `check --out` writes record.json (and `--json` prints): `{ record, digest }`. The digest
 * must match, and one outcome is drawn from it: CONTRADICTED if any claim is, SUPPORTED only when every claim is
 * SUPPORTED on a complete run (exit 0), and NOT_CHECKED otherwise.
 */
export declare function evidenceFromRecordFile(text: string, subject: string): {
    ok: true;
    event: Extract<AutonomyEvent, {
        kind: 'evidence';
    }>;
} | {
    ok: false;
    error: string;
};
/**
 * Record one piece of evidence or a revocation, under the guard lock. A run already recorded is refused, whatever
 * either outcome was: one record per run, so a run cannot be re-inspected with other claims until one counts.
 */
export declare function recordAutonomyEvent(dir: string, fs: GuardFs, config: AutonomyConfig, ev: Extract<AutonomyEvent, {
    kind: 'evidence' | 'revocation';
}>, ts?: string): {
    ok: true;
    added: AutonomyRecord[];
    before: LevelState;
    after: LevelState;
} | {
    ok: false;
    error: string;
};
/** What the would-be records measured so far: how often the level would have refused what the policy allowed. */
export declare function measured(reading: AutonomyReading): {
    decisions: number;
    fixed_allowed: number;
    earned_denied: number;
};
export {};
