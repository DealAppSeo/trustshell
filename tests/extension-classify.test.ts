/**
 * Laya is a local sort. A missing model is not-checked, never a pass.
 */
const laya = require('../extension/classify.js') as {
  classify: (
    text: unknown,
    options?: { model?: unknown; now?: () => number },
  ) => Promise<{ label: string; latencyMs: number }>;
};

const CLAIM = 'The bridge settles in 4 seconds. veto';

describe('extension classify', () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = jest.fn(() => {
      throw new Error('classify must not call the network');
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('cheap', async () => {
    expect((await laya.classify('hello', { model: () => 'cheap' })).label).toBe('cheap');
  });

  it('escalate', async () => {
    expect((await laya.classify('hello', { model: () => 'escalate' })).label).toBe('escalate');
  });

  it('ask', async () => {
    expect((await laya.classify('hello', { model: async () => 'ask' })).label).toBe('ask');
  });

  it('a missing model is not-checked, not a pass', async () => {
    const out = await laya.classify('hello', {});
    expect(out.label).toBe('not-checked');
    expect(out.label).not.toBe('pass');
    expect((await laya.classify('hello')).label).toBe('not-checked');
    expect((await laya.classify('hello', { model: 'https://api.example' })).label).toBe('not-checked');
  });

  it('a veto-word in the text does not become a veto', async () => {
    expect((await laya.classify(CLAIM, { model: () => 'cheap' })).label).toBe('cheap');
    expect((await laya.classify(CLAIM, { model: () => 'veto' })).label).toBe('not-checked');
    expect((await laya.classify(CLAIM, {})).label).not.toBe('veto');
  });

  it('latency is a local clock and no claim text leaves the function', async () => {
    let t = 100;
    const out = await laya.classify(CLAIM, { model: () => 'ask', now: () => (t += 7) });
    expect(out).toEqual({ label: 'ask', latencyMs: 7 });
    expect(JSON.stringify(out)).not.toContain('bridge');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
