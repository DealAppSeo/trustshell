import { type Signer } from './install-key';
export declare const POLICY_FILE = "policy.json";
/** An imported policy that could not be enforced (unsigned, or signed by a key nobody named) lands here. */
export declare const SUGGESTED_POLICY_FILE = "policy.suggested.json";
export declare const GUARD_RECEIPTS_FILE = "guard-receipts.jsonl";
export declare const GUARD_RECORD_SCHEMA = "trustshell.guard-record/1";
export type ToolClass = 'read' | 'spend' | 'post' | 'other';
export declare const TOOL_CLASSES: readonly ToolClass[];
/** The local owner policy: a subset of the kernel's OwnerPolicy. */
export interface LocalPolicy {
    subject: string;
    actions: string[];
    per_tx_raw: string;
    daily_raw: string;
    total_raw: string;
    expires_at: number;
    nonce: string;
}
export interface PolicySignature extends Signer {
    /** Ed25519 over the RFC 8785 form of `policy`, base64. */
    signature: string;
}
/** `{ policy, signature }`, as the kernel takes it. `signature` is null for a policy nobody signed. */
export interface PolicyDocument {
    policy: LocalPolicy;
    signature: PolicySignature | null;
}
/** The commands that only read or write local files: what `guard init` allows. */
export declare const LOCAL_TOOLS: readonly ["bundle", "ground", "init", "inspect", "learn", "profile", "quarantine", "recall", "redact", "remember", "report", "traps"];
/** The policy `guard init` writes: local commands only, every limit 0, expires in `days` days. */
export declare function defaultPolicy(nowS?: number, days?: number): LocalPolicy;
export declare function trustshellHome(env?: NodeJS.ProcessEnv, home?: string): string;
/**
 * PURE. Parse a policy the way the kernel's parsePolicy does: unknown keys are errors, a MISSING limit is "0"
 * (and listed in `defaulted`), a PRESENT malformed one is an error, never quietly zeroed.
 */
export declare function parsePolicy(input: unknown): {
    ok: true;
    policy: LocalPolicy;
    defaulted: string[];
} | {
    ok: false;
    errors: string[];
};
/** PURE. Parse `{ policy, signature }` text. A signature that is present must be well formed (verified separately). */
export declare function parsePolicyDocument(text: string): {
    ok: true;
    doc: PolicyDocument;
    defaulted: string[];
} | {
    ok: false;
    errors: string[];
};
export declare function renderPolicyDocument(doc: PolicyDocument): string;
/** sha256 of the RFC 8785 form of the policy: what records and bundles name it by. */
export declare function policySha256(p: LocalPolicy): string;
/** Does the signature verify over the policy, by a key whose fingerprint is one of `trusted`? */
export declare function policySignedBy(doc: PolicyDocument, trusted: readonly string[]): boolean;
/** What one action asks for. `amount_raw` is smallest units, a canonical decimal string. */
export interface GuardRequest {
    tool: string;
    class: ToolClass;
    amount_raw?: string;
    /** sha256 of the command a `trustshell run` would start; the command itself is never recorded. */
    command_sha256?: string;
}
/** The action string the policy must list for this request (the kernel's actionPermitted). */
export declare function actionFor(req: GuardRequest): string;
export interface GuardDecision {
    decision: 'ALLOWED' | 'DENIED';
    /** Every rule the request broke, not just the first. Empty when allowed. */
    reasons: string[];
}
/**
 * PURE. Weigh one request against the policy. `policy === null` is a file that did not parse: denied.
 * `spent` is what this ledger already ALLOWED today and in total; null means the ledger could not be
 * trusted (a broken chain), and then any amount is denied.
 */
export declare function decide(policy: LocalPolicy | null, req: GuardRequest, spent: {
    today: bigint;
    total: bigint;
} | null, nowS: number, problems?: string[]): GuardDecision;
/** What the guard did and did not see, stated inside every record. */
export interface AssuranceScope {
    mediated: string[];
    not_mediated: string[];
}
export interface GuardRecord {
    schema: typeof GUARD_RECORD_SCHEMA;
    seq: number;
    ts: string;
    origin: string;
    /**
     * decision: written BEFORE the action. outcome: written after `trustshell run` saw the command end.
     * policy-change: the policy in force changed (guard init/allow/deny/limit/expire/kill/sign, or an import
     * that enforced a carried policy), with the hash before and after. A rule change is never silent.
     */
    kind: 'decision' | 'outcome' | 'policy-change';
    requested: GuardRequest & {
        action: string;
    };
    authorized: GuardDecision & {
        policy_sha256: string | null;
        policy_nonce: string | null;
        policy_signed_by: string | null;
    };
    /** outcome only: what the started process reported. Never what it did. */
    executed: {
        exit_code: number | null;
        signal: string | null;
        duration_ms: number;
    } | 'not run' | null;
    assurance_scope: AssuranceScope;
    /** policy-change only: what changed it, and the policy hash before (null: there was none) and after. */
    change?: {
        via: string;
        before_sha256: string | null;
        after_sha256: string;
    };
    prev: string | null;
    hash: string;
}
export declare function recordHash(r: Omit<GuardRecord, 'hash'>): string;
export interface LedgerReading {
    verdict: 'INTACT' | 'BROKEN' | 'EMPTY';
    count: number;
    /** Amounts this ledger ALLOWED: in total, and on `day` (UTC, YYYY-MM-DD). null when BROKEN. */
    spent: {
        today: bigint;
        total: bigint;
    } | null;
    last: {
        seq: number;
        hash: string;
    } | null;
    breaks: string[];
}
/**
 * PURE. Check every hash and every link, and total the allowed amounts. `from` is the reading of an
 * already-verified prefix: the chain continues from its last hash.
 */
