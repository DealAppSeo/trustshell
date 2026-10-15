/**
 * `by: "arithmetic-approx"` in the extension (XC1 on #554, BLOCKER). The engine
 * (repid-engine src/routes/classify.ts:87-88, :202-203, :567) answers it when a whole-text equation
 * cannot be held exactly (a fractional power) and is compared as doubles within 1e-9 relative.
 * It always decides: `2 ^ 0.5 = 1.5` is a veto and `4 ^ 0.5 = 2` is a pass.
 *
 * laya.js did not list it, so a real approximate VETO painted Not checked with an empty line, and no
 * Caught toast. Now pass is Checks out and veto is Caught, each with the approximate line, word for
 * word the CLI's (src/lib/claim.ts on the CLI branch). Every other unknown `by` is still
 * not-checked, and its line now says it was out of contract instead of saying nothing.
 */
export {};

const laya = require('../extension/laya.js') as {
  callLaya: (text: unknown, options?: Record<string, unknown>) => Promise<Record<string, unknown>>;
};
const classify = require('../extension/classify.js') as {
  classifyReply: (text: string, options?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  lineFor: (row: unknown) => string;
  stampText: (label: string) => string;
  OUT_OF_CONTRACT_LINE: string;
};
const select = require('../extension/select.js') as {
  checkSelection: (text: string, tab: unknown, deps: Record<string, unknown>) => Promise<Record<string, unknown>>;
  toastText: (row: unknown) => string;
};
const toast = require('../extension/toast.js') as { toastFor: (result: unknown) => string };
const settings = require('../extension/settings.js') as {
  recordEntry: (message: unknown, url: string, at: number) => Record<string, unknown> | null;
};

const APPROX_LINE = 'Decided by approximate calculation, not exact. No model was asked.';
const ENDPOINT = 'http://localhost:9/api/v1/classify';

function stub(body: unknown) {
  return jest.fn(async () => ({ status: 200, text: async () => JSON.stringify(body) }));
}

const reply = (text: string, body: unknown) => classify.classifyReply(text, { endpoint: ENDPOINT, fetchImpl: stub(body) });

describe('arithmetic-approx is a checked answer, and says it is approximate', () => {
  it('pass: Checks out, the approximate line, never the exact one', async () => {
    const row = await reply('4 ^ 0.5 = 2', { label: 'pass', latency_ms: 1, by: 'arithmetic-approx' });
    expect(row).toMatchObject({ label: 'pass', by: 'arithmetic-approx' });
    expect(classify.stampText(String(row.label))).toBe('Checks out');
    expect(classify.lineFor(row)).toBe(APPROX_LINE);
    expect(classify.lineFor(row)).not.toMatch(/exact calculation/);
  });

  it('veto: Caught on the stamp, the Caught toast, and the approximate line, here and on right-click', async () => {
    const row = await reply('2 ^ 0.5 = 1.5', { label: 'veto', latency_ms: 0, by: 'arithmetic-approx' });
    expect(row).toMatchObject({ label: 'veto', by: 'arithmetic-approx' });
    expect(classify.stampText(String(row.label))).toBe('Caught\nChecked and found false.');
    expect(toast.toastFor(row.label)).toBe('Caught. This reply did not pass.');
    expect(classify.lineFor(row)).toBe(APPROX_LINE);

    const picked = await select.checkSelection('2 ^ 0.5 = 1.5', null, {
      modelUrl: ENDPOINT,
      fetchImpl: stub({ label: 'veto', latency_ms: 0, by: 'arithmetic-approx' }),
    });
    expect(picked).toMatchObject({ label: 'veto', by: 'arithmetic-approx' });
    expect(select.toastText(picked)).toBe('Caught\nChecked and found false.\n' + APPROX_LINE);
  });

  it('the record on the Options page keeps the approximate path', () => {
    const entry = settings.recordEntry(
      { type: 'trustshell-record', label: 'veto', by: 'arithmetic-approx', deciders: [] },
      'https://chatgpt.com/c/1',
      Date.UTC(2026, 9, 14),
    );
    expect(entry).toMatchObject({ label: 'veto', by: 'arithmetic-approx' });
  });

  it('unknown kind: not-checked, never a pass, and the line says it was out of contract', async () => {
    for (const by of ['arithmetic-fuzzy', 'approx', 'ARITHMETIC-APPROX', 'verified']) {
      const raw = await laya.callLaya('2 ^ 0.5 = 1.414', { modelUrl: ENDPOINT, fetchImpl: stub({ label: 'pass', by }) });
      expect([by, raw.label, raw.reason]).toEqual([by, 'not-checked', 'out-of-contract']);
      const row = await reply('2 ^ 0.5 = 1.414', { label: 'pass', latency_ms: 1, by });
      expect([by, row.label]).toEqual([by, 'not-checked']);
      expect(row).not.toHaveProperty('by');
      expect(classify.stampText(String(row.label))).toBe('Not checked');
      expect(classify.lineFor(row)).toBe(classify.OUT_OF_CONTRACT_LINE);
    }
    // An approximate path that claims not-checked is not the engine's answer either.
    const guarded = await reply('2 ^ 0.5 = 1.414', { label: 'not-checked', by: 'arithmetic-approx' });
    expect(guarded).toMatchObject({ label: 'not-checked', reason: 'out-of-contract' });
    expect(guarded).not.toHaveProperty('by');
  });

  it('an older endpoint with no by at all keeps its label and gets no out-of-contract line', async () => {
    const row = await reply('x', { label: 'pass', latency_ms: 1 });
    expect(row.label).toBe('pass');
    expect(row).not.toHaveProperty('reason');
    expect(classify.lineFor(row)).toBe('');
  });
});
