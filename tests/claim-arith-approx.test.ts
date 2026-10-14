/**
 * `by: "arithmetic-approx"` (repid-engine src/routes/classify.ts, 2026-10-12, E-2). The whole text
 * was one equation that the engine's exact BigInt-rational evaluator could not hold, such as a
 * fractional power. Both sides were then evaluated as doubles and called equal within 1e-9 relative.
 * It always decides, pass or veto. Production answers it:
 * `2 ^ 0.5 = 1.414213562373095` is pass and `2 ^ 0.5 = 1.5` is veto.
 *
 * Before this, the CLI did not know the value, so a real answer was printed not-checked. Now it is
 * a checked answer that says it is approximate. Any `by` still unknown stays not-checked, never a pass.
 */
import { classifyClaim, pathLine, pathOf } from '../src/lib/claim';
import { runClaimCheck, type CliIO } from '../src/cli';
import { receiptOf } from '../lib/check-receipt';

const APPROX_LINE = 'Decided by approximate calculation, not exact. No model was asked.';

function stub(body: unknown) {
  return jest.fn(async () => ({ status: 200, text: async () => JSON.stringify(body) })) as unknown as typeof fetch;
}

async function cli(body: unknown): Promise<{ code: number; out: string[] }> {
  const real = global.fetch;
  global.fetch = stub(body);
  const out: string[] = [];
  const io: CliIO = { out: (s: string) => void out.push(s), err: () => {} };
  try {
    return { code: await runClaimCheck('2 ^ 0.5 = 1.414213562373095', false, io), out };
  } finally {
    global.fetch = real;
  }
}

describe('arithmetic-approx is a checked answer that says it is approximate', () => {
  it('pass: label pass, exit 0, the approximate line, never the exact one', async () => {
    const r = await classifyClaim('2 ^ 0.5 = 1.414213562373095', {
      apiUrl: 'http://localhost:9',
      fetchImpl: stub({ label: 'pass', latency_ms: 1, by: 'arithmetic-approx' }),
    });
    expect(r).toEqual({ label: 'pass', latency_ms: 1, by: 'arithmetic-approx' });
    expect(pathLine(r)).toBe(APPROX_LINE);

    const run = await cli({ label: 'pass', latency_ms: 1, by: 'arithmetic-approx' });
    expect(run.code).toBe(0);
    expect(run.out[0]).toBe('pass');
    expect(run.out).toContain(APPROX_LINE);
    expect(run.out.join('\n')).not.toMatch(/exact calculation/);
  });

  it('fail: label veto, exit 1, the same approximate line', async () => {
    const r = await classifyClaim('2 ^ 0.5 = 1.5', {
      apiUrl: 'http://localhost:9',
      fetchImpl: stub({ label: 'veto', latency_ms: 0, by: 'arithmetic-approx' }),
    });
    expect(r).toEqual({ label: 'veto', latency_ms: 0, by: 'arithmetic-approx' });
    const run = await cli({ label: 'veto', latency_ms: 0, by: 'arithmetic-approx' });
    expect(run.code).toBe(1);
    expect(run.out[0]).toBe('veto');
    expect(run.out).toContain(APPROX_LINE);
  });

  it('unknown kind: a `by` the contract does not list is not-checked, exit 2, never a pass', async () => {
    for (const by of ['arithmetic-fuzzy', 'approx', 'ARITHMETIC-APPROX', 'verified']) {
      const r = await classifyClaim('2 ^ 0.5 = 1.414213562373095', {
        apiUrl: 'http://localhost:9',
        fetchImpl: stub({ label: 'pass', latency_ms: 1, by }),
      });
      expect([by, r.label]).toEqual([by, 'not-checked']);
      expect(r).not.toHaveProperty('by');
    }
    const run = await cli({ label: 'pass', latency_ms: 1, by: 'arithmetic-fuzzy' });
    expect(run.code).toBe(2);
    expect(run.out[0]).toBe('not-checked');
  });

  it('a not-checked that claims the approximate path is not the engine answer: no path, no line', () => {
    expect(pathOf({ by: 'arithmetic-approx' }, 'not-checked')).toEqual({});
    expect(pathOf({ by: 'arithmetic-approx' }, 'pass')).toEqual({ by: 'arithmetic-approx' });
    expect(pathOf({ by: 'arithmetic-approx' }, 'veto')).toEqual({ by: 'arithmetic-approx' });
  });

  it('the /check receipt calls it an approximate calculation, never exact, never settled', () => {
    for (const label of ['pass', 'veto'] as const) {
      const v = receiptOf({ label, by: 'arithmetic-approx' });
      expect(v.status).toBe('APPROXIMATE_CALCULATION');
      expect(v.word).toBe('APPROXIMATE CALCULATION');
      expect(v.statusLine).toMatch(/not exact/);
      expect(JSON.stringify(v)).not.toMatch(/SETTLED|EXACT CALCULATION/);
      expect(v.lines).toEqual([]);
    }
  });
});
