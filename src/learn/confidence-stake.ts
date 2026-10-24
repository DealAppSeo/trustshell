/**
 * Confidence stake: how a sealed p_success WOULD scale a RepID change, under two rules side by side.
 * SHADOW ONLY: pure functions, no I/O. Nothing here reads or writes RepID, a reputation, a score or
 * a database. The multipliers are numbers in a report. Choosing a rule or a weight is MAJOR
 * (CLAUDE_RULES r31): Sean's call, made on measured data.
 * ------------------------------------------------------------------
 * THE TWO RULES. p is the agent's sealed p_success (precommit.ts), and "right" means the graded
 * outcome's `execution` was SUCCEEDED.
 *   (a) bucket: a claim at or above `threshold` pays `right` if right and `wrong` if wrong; any
 *       other claim pays 1. Sean's proposal, 2026-10-22: 3x and 0.333x.
 *   (b) proper: M = (2 * p_outcome)^b, where p_outcome = p if right and 1 - p if wrong. A claim of
 *       0.5 pays 1 either way. b = ln3 / ln1.9 makes 0.95-and-right pay 3x, the bucket rule's top,
 *       and 0.95-and-wrong pay 0.019x.
 * Either is applied per task as RepID *= M^w, w being the task's weight.
 *
 * WHY (a) REWARDS BLUFFING. An agent whose RepID compounds maximises the expected LOG multiplier.
 * Claiming "very high" under (a) is worth (2q - 1) ln 3 per task to an agent that is right with
 * probability q, which is positive for every q above one half. So any agent between 50% and the
 * threshold gains by claiming very high. Under (b) the expected log is maximised by claiming q
 * itself, because the log score is strictly proper. honestyCheck finds the band for any rule, and
 * tests/confidence-stake.test.ts pins it for both. w drops out: ln(M^w) = w ln M, so the weight
 * scales the stake and never moves the best claim.
 *
 * WHAT IS NEVER STAKED. An UNKNOWN or ungraded outcome (censored, as in precommit.ts brierScore: a
 * stake on it would be a 1x, which is a grade nobody gave). A record with no p_success. And p_truth,
 * always: it forecasts whether a claim is true, not whether the action succeeds.
 */
import type { LedgerEntry } from './precommit';

export interface BucketRule {
  kind: 'bucket';
  /** A claim at or above this is "very high certainty". */
  threshold: number;
  right: number;
  wrong: number;
}

export interface ProperRule {
  kind: 'proper';
  b: number;
}

export type StakeRule = BucketRule | ProperRule;

/** Sean's proposal: 3x right, 0.333x (one third) wrong, for a claim of 0.9 or more. */
export const BUCKET_RULE: BucketRule = { kind: 'bucket', threshold: 0.9, right: 3, wrong: 1 / 3 };

/** ln3 / ln1.9 = 1.7116: 0.95-and-right pays exactly 3x. */
export const PROPER_B = Math.log(3) / Math.log(1.9);
export const PROPER_RULE: ProperRule = { kind: 'proper', b: PROPER_B };

/** The weight in RepID *= M^w used in the design notes. An example, not a decision. */
export const DEFAULT_WEIGHT = 0.05;

/** M for one resolved claim: p is the staked P(success), `right` whether the action succeeded. */
export function multiplier(rule: StakeRule, p: number, right: boolean): number {
  if (!(p >= 0 && p <= 1)) throw new RangeError(`p must be a probability from 0 to 1 (got ${p})`);
  if (rule.kind === 'bucket') return p >= rule.threshold ? (right ? rule.right : rule.wrong) : 1;
  return (2 * (right ? p : 1 - p)) ** rule.b;
}

/**
 * The would-be RepID factor M^w for one ledger entry, on its sealed p_success, judged by the
 * outcome's `execution`. null means NOT staked: no p_success, no outcome, or UNKNOWN. The caller
 * verifies the entry first (teachBackReport does, with precommit.ts verifyOutcome).
 */
export function stakeOf(entry: LedgerEntry, rule: StakeRule, w = DEFAULT_WEIGHT): number | null {
  if (!(w >= 0 && Number.isFinite(w))) throw new RangeError(`w must be a finite weight, 0 or more (got ${w})`);
  const p = entry.pre.p_success;
  const execution = entry.outcome?.execution;
  if (p === null || execution === undefined || execution === 'UNKNOWN') return null;
  return multiplier(rule, p, execution === 'SUCCEEDED') ** w;
}

/** A term with zero probability contributes nothing, even when its multiplier is 0 (log -Infinity). */
const weighted = (prob: number, m: number) => (prob === 0 ? 0 : prob * Math.log(m));

/** E[ln M] for an agent that claims `claim` and is right with probability `accuracy`. */
export function expectedLog(rule: StakeRule, claim: number, accuracy: number): number {
  return weighted(accuracy, multiplier(rule, claim, true)) + weighted(1 - accuracy, multiplier(rule, claim, false));
}

/** E[M], the arithmetic expectation. Not what a compounding agent maximises; shown for the design notes' 25% figure. */
export function expectedMultiplier(rule: StakeRule, claim: number, accuracy: number): number {
  return accuracy * multiplier(rule, claim, true) + (1 - accuracy) * multiplier(rule, claim, false);
}

export interface HonestyRow {
  accuracy: number;
  /** The lowest and highest claims that maximise E[ln M] (a flat rule has a range of them). */
  best_low: number;
  best_high: number;
  /** E[ln M] at the best claim minus E[ln M] at the truth: what lying gains per unit of w. 0 = honest. */
  gain_over_truth: number;
}

export interface HonestyReport {
  objective: 'expected log multiplier';
  rows: HonestyRow[];
  /** Accuracies at which claiming the truth is NOT among the best claims. Empty for an honest rule. */
  not_truth: number[];
}

const TIE = 1e-12;

/**
 * For true accuracies 0.05..0.95, the claims from 0.01..0.99 that maximise E[ln M]. Both grids are
 * hundredths, so "the best claim is the truth" is an exact comparison, not a rounding question.
 */
export function honestyCheck(rule: StakeRule): HonestyReport {
  const rows: HonestyRow[] = [];
  for (let a = 5; a <= 95; a += 5) {
    const values = Array.from({ length: 99 }, (_, i) => expectedLog(rule, (i + 1) / 100, a / 100));
    const best = Math.max(...values);
    const argmax = values.flatMap((v, i) => (best - v <= TIE ? [(i + 1) / 100] : []));
    rows.push({ accuracy: a / 100, best_low: argmax[0], best_high: argmax[argmax.length - 1], gain_over_truth: best - values[a - 1] });
  }
  return { objective: 'expected log multiplier', rows, not_truth: rows.filter((r) => r.gain_over_truth > TIE).map((r) => r.accuracy) };
}
