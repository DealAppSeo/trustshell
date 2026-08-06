#!/usr/bin/env node
import { TrustShell, type VerifyOutputResult, type ProofPresentation } from '../lib/trustshell';
/** Exit codes — a small, stable contract so CI scripts can branch on them. */
export declare const EXIT: {
    /** HAL PASS (or soft FLAG) — safe to proceed. */
    readonly OK: 0;
    /** HAL VETO — the gate fails the build. */
    readonly VETO: 1;
    /** Usage / argument error. */
    readonly USAGE: 2;
    /** Runtime error (network / backend / timeout). */
    readonly RUNTIME: 3;
};
export type Command = 'verify' | 'repid' | 'proof' | 'help' | 'version';
/** Result of parsing argv (everything after `node cli.js`). Pure + testable. */
export interface ParsedArgs {
    command: Command;
    /** Positional operand: the text (verify) or the agent id/slug (repid/proof). */
    operand?: string;
    json: boolean;
    /** proof: verify the proof client-side. */
    verify: boolean;
    /** A usage error message; when set the caller should print help + exit USAGE. */
    error?: string;
}
export declare const VERSION: string;
/**
 * Parse CLI arguments into a {@link ParsedArgs}. PURE — no I/O, no network — so the
 * command routing + option handling can be unit-tested directly.
 *
 * `argv` is the slice AFTER the node binary + script path (i.e. `process.argv.slice(2)`).
 */
export declare function parseArgs(argv: string[]): ParsedArgs;
/**
 * Map a HAL verdict to a process exit code. PURE + testable.
 * VETO fails the build (exit 1); PASS and FLAG both succeed (exit 0) — a soft FLAG is
 * informational, not a gate failure, matching the SDK's `ok = verdict !== 'VETO'`.
 */
export declare function verdictExitCode(verdict: 'PASS' | 'FLAG' | 'VETO'): number;
/** Human-readable one-line verdict banner (no color deps — plain, CI-log-safe). */
export declare function formatVerdictLine(r: Pick<VerifyOutputResult, 'verdict' | 'trustScore'>): string;
/** Format a full verify result for human terminal output. */
export declare function formatVerify(r: VerifyOutputResult): string;
/** Format a RepID result for human terminal output. */
export declare function formatRepid(agentId: string, repid: number, tier: string): string;
/** Format a proof presentation for human terminal output. */
export declare function formatProof(p: ProofPresentation): string;
/** Build the SDK client from env (apiKey + apiUrl are both optional). */
export declare function makeClient(): TrustShell;
/** IO surface, injectable so run() is testable without touching the real process. */
export interface CliIO {
    out: (s: string) => void;
    err: (s: string) => void;
}
/**
 * Execute a parsed command against a client and return the process exit code.
 * The client is injected so tests can pass a mock (no live network).
 */
export declare function run(args: ParsedArgs, client: TrustShell, io?: CliIO): Promise<number>;
/** Entry point: parse argv, run, exit with the returned code. */
export declare function main(argv?: string[]): Promise<void>;
