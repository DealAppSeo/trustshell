/**
 * Confidence stake (src/learn/confidence-stake.ts), SHADOW ONLY: two rules for how a sealed
 * p_success would scale a RepID change, and the honesty check that tells them apart. Pure functions;
 * every number pinned here is derived in the module header and docs/teach-back.md.
 */
import {
  BUCKET_RULE,
  PROPER_B,
  PROPER_RULE,
  expectedLog,
  expectedMultiplier,
  honestyCheck,
  multiplier,
  stakeOf,
} from '../src/learn/confidence-stake';
import { gradeOutcome, sealPreAction, type LedgerEntry, type PreActionInput } from '../src/learn/precommit';

const T0 = new Date('2026-10-22T10:00:00.000Z');
const AGENT = { provider: 'anthropic', model: 'claude-opus-5-5', version: '2026-10' };

function entry(execution: 'SUCCEEDED' | 'FAILED' | 'UNKNOWN' | null, over: Partial<PreActionInput> = {}): LedgerEntry {
  const pre = sealPreAction(
    {
      task_id: 'task-1',
      proposition: { text: 'the tests pass on abc123', direction: 'TRUE' },
      success_criterion: 'the deploy job exits 0',
      p_truth: 0.6,
      p_success: 0.95,
      expected_cost: null,
      confidence_method: 'self_reported',
      agent: AGENT,
      ...over,
    },
    { now: T0, nonce: '0'.repeat(32) },
  );
  if (execution === null) return { pre, outcome: null };
  const outcome = gradeOutcome(
    pre,
    {
      action_started_at: new Date(T0.getTime() + 5000).toISOString(),
      grader: { kind: 'platform_record', id: 'trustshell-check', method: 'gha.run_succeeded' },
      result: 'UNKNOWN',
      execution,
      evidence: { schema: 'dev.trustshell.action-evidence', digest: 'a'.repeat(64), ref: null },
    },
    { now: new Date(T0.getTime() + 6000) },
  );
  return { pre, outcome };
}

describe('rule (a), the bucket rule: 3x / 0.333x at or above the threshold', () => {
  it('pays 3x right and a third wrong at or above 0.9, and 1x below it', () => {
    expect(multiplier(BUCKET_RULE, 0.9, true)).toBe(3);
    expect(multiplier(BUCKET_RULE, 0.95, false)).toBeCloseTo(1 / 3, 12);
    expect(multiplier(BUCKET_RULE, 0.89, true)).toBe(1);
    expect(multiplier(BUCKET_RULE, 0.89, false)).toBe(1);
  });

  it('the threshold and both multipliers are parameters', () => {
    const rule = { kind: 'bucket' as const, threshold: 0.8, right: 2, wrong: 0.5 };
    expect(multiplier(rule, 0.8, true)).toBe(2);
    expect(multiplier(rule, 0.8, false)).toBe(0.5);
    expect(multiplier(rule, 0.79, false)).toBe(1);
  });

  it('the design notes: a 30% agent expects 1.13x by claiming "very high", break-even 25%', () => {
    expect(expectedMultiplier(BUCKET_RULE, 0.9, 0.3)).toBeCloseTo(1.1333, 4);
    expect(expectedMultiplier(BUCKET_RULE, 0.9, 0.25)).toBeCloseTo(1, 12);
    // Compounding: the expected log of claiming high is (2q - 1) ln 3, positive above one half.
    expect(expectedLog(BUCKET_RULE, 0.9, 0.7)).toBeCloseTo(0.4 * Math.log(3), 12);
  });
});

