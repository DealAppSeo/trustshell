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
/** PURE. Read the receipt ledger: check every hash and every link, and total the allowed spends. */
export declare function readLedger(text: string): LedgerReading;
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
 * ponytail: reads the whole ledger per decision and takes no lock; two concurrent writers fork the
 * chain, which then reads BROKEN and refuses spends (fail closed). Tail-read + a lock file if either bites.
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
export declare const GUARD_DOES_NOT_COVER: readonly ["It bounds what trustshell does. It is not a sandbox: anything running as you can edit this file, delete the receipts, or reach the network without trustshell.", "Egress is enforced on trustshell's own fetch calls. A child process (init --pai, a learn check command you registered) is not inside it: init --pai is refused while this file is in force; learn runs under tools.allow only.", "The receipt chain is unkeyed: it detects an edit or a deleted line that left the later hashes alone, not a ledger rewritten from scratch.", "Spend limits count the spends THIS ledger allowed (guard check --spend). A spend made without asking the guard is not counted."];
