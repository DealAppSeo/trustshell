/**
 * wrapExecute — put HAL between an agent's work and the caller who trusts it.
 *
 * Wraps any async function. The function runs, its output is scored by HAL, and the
 * result carries the verdict alongside the output. By default NOTHING is ever withheld:
 * this is telemetry until someone deliberately turns it into a control.
 *
 * WHY RECORD-BY-DEFAULT IS THE SHIPPING DEFAULT, not timidity:
 * HAL's measured accuracy on external, non-circular ground truth is 82.6% (95/115
 * TruthEval cases, measured 2026-08-31), and just 9.1% (1/11) on the uncertain class —
 * it almost never emits FLAG, collapsing uncertainty into clean-or-vetoed. On the same
 * day a live probe watched it VETO the true statement "Paris is the capital of France"
 * (hal_score 0.535). A detector that wrong, blocking by default, would refuse real work
 * and the product would be blamed for the refusal. So blocking is opt-in, per call, at a
 * threshold the caller names.
 *
 * WHAT THIS CANNOT DO — read before you rely on it:
 * The wrapped function has ALREADY RUN by the time HAL sees anything. There is no way to
 * score an output that does not exist yet. So `blocked: true` means the OUTPUT IS
 * WITHHELD FROM THE CALLER — it does not mean the action was prevented. If `fn` sent an
 * email, moved money, or wrote to a database, that happened. Wrap the decision, not the
 * side effect: score the draft, then send it yourself if the verdict allows.
 * Calling this a safety control over side-effecting work would be a claim the code
 * cannot support.
 *
 * THREE OUTCOMES, NEVER TWO. `checked: false` means HAL could not be consulted. That is
 * NOT a pass. It is reported as its own state and, in blocking mode, resolved by an
 * explicit `onUnavailable` choice rather than a silent default — the recurring defect in
 * this ecosystem is a system reporting success it has not earned.
 */
import type { ScoreOptions, ScoreResult } from './trustshell';
/** HAL's verdicts, ordered by severity. Index is the comparison. */
export declare const HAL_VERDICT_ORDER: readonly ["PASS", "FLAG", "VETO"];
export type HalVerdict = (typeof HAL_VERDICT_ORDER)[number];
/** What the wrapper decided to do about the output. */
export type WrapDisposition = 'released' | 'withheld';
export interface WrapExecuteOptions extends ScoreOptions {
    /**
     * Withhold the output when HAL's verdict is at least this severe.
     *
     * Omitted or null → RECORD ONLY. Nothing is ever withheld, whatever HAL says. This is
     * the default and the shipping configuration.
     *
     * 'VETO' → withhold only outright vetoes.
     * 'FLAG' → withhold flags and vetoes. Given the 9.1% flag-class accuracy above, treat
     *          this as experimental rather than protective.
     */
    blockAtOrAbove?: HalVerdict | null;
    /**
     * What to do when HAL cannot be reached (network failure, provider outage, timeout)
     * AND blocking is enabled. Ignored in record-only mode, where nothing is withheld.
     *
     * 'release' (default) — hand the output over, with checked:false recorded loudly.
     *   Matches record-by-default: an outage should not become an outage of the product.
     * 'withhold' — fail closed. Correct for genuinely high-stakes callers, and note that
     *   with 3 of ~6 HAL providers currently down this will withhold more than you expect.
     *
     * There is deliberately no "guess" option. An unreachable detector is not a verdict.
     */
    onUnavailable?: 'release' | 'withhold';
    /**
     * Called once per invocation with the record, whether or not anything was withheld.
     * Throwing from here is swallowed: telemetry must never break the caller's work.
     */
    onRecord?: (record: WrapExecuteRecord) => void;
}
/** The audit line for one wrapped call. Safe to persist. */
export interface WrapExecuteRecord {
    verdict: HalVerdict | 'UNKNOWN';
    /** false when HAL could not be consulted. NOT a pass. */
    checked: boolean;
    disposition: WrapDisposition;
    /** Raw 0-1 HAL score; null when unchecked. */
    halScore: number | null;
    /** 0-100, inverted from risk; null when unchecked. */
    trustScore: number | null;
    decisionReason: string;
    /** Per-provider evidence, "provider:VERDICT (note)" — the WHY, not just the what. */
    evidence: string[];
    /** Milliseconds spent in HAL, so the cost of the check is visible. */
    halLatencyMs: number;
    /** Present only when checked was false. */
    error?: string;
    /** The threshold in force for this call; null in record-only mode. */
    blockAtOrAbove: HalVerdict | null;
}
export interface WrapExecuteResult<T> extends WrapExecuteRecord {
    /**
     * The wrapped function's output, or undefined when withheld.
     *
     * `blocked` is the field to branch on. Do not infer suppression from `output ===
     * undefined`: a function that legitimately returns undefined would be indistinguishable
     * from one that was withheld.
     */
    output: T | undefined;
    blocked: boolean;
}
/** Is `verdict` at least as severe as `threshold`? */
export declare function meetsThreshold(verdict: HalVerdict, threshold: HalVerdict): boolean;
/** Minimal shape wrapExecute needs — anything with a HAL `score`, so this is testable. */
export interface HalScorer {
    score(response: string, options?: ScoreOptions): Promise<ScoreResult>;
}
/**
 * Run `fn`, score its output with HAL, and return both.
 *
 * @example Record only — the default. Nothing is ever withheld.
 *   const r = await wrapExecute(shell, () => agent.answer(q), { prompt: q });
 *   if (r.verdict === 'VETO') console.warn(r.decisionReason);
 *   use(r.output);
 *
 * @example Opt in to blocking on outright vetoes.
 *   const r = await wrapExecute(shell, () => agent.answer(q), {
 *     prompt: q, blockAtOrAbove: 'VETO',
 *   });
 *   if (r.blocked) return fallback(r.decisionReason);
 */
export declare function wrapExecute<T>(shell: HalScorer, fn: () => Promise<T> | T, options?: WrapExecuteOptions): Promise<WrapExecuteResult<T>>;