export declare function readLedger(text: string, nowS?: number, from?: LedgerReading): LedgerReading;
/**
 * The bytes of the ledger already verified, by length and sha256. A CACHE, not a source: it holds no total,
 * so it cannot lie about one. A decision re-hashes those bytes and fully verifies only the lines after them;
 * any change to the old bytes misses the cache and the whole ledger is verified again. Measured 2026-10-21
 * (lane B report, same-process A/B, 3 runs): at 10,000 records a full verification cost 541-593 ms per
 * decision, a checkpointed decision 236-284 ms; equal at 1,000. `guard show` always verifies every line.
 */
export declare const GUARD_CHECKPOINT_FILE = "guard-receipts.checkpoint.json";
export declare function readLedgerCheckpointed(text: string, checkpointText: string | null, nowS?: number): LedgerReading;
/** The filesystem calls the guard needs. Injectable so the logic is testable without a disk. */
export interface GuardFs {
    exists(p: string): boolean;
    read(p: string): string;
    append(p: string, data: string): void;
    write(p: string, data: string): void;
    mkdirp(p: string): void;
    /** Take the ledger lock in `dir`; returns the release. Throws NOT_CHECKED if it cannot be had. */
    lock(dir: string): () => void;
}
export declare const GUARD_LOCK_FILE = "guard-receipts.lock";
export declare const nodeGuardFs: () => GuardFs;
export type LoadedPolicy = {
    state: 'absent';
    path: string;
} | {
    state: 'invalid';
    path: string;
    problems: string[];
} | {
    state: 'ok';
    path: string;
    doc: PolicyDocument;
    sha256: string;
    defaulted: string[];
};
export declare function loadPolicy(dir: string, fs?: GuardFs): LoadedPolicy;
export interface GuardContext {
    fs?: GuardFs;
    origin?: string;
    nowS?: number;
    ts?: string;
    /** A reason the caller knows and the policy cannot express (init --pai's child process): denied too. */
    extraReasons?: string[];
}
/** Append one record to the ledger in `dir`, chained to the last one, and move the checkpoint. Takes the lock. */
export declare function appendRecord(dir: string, fields: Omit<GuardRecord, 'schema' | 'seq' | 'ts' | 'origin' | 'prev' | 'hash'>, ctx?: GuardContext): GuardRecord;
/**
 * Decide ONE request against the policy in `dir` and record the decision BEFORE the caller acts. No policy file:
 * null (nothing decided, nothing written). The caller then runs the action only on ALLOWED.
 * Reading the ledger, deciding and appending happen under ONE lock, so a concurrent writer can neither fork the
 * chain nor spend the same allowance twice.
 * ponytail: reads and hashes the whole ledger file per decision (see GUARD_CHECKPOINT_FILE for the measured cost).
 */
export declare function guardDecide(dir: string, req: GuardRequest, scope: AssuranceScope, ctx?: GuardContext): {
    decision: GuardDecision;
    record: GuardRecord;
    loaded: Exclude<LoadedPolicy, {
        state: 'absent';
    }>;
} | null;
/** The sentences `guard show` will not let a reader forget. */
export declare const GUARD_DOES_NOT_COVER: readonly ["It covers the trustshell CLI and `trustshell run`. The MCP server (trustshell-mcp) does not read this policy yet.", "It stops a mistaken command, not an agent that can run the CLI itself: `guard allow` changes the policy (every change is recorded, with the hash before and after).", "It is not a sandbox. Anything running as you can edit the policy, delete records, or act without trustshell.", "It decides before an action starts. What a started command does (files, network, child processes) is not observed.", "A missing record never proves no action happened: the guard sees only what goes through it.", "The record chain is unkeyed: it catches an edited or deleted line, not a ledger rewritten from scratch. Decisions trust a checkpoint of the bytes already verified; guard show re-verifies every line.", "Amounts are counted from the decisions THIS ledger allowed. A spend made without asking the guard is not counted."];
/**
 * The loud line for a TRUSTSHELL_HOME that hides a policy: set to a folder with no policy while the default
 * `~/.trustshell/policy.json` exists, it switches the guard off for that command (Lane D, 2026-10-21). null when
 * nothing is hidden.
 */
export declare function homeShadowWarning(env?: NodeJS.ProcessEnv, home?: string): string | null;
