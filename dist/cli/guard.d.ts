/**
 * `trustshell guard`, `trustshell run`, and the gate in front of every other command.
 * ----------------------------------------------------------------------------------
 * EGRESS: none. Reads `~/.trustshell/policy.json` (or TRUSTSHELL_HOME) and appends one record per decision to
 * `guard-receipts.jsonl` beside it.
 *
 * `trustshell run --tool <name> [--class read|other|post|spend] [--amount <n>] -- <command> [args...]` is the
 * enforced path: the decision is recorded BEFORE the command starts, a denied command never starts, and an
 * allowed one is started by this process, which then records its exit code. That is all it sees.
 *
 * The gate: while a policy file exists, every other trustshell command must be listed as `tool:<command>` (or
 * `tool`) before it runs. `help`, `version`, `guard` and `run` always run: the person can always read and
 * change the rules, and `run` makes its own decision.
 */
import type { ParsedArgs } from './index';
import { type AssuranceScope, type GuardRecord, type GuardRequest, type PolicyDocument } from '../lib/guardrails';
type IO = {
    out: (s: string) => void;
    err: (s: string) => void;
};
/** Exit code for an action the policy denied. Never 0, and distinct from a VETO (1). */
export declare const EXIT_REFUSED = 5;
export declare const NEVER_GUARDED: Set<string>;
/** The scope a CLI-gate record states. */
export declare const CLI_SCOPE: AssuranceScope;
export declare const RUN_SCOPE: AssuranceScope;
export declare const POLICY_SCOPE: AssuranceScope;
/** Record that the policy in force changed. A rule change is never silent (Lane D, 2026-10-21). */
export declare function recordPolicyChange(dir: string, via: string, before: string | null, after: PolicyDocument): GuardRecord;
export declare const CHECK_SCOPE: AssuranceScope;
/** PURE. What a parsed command is, as the gate weighs it, and any reason it must be denied whatever the policy says. */
export declare function plannedAction(args: ParsedArgs): {
    req: GuardRequest;
    refuse?: string;
};
/** Run `inner` under the policy, if there is one. No policy file: `inner` runs exactly as before. */
export declare function runGuarded(args: ParsedArgs, inner: () => Promise<number>, io: IO, env?: NodeJS.ProcessEnv): Promise<number>;
/** The card `trustshell run` prints: the five things a reader must keep apart. */
export declare function formatRunCard(decision: GuardRecord, outcome: GuardRecord | null): string;
export interface Spawner {
    (cmd: string, args: string[]): {
        status: number | null;
        signal: string | null;
    };
}
export declare const RUN_USAGE = "trustshell run --tool <name> [--class read|other|post|spend] [--amount <n>] [--json] -- <command> [args...]";
/** `trustshell run`. The command's own output goes to the terminal; the card goes to stderr (or --json to stdout). */
export declare function runRun(argv: string[], io: IO, env?: NodeJS.ProcessEnv, spawn?: Spawner): number;
export declare const GUARD_USAGE = "trustshell guard init [--force] [--days N]\ntrustshell guard show [--json]\ntrustshell guard check --tool <name> [--class read|other|post|spend] [--amount <n>] [--json]\ntrustshell guard allow <action> \u00B7 guard deny <action>      (spend | post | tool | tool:<name>)\ntrustshell guard limit per-tx|daily|total <n> \u00B7 guard expire <days> \u00B7 guard kill \u00B7 guard sign";
export declare function runGuard(argv: string[], io: IO, env?: NodeJS.ProcessEnv): number;
export {};
