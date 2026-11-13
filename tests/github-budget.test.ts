/**
 * release-e2e reads GitHub's anonymous budget before its keyless inspect steps and may wait once for the reset.
 * CI runners share addresses, so the budget was sometimes spent before the job's first request (#704 #707 #708).
 * Waiting only delays the steps; it must never turn into a skip or a pass.
 */
const { planWait } = require('../scripts/github-budget.cjs') as {
  planWait: (core: { remaining?: number; reset?: number; limit?: number } | null, need: number, maxWaitS: number, nowS: number) => { waitS: number; note: string };
};

const NOW = 1_800_000_000;

describe('release-e2e GitHub budget: wait for the reset, never skip', () => {
  it('runs now when the budget covers the steps', () => {
    expect(planWait({ remaining: 13, reset: NOW + 600, limit: 60 }, 13, 3660, NOW)).toEqual({ waitS: 0, note: '13 of 60 left, 13 needed' });
  });

  it('waits until the reset, plus slack, when the budget is short and the reset is within the bound', () => {
    expect(planWait({ remaining: 0, reset: NOW + 1200, limit: 60 }, 13, 3660, NOW).waitS).toBe(1205);
    expect(planWait({ remaining: 12, reset: NOW + 1, limit: 60 }, 13, 3660, NOW).waitS).toBe(6);
  });

  it('does not wait past the bound, and says so', () => {
    const r = planWait({ remaining: 0, reset: NOW + 1200, limit: 60 }, 13, 600, NOW);
    expect(r.waitS).toBe(0);
    expect(r.note).toMatch(/more than the 600 s/);
  });

  it('never waits when the bound is 0 (local runs and the checkout job)', () => {
    expect(planWait({ remaining: 0, reset: NOW + 10, limit: 60 }, 13, 0, NOW).waitS).toBe(0);
  });

  it('a reset already past still waits the slack, not a negative time', () => {
    expect(planWait({ remaining: 0, reset: NOW - 30, limit: 60 }, 13, 3660, NOW).waitS).toBe(5);
  });

  it('an unreadable budget runs the steps now, and says it was unreadable', () => {
    for (const core of [null, {}, { remaining: 'x' as unknown as number, reset: NOW }]) {
      expect(planWait(core, 13, 3660, NOW)).toEqual({ waitS: 0, note: 'budget unreadable; running the steps now' });
    }
  });
});
