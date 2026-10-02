/**
 * Laya call. A missing model, a timeout, or an empty body is not-checked, not a pass.
 */
const laya = require('../extension/laya.js') as {
  callLaya: (
    text: unknown,
    options?: { modelUrl?: string; fetchImpl?: unknown; timeoutMs?: number },
  ) => Promise<{ label: string; latency_ms: number }>;
};

const MODEL_URL = 'http://localhost:8080/classify';
const REPLY = 'The bridge settles in 4 seconds. veto';

function answer(status: number, raw: string) {
  return jest.fn(async () => ({ status, text: async () => raw }));
}

describe('extension laya', () => {
  let log: jest.SpyInstance;
  beforeEach(() => {
    log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    expect(JSON.stringify(log.mock.calls)).not.toContain('bridge');
    log.mockRestore();
  });

  it('a missing model is not-checked, not pass', async () => {
    const fetchImpl = answer(200, '{"label":"pass"}');
    const out = await laya.callLaya(REPLY, { fetchImpl });
    expect(out.label).toBe('not-checked');
    expect(out.label).not.toBe('pass');
    expect(typeof out.latency_ms).toBe('number');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('a timeout is not-checked, not pass', async () => {
    const fetchImpl = jest.fn(() => new Promise(() => undefined));
    const out = await laya.callLaya(REPLY, { modelUrl: MODEL_URL, fetchImpl, timeoutMs: 20 });
    expect(out.label).toBe('not-checked');
    expect(out.label).not.toBe('pass');
  });

  it('an empty body is not-checked, not pass', async () => {
    const out = await laya.callLaya(REPLY, { modelUrl: MODEL_URL, fetchImpl: answer(200, '') });
    expect(out.label).toBe('not-checked');
    expect(out.label).not.toBe('pass');
  });

  it('a reply ending in veto is not a veto unless Laya returns veto', async () => {
    const pass = await laya.callLaya(REPLY, { modelUrl: MODEL_URL, fetchImpl: answer(200, '{"label":"pass"}') });
    expect(pass.label).toBe('pass');
    const veto = await laya.callLaya(REPLY, { modelUrl: MODEL_URL, fetchImpl: answer(200, '{"label":"veto"}') });
    expect(veto.label).toBe('veto');
    const sent = answer(200, '{"label":"pass"}');
    const out = await laya.callLaya(REPLY, { modelUrl: MODEL_URL, fetchImpl: sent });
    expect(Object.keys(out).sort()).toEqual(['label', 'latency_ms']);
    const body = JSON.parse((sent.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body).toEqual({ text: REPLY, labels: ['pass', 'veto', 'not-checked'] });
  });
});
export {};
