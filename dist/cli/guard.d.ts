/**
 * `trustshell guard` and the gate in front of every other command.
 * ----------------------------------------------------------------
 * EGRESS: none. The gate reads `~/.trustshell/guardrails.json` (or TRUSTSHELL_HOME) and appends one
 * receipt per decision to `guard-receipts.jsonl` beside it. No file: the gate does nothing at all.
 *
 * TWO LAYERS. (1) Before a command runs, the hosts it is known to dial are weighed with its name
 * against the file; a refusal stops it before any work, with a receipt. (2) While an allowed command
 * runs, the process `fetch` refuses any host the file does not allow, with a receipt, so a host this
 * table does not know about is refused too. Every network call in src/ goes through `fetch`.
 */
import type { ParsedArgs } from './index';
import { type GuardAction } from '../lib/guardrails';
type IO = {
    out: (s: string) => void;
    err: (s: string) => void;
};
/** Exit code for an action the guardrails file refused. Never 0, and distinct from a VETO (1). */
export declare const EXIT_REFUSED = 5;
/** Commands the gate never stops: the person can always read and change the rules. */
export declare const NEVER_GUARDED: Set<string>;
/** The backend host a command will dial: TRUSTSHELL_API_URL or the default. An unparseable value is kept as is, so it can never match a rule. */
export declare function backendHost(env: NodeJS.ProcessEnv): string;
/**
 * PURE. What a parsed command will do, as the guard weighs it: its name, the hosts it dials, and any
 * reason it must be refused whatever the file says. Mirrors HELP's NETWORK EGRESS table.
 */
export declare function plannedAction(args: ParsedArgs, env: NodeJS.ProcessEnv): {
    action: GuardAction;
    refuse?: string;
};
export declare class GuardRefusedError extends Error {
    readonly host: string;
    constructor(host: string);
}
/** A `fetch` that refuses any host not in `allow`, calling `onRefuse` first. Everything else passes through untouched. */
export declare function guardedFetch(inner: typeof fetch, allow: readonly string[], onRefuse: (host: string) => void): typeof fetch;
/**
 * Run `inner` (the command) under the guardrails file, if there is one. No file: `inner` runs exactly
 * as before. A refusal returns {@link EXIT_REFUSED} and never calls `inner`.
 */
export declare function runGuarded(args: ParsedArgs, inner: () => Promise<number>, io: IO, env?: NodeJS.ProcessEnv): Promise<number>;
export declare const GUARD_USAGE = "trustshell guard init [--force]\ntrustshell guard show [--json]\ntrustshell guard check --tool <name> [--host <host>]... [--spend <amount>] [--json]\ntrustshell guard allow host|tool <value>\ntrustshell guard deny host|tool <value>\ntrustshell guard limit per-action|total <amount>";
export declare function runGuard(argv: string[], io: IO, env?: NodeJS.ProcessEnv): number;
export {};