describe('rule (b), the proper rule: M = (2 * p_outcome)^b', () => {
  it('b = ln3 / ln1.9 = 1.7116: 0.95 right pays 3x, 0.95 wrong pays 0.019x, 0.5 pays 1x either way', () => {
    expect(PROPER_B).toBeCloseTo(1.7116, 4);
    expect(multiplier(PROPER_RULE, 0.95, true)).toBeCloseTo(3, 12);
    expect(multiplier(PROPER_RULE, 0.95, false)).toBeCloseTo(0.019426, 6);
    expect(multiplier(PROPER_RULE, 0.5, true)).toBe(1);
    expect(multiplier(PROPER_RULE, 0.5, false)).toBe(1);
  });

  it('applied as RepID *= M^w, one confident miss undoes about 3.6 confident hits', () => {
    const w = 0.05;
    const hit = multiplier(PROPER_RULE, 0.95, true) ** w;
    const miss = multiplier(PROPER_RULE, 0.95, false) ** w;
    expect(-Math.log(miss) / Math.log(hit)).toBeCloseTo(3.587, 3);
    expect(hit ** 3 * miss).toBeLessThan(1);
    expect(hit ** 4 * miss).toBeGreaterThan(1);
  });

  it('b is a parameter', () => {
    expect(multiplier({ kind: 'proper', b: 1 }, 0.95, true)).toBeCloseTo(1.9, 12);
  });

  it('refuses a probability outside 0..1', () => {
    expect(() => multiplier(PROPER_RULE, 1.2, true)).toThrow(RangeError);
    expect(() => multiplier(BUCKET_RULE, Number.NaN, true)).toThrow(RangeError);
  });
});

describe('what is staked: p_success, on a resolved execution, and nothing else', () => {
  it('stakes p_success against execution, as M^w', () => {
    expect(stakeOf(entry('SUCCEEDED'), PROPER_RULE, 0.05)).toBeCloseTo(3 ** 0.05, 12);
    expect(stakeOf(entry('FAILED'), BUCKET_RULE, 1)).toBeCloseTo(1 / 3, 12);
  });

  it('UNKNOWN is never staked: not a 1x, no stake at all', () => {
    expect(stakeOf(entry('UNKNOWN'), PROPER_RULE)).toBeNull();
    expect(stakeOf(entry('UNKNOWN'), BUCKET_RULE)).toBeNull();
  });

  it('an ungraded forecast, or one with no p_success, is not staked', () => {
    expect(stakeOf(entry(null), PROPER_RULE)).toBeNull();
    const truthOnly = entry(null, { success_criterion: null, p_success: null });
    expect(stakeOf(truthOnly, PROPER_RULE)).toBeNull();
  });

  it('p_truth is never read: changing it changes no stake', () => {
    const a = stakeOf(entry('SUCCEEDED', { p_truth: 0.6 }), PROPER_RULE);
    const b = stakeOf(entry('SUCCEEDED', { p_truth: 0.99 }), PROPER_RULE);
    expect(a).toBe(b);
  });
});

describe('honestyCheck: the claim that maximises expected log multiplier, at accuracies 0.05..0.95', () => {
  it('rule (a) has a bluffing band: from 0.55 to 0.85 the best claim is "very high", not the truth', () => {
    const h = honestyCheck(BUCKET_RULE);
    expect(h.not_truth).toEqual([0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85]);
    const at70 = h.rows.find((r) => r.accuracy === 0.7)!;
    expect([at70.best_low, at70.best_high]).toEqual([0.9, 0.99]);
    expect(at70.gain_over_truth).toBeCloseTo(0.4394, 4);
    // Below one half the rule is flat: the truth is among the best claims, and so is nearly every other.
    const at30 = h.rows.find((r) => r.accuracy === 0.3)!;
    expect([at30.best_low, at30.best_high, at30.gain_over_truth]).toEqual([0.01, 0.89, 0]);
  });

  it('the band moves with the threshold: at 0.95 it reaches 0.9', () => {
    expect(honestyCheck({ ...BUCKET_RULE, threshold: 0.95 }).not_truth).toEqual([0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9]);
  });

  it('rule (b) has none: at every accuracy the one best claim is the accuracy itself', () => {
    const h = honestyCheck(PROPER_RULE);
    expect(h.not_truth).toEqual([]);
    expect(h.rows).toHaveLength(19);
    for (const r of h.rows) expect([r.best_low, r.best_high]).toEqual([r.accuracy, r.accuracy]);
  });

  it('rule (b) is honest only for a compounding stake: its arithmetic mean still pays an overclaim', () => {
    // Why the check maximises the expected LOG: RepID *= M^w compounds. Added instead, this rule would not be proper.
    expect(expectedMultiplier(PROPER_RULE, 0.95, 0.6)).toBeGreaterThan(expectedMultiplier(PROPER_RULE, 0.6, 0.6));
    expect(expectedLog(PROPER_RULE, 0.95, 0.6)).toBeLessThan(expectedLog(PROPER_RULE, 0.6, 0.6));
  });
});
