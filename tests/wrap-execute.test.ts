/**
 * wrapExecute tests.
 *
 * These deliberately concentrate on the ways the wrapper could LIE, because that is the
 * failure this ecosystem keeps paying for: a system reporting success it has not earned.
 * The happy path is one test; the rest are the honesty properties.
 */

import { wrapExecute, meetsThreshold, HAL_VERDICT_ORDER } from '../src/lib/wrap-execute';
import type { HalScorer, HalVerdict } from '../src/lib/wrap-execute';
import type { ScoreResult } from '../src/lib/trustshell';

function scorer(verdict: HalVerdict, extra: Partial<ScoreResult> = {}): HalScorer {
  return {
    async score(): Promise<ScoreResult> {
      return {
        trustScore: verdict === 'PASS' ? 90 : 20,
        halScore: verdict === 'PASS' ? 0.1 : 0.8,
        signals: {
          harmProbability: 0,
          epistemicUncertainty: 0,
          evidenceQuality: 1,
          scopeAppropriateness: 1,
          certaintyAtClaim: 1,
        },
        verdict,
        flaggedHallucination: verdict !== 'PASS',
        provider: 'test',
        model: 'test',
        decisionReason: `test says ${verdict}`,
        evidence: [`test:${verdict}`],
        ...extra,
      } as ScoreResult;
    },
  };
}

const brokenScorer: HalScorer = {
  async score(): Promise<ScoreResult> {
    throw new Error('provider 402: requires more credits');
  },
};

describe('meetsThreshold', () => {
  it('orders PASS < FLAG < VETO', () => {
    expect(HAL_VERDICT_ORDER).toEqual(['PASS', 'FLAG', 'VETO']);
    expect(meetsThreshold('VETO', 'FLAG')).toBe(true);
    expect(meetsThreshold('FLAG', 'FLAG')).toBe(true);
    expect(meetsThreshold('PASS', 'FLAG')).toBe(false);
    expect(meetsThreshold('FLAG', 'VETO')).toBe(false);
  });
});

describe('record-by-default', () => {
  it('does NOT withhold a VETO when no threshold is set — this is the shipping default', async () => {
    const r = await wrapExecute(scorer('VETO'), () => 'Paris is the capital of France');
    expect(r.verdict).toBe('VETO');
    expect(r.blocked).toBe(false);
    expect(r.disposition).toBe('released');
    expect(r.output).toBe('Paris is the capital of France');
    expect(r.blockAtOrAbove).toBeNull();
  });

  it('an explicit null threshold behaves the same as omitting it', async () => {
    const r = await wrapExecute(scorer('VETO'), () => 'x', { blockAtOrAbove: null });
    expect(r.blocked).toBe(false);
  });
});

describe('opt-in blocking', () => {
  it('withholds at or above the named threshold', async () => {
    const r = await wrapExecute(scorer('VETO'), () => 'bad', { blockAtOrAbove: 'VETO' });
    expect(r.blocked).toBe(true);
    expect(r.disposition).toBe('withheld');
    expect(r.output).toBeUndefined();
  });

  it('releases below the threshold', async () => {
    const r = await wrapExecute(scorer('FLAG'), () => 'iffy', { blockAtOrAbove: 'VETO' });
    expect(r.blocked).toBe(false);
    expect(r.output).toBe('iffy');
  });

  it('FLAG threshold also catches VETO', async () => {
    const r = await wrapExecute(scorer('VETO'), () => 'bad', { blockAtOrAbove: 'FLAG' });
    expect(r.blocked).toBe(true);
  });
});

describe('an unreachable HAL is never a pass', () => {
  it('reports checked:false and UNKNOWN, not PASS', async () => {
    const r = await wrapExecute(brokenScorer, () => 'out');
    expect(r.checked).toBe(false);
    expect(r.verdict).toBe('UNKNOWN');
    expect(r.verdict).not.toBe('PASS');
    expect(r.error).toContain('402');
    expect(r.decisionReason).toContain('NOT a pass');
  });

  it('releases in record-only mode — an outage must not become a product outage', async () => {
    const r = await wrapExecute(brokenScorer, () => 'out');
    expect(r.blocked).toBe(false);
    expect(r.output).toBe('out');
  });

  it('honours onUnavailable=withhold when blocking is on (fail closed)', async () => {
    const r = await wrapExecute(brokenScorer, () => 'out', {
      blockAtOrAbove: 'VETO',
      onUnavailable: 'withhold',
    });
    expect(r.checked).toBe(false);
    expect(r.blocked).toBe(true);
    expect(r.output).toBeUndefined();
  });

  it('defaults to release when blocking is on but onUnavailable is unset', async () => {
    const r = await wrapExecute(brokenScorer, () => 'out', { blockAtOrAbove: 'VETO' });
    expect(r.blocked).toBe(false);
  });
});

describe('the caller is not lied to about their own function', () => {
  it('rethrows: a thrown fn is a real bug, not a trust verdict', async () => {
    await expect(
      wrapExecute(scorer('PASS'), () => {
        throw new Error('the agent itself crashed');
      }),
    ).rejects.toThrow('the agent itself crashed');
  });

  it('a legitimately-undefined return is distinguishable from a withheld one', async () => {
    const r = await wrapExecute(scorer('PASS'), () => undefined);
    expect(r.output).toBeUndefined();
    // The point: output is undefined in BOTH cases, so `blocked` is the field to trust.
    expect(r.blocked).toBe(false);
    // An unscoreable output is UNKNOWN, never an unearned PASS.
    expect(r.checked).toBe(false);
    expect(r.verdict).toBe('UNKNOWN');
  });

  it('scores non-string output by serialising it', async () => {
    const r = await wrapExecute(scorer('PASS'), () => ({ answer: 42 }));
    expect(r.checked).toBe(true);
    expect(r.output).toEqual({ answer: 42 });
  });

  it('does not throw on circular output — it records UNKNOWN', async () => {
    const circular: any = { a: 1 };
    circular.self = circular;
    const r = await wrapExecute(scorer('PASS'), () => circular);
    expect(r.checked).toBe(false);
    expect(r.verdict).toBe('UNKNOWN');
    expect(r.output).toBe(circular);
  });
});

describe('telemetry', () => {
  it('calls onRecord exactly once, released or withheld', async () => {
    const seen: string[] = [];
    await wrapExecute(scorer('PASS'), () => 'a', { onRecord: (r) => seen.push(r.disposition) });
    await wrapExecute(scorer('VETO'), () => 'b', {
      blockAtOrAbove: 'VETO',
      onRecord: (r) => seen.push(r.disposition),
    });
    expect(seen).toEqual(['released', 'withheld']);
  });

  it('a throwing onRecord never breaks the caller', async () => {
    const r = await wrapExecute(scorer('PASS'), () => 'fine', {
      onRecord: () => {
        throw new Error('telemetry sink is down');
      },
    });
    expect(r.output).toBe('fine');
  });

  it('carries the evidence and the latency, so the WHY and the cost are both visible', async () => {
    const r = await wrapExecute(scorer('VETO'), () => 'x');
    expect(r.evidence).toEqual(['test:VETO']);
    expect(r.decisionReason).toBe('test says VETO');
    expect(typeof r.halLatencyMs).toBe('number');
    expect(r.halLatencyMs).toBeGreaterThanOrEqual(0);
  });
});
