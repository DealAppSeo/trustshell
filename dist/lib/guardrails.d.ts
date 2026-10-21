export declare const GUARDRAILS_VERSION = 1;
export declare const GUARDRAILS_FILE = "guardrails.json";
export declare const GUARD_RECEIPTS_FILE = "guard-receipts.jsonl";
export declare const GUARD_RECEIPT_SCHEMA = "trustshell.guard-receipt/1";
export interface Guardrails {
    trustshell_guardrails: number;
    egress: {
        allow: string[];
    };
    tools: {
        allow: string[];
    };
    limits: {
        unit: string;
        spend_per_action: string;
        spend_total: string;
    };
}
/** The commands that only read or write local files. The default file allows these and nothing else. */
export declare const LOCAL_TOOLS: readonly ["bundle", "ground", "init", "inspect", "learn", "profile", "quarantine", "recall", "redact", "remember", "report", "traps"];
export declare const DEFAULT_UNIT = "USDC smallest unit (6 decimals)";
export declare function defaultGuardrails(): Guardrails;
/** The folder that holds guardrails, their receipts and the bundle signing key. */
export declare function trustshellHome(env?: NodeJS.ProcessEnv, home?: string): string;
export declare function renderGuardrails(g: Guardrails): string;
/**
 * PURE. Parse the file. Any problem resolves to `guardrails: null`, which refuses every action:
 * never a partial rule set, because a half-read file is not what the person wrote.
 */
export declare function parseGuardrails(text: string): {
    guardrails: Guardrails | null;
    problems: string[];
};
/** What one action asks for. `spend` is a whole number of smallest units, as a string. */
export interface GuardAction {
    tool: string;
    hosts: string[];
    spend?: string;
}
export type GuardVerdict = 'ALLOWED' | 'REFUSED';
export interface GuardDecision {
    decision: GuardVerdict;
    /** Every rule the action broke, not just the first. Empty when allowed. */
    reasons: string[];
}
/**
 * PURE. Weigh one action against the rules. `g === null` is a file that did not parse: refused.
 * `spentSoFar` is the sum of spends this ledger already allowed; `null` means the ledger could not be
 * trusted (a broken chain), and then any spend is refused.
 */
export declare function decide(g: Guardrails | null, action: GuardAction, spentSoFar: bigint | null, problems?: string[]): GuardDecision;
export interface GuardReceipt {
    schema: typeof GUARD_RECEIPT_SCHEMA;
    seq: number;
    ts: string;
    origin: string;
    action: GuardAction;
    decision: GuardVerdict;
    reasons: string[];
    /** sha256 of the rules in force (RFC 8785 form); null when the file did not parse. */
    guardrails_sha256: string | null;
    prev: string | null;
    hash: string;
}
/** The hash a receipt must carry: sha256 of the RFC 8785 form of every field but `hash`. */
export declare function receiptHash(r: Omit<GuardReceipt, 'hash'>): string;
export interface LedgerReading {
    verdict: 'INTACT' | 'BROKEN' | 'EMPTY';
    count: number;
    /** Sum of the spends this ledger ALLOWED. null when BROKEN: a total read off an altered ledger is not a total. */
    spent: bigint | null;
    last: {
        seq: number;
        hash: string;
    } | null;
    breaks: string[];
}
/**
 * PURE. Read the receipt ledger: check every hash and every link, and total the allowed spends. `from` is
 * the reading of the lines BEFORE `text` (an already-verified prefix): the chain continues from its last hash.
 */
export declare function readLedger(text: string, from?: LedgerReading): LedgerReading;
/**
 * The bytes of the ledger already verified, by length and sha256. A CACHE, not a source: it holds no total,
 * so it cannot lie about one. A decision re-hashes those bytes (one sha256, fast) and fully verifies only the
 * lines after them; any change to the old bytes misses the cache and the whole ledger is verified again.
 * Measured 2026-10-21 (lane B report, same process A/B, 3 runs): at 10,000 receipts a full verification
 * cost 541-593 ms per decision, a checkpointed decision 236-284 ms.
 */
export declare const GUARD_CHECKPOINT_FILE = "guard-receipts.checkpoint.json";
/** The ledger reading, using the checkpoint when its bytes still match. Falls back to a full read on any doubt. */
export declare function readLedgerCheckpointed(text: string, checkpointText: string | null): LedgerReading;
/** PURE. The next receipt line after `ledger`. */
export declare function nextReceipt(ledger: LedgerReading, fields: {
    action: GuardAction;
    decision: GuardDecision;
    guardrails_sha256: string | null;
    origin?: string;
    ts?: string;
}): GuardReceipt;
/** sha256 of the rules (RFC 8785 form), the value a receipt binds to. */
export declare function guardrailsSha256(g: Guardrails): string;
/** The filesystem calls the guard needs. Injectable so the logic is testable without a disk. */
export interface GuardFs {
    exists(p: string): boolean;
    read(p: string): string;
    append(p: string, data: string): void;
    write(p: string, data: string): void;
    mkdirp(p: string): void;
}
export declare const nodeGuardFs: () => GuardFs;
export type LoadedGuardrails = {
    state: 'absent';
    path: string;
} | {
    state: 'invalid';
    path: string;
    problems: string[];
} | {
    state: 'ok';
    path: string;
    guardrails: Guardrails;
    sha256: string;
};
export declare function loadGuardrails(dir: string, fs?: GuardFs): LoadedGuardrails;
/**
 * Decide AND receipt one action against the file in `dir`, in that order, and return both. No file:
 * `null` (nothing is enforced, nothing is written). The receipt is appended before the caller acts on
 * an ALLOWED decision, so an action that then crashes is still on the ledger.
 * Only the lines after the checkpoint are re-verified (see GUARD_CHECKPOINT_FILE); a BROKEN ledger is never
 * checkpointed, so it stays BROKEN.
 * ponytail: still reads, parses and hashes the whole file per decision. Measured 2026-10-21 at 10,000
 * receipts: ~260 ms per decision against ~560 ms for re-verifying every line; equal at 1,000. O(1) needs the
 * checkpoint to carry the totals and a tail read by offset, which moves casual-edit detection from every
 * decision to `guard show` only. No lock either: two concurrent writers fork the chain, which then reads
 * BROKEN and refuses spends (fail closed).
 */
export declare function guardAction(dir: string, action: GuardAction, opts?: {
    fs?: GuardFs;
    origin?: string;
    ts?: string;
    extraReasons?: string[];
}): {
    decision: GuardDecision;
    receipt: GuardReceipt;
    loaded: Exclude<LoadedGuardrails, {
        state: 'absent';
    }>;
} | null;
/** The sentences `guard show` will not let a reader forget. */
export declare const GUARD_DOES_NOT_COVER: readonly ["It bounds what trustshell does. It is not a sandbox: anything running as you can edit this file, delete the receipts, or reach the network without trustshell.", "Egress is enforced on trustshell's own fetch calls. A child process (init --pai, a learn check command you registered) is not inside it: init --pai is refused while this file is in force; learn runs under tools.allow only.", "The receipt chain is unkeyed: it detects an edit or a deleted line that left the later hashes alone, not a ledger rewritten from scratch. Decisions trust a checkpoint of the bytes already verified; guard show re-verifies every line.", "Spend limits count the spends THIS ledger allowed (guard check --spend). A spend made without asking the guard is not counted."];
