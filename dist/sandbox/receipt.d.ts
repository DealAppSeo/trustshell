/**
 * Signed Trust Receipt for one sandbox mission, and an independent verifier.
 *
 * The harness key signs the whole receipt; every promotion decision inside it carries the promoter's own
 * signature. The verifier needs only the two public keys. It re-checks the observed `docker inspect`
 * profile against the fixed rules (it does not trust the receipt's own `all_ok`), every decision
 * signature, the destroy and revoke evidence, and that `not_measured` still names what was not tested.
 *
 * From v2 the receipt carries the TrustMedic passport (`passport.ts`), signed by the same harness key. The
 * verifier checks its digest and signature and recomputes it from the receipt's own observations, so a
 * passport cannot claim a configuration the receipt did not observe. v1 receipts (no passport) still verify.
 *
 * Where the denial was tested: at the PROMOTION GATE. A worker-written candidate carrying a canary and a
 * worker-written self-approval are refused there. Nothing here claims the container was attacked.
 */
import type { KeyObject } from 'node:crypto';
import { type Signer } from '../lib/install-key';
import type { Candidate } from './airlock';
import { type DestroyEvidence, type MissionRun } from './mission';
import { type SignedPassport } from './passport';
import { type Approval, type SignedDecision } from './promote';
export declare const RECEIPT_SCHEMA = "trustshell.sandbox-mission-receipt/v2";
/** Before passports. Still verified, under its own rules. */
export declare const RECEIPT_SCHEMA_V1 = "trustshell.sandbox-mission-receipt/v1";
export declare const NOT_MEASURED_REQUIRED: readonly string[];
export declare const NOT_MEASURED_RUNSC = "anything runsc-specific: runsc did not run on this mission";
export declare const STATEMENT: string;
/**
 * The statement a `trustshell run --sandbox` receipt carries instead (src/sandbox/run.ts): that mission tests no
 * malicious input, so it must not carry STATEMENT's canary and self-approval claims.
 */
export declare const RUN_STATEMENT: string;
/** What a `run --sandbox` receipt adds to `not_measured`: the whole current directory is the command's input. */
export declare const NOT_MEASURED_CWD = "what the command read: the current directory is mounted read-only, so it can read every file there and copy any of them to the outbox; no canary is registered for them";
export interface Attempt {
    label: string;
    approval: Approval | null;
    decisions: SignedDecision[];
}
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
    airlock: {
        inspected: Candidate[];
    };
    attempts: Attempt[];
    artifacts: {
        promoted: {
            name: string;
            sha256: string | null;
        }[];
        refused: {
            name: string;
            sha256: string | null;
            reasons: string[];
        }[];
    };
    trusted_store_after: string[];
    destroy: DestroyEvidence & {
        temp_dirs_deleted: boolean;
        temp_dirs_error: string | null;
    };
    revoke: {
        token_sha256: string;
        revoked: boolean;
        replay_after_revoke: SignedDecision[];
    };
    keys: {
        harness: Signer;
        promoter: Signer;
    };
    not_measured: string[];
    /** v2 on. Absent from v1 receipts. */
    passport?: SignedPassport;
}
export interface SignedReceipt {
    receipt: Receipt;
    signature: string;
}
export interface ReceiptInput {
    run: MissionRun;
    passport: SignedPassport;
    signingKeysInMounts: boolean;
    inspected: Candidate[];
    attempts: Attempt[];
    trustedStoreAfter: string[];
    destroy: DestroyEvidence;
    cleanup: {
        temp_dirs_deleted: boolean;
        error: string | null;
    };
    revoked: boolean;
    replay: SignedDecision[];
    harness: Signer;
    promoter: Signer;
}
export declare function buildReceipt(i: ReceiptInput): Receipt;
export declare function signReceipt(r: Receipt, harnessKey: KeyObject): SignedReceipt;
export interface Pins {
    harness?: string;
    promoter?: string;
}
/** Every reason this receipt should not be believed. Empty means it verifies. */
export declare function verifyReceipt(s: SignedReceipt, pins?: Pins): {
    ok: boolean;
    errors: string[];
};
/** The first-deliverable expectations: one benign artifact promoted; the canary candidate and the self-approval refused. */
export declare function demoProblems(r: Receipt): string[];
