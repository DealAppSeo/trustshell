import type { AgentTurnOrigin } from './origin';
/** What a spend records before it runs. Origin, amount, cap, agentId — the audit-before-act row. */
export interface SpendIntent {
    origin: AgentTurnOrigin;
    amount: number | string;
    cap: number | string;
    agentId: string;
}
/** A policy that admits (or refuses) a spend. Its ABSENCE is a refusal, never a default-allow. */
export interface SpendPolicy {
    allow: boolean;
    reason?: string;
}
export interface AuditOpts {
    /** Override the `.trustshell` dir (tests). */
    dir?: string;
    /** Fixed timestamp (tests). */
    now?: string;
    /** Redirect the row instead of writing to disk (tests). */
    stream?: {
        write(s: string): unknown;
    };
}
/**
 * Audit before act. Record the intent row FIRST (so the attempt is on the device log whether or not
 * it proceeds), THEN require a policy, THEN run `act`. A missing (`undefined`/`null`) policy throws
 * `policy_required` before `act` is ever called — a spend with no policy behind it does not run.
 * `{ allow: false }` throws `policy_denied`. Same fail-closed posture as the cap and the origin.
 *
 * Wrap `buildX402Payment` / `executeA2A` with this at the spend boundary.
 */
export declare function auditThenAct<T>(intent: SpendIntent, policy: SpendPolicy | null | undefined, act: () => Promise<T>, opts?: AuditOpts): Promise<T>;
