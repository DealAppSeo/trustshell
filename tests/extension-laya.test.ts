/**
 * Laya call. A missing model, a timeout, or an empty body is not-checked, not a pass.
 */
const laya = require('../extension/laya.js') as {
  callLaya: (
    text: unknown,
    options?: { modelUrl?: string; fetchImpl?: unknown; timeoutMs?: number; now?: () => number },
  ) => Promise<{ label: string; latency_ms: number; line?: string }>;
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

  it('over 6000 ms is not-checked and says Still checking', async () => {
    const clock = (step: number) => {
      let t = 0;
      return () => (t += step);
    };
    const slow = await laya.callLaya(REPLY, {
      modelUrl: MODEL_URL,
      fetchImpl: answer(200, '{"label":"pass"}'),
      now: clock(6001),
    });
    expect(slow).toEqual({ label: 'not-checked', latency_ms: 6001, line: 'Still checking' });
    const edge = await laya.callLaya(REPLY, {
      modelUrl: MODEL_URL,
      fetchImpl: answer(200, '{"label":"pass"}'),
      now: clock(6000),
    });
    expect(edge).toEqual({ label: 'pass', latency_ms: 6000 });
  });

  it('the default wait stops just past 6000 ms and says Still checking', async () => {
    jest.useFakeTimers();
    try {
      let t = 0;
      const fetchImpl = jest.fn(() => new Promise(() => undefined));
      const pending = laya.callLaya(REPLY, { modelUrl: MODEL_URL, fetchImpl, now: () => t });
      // The wait matches the website and the CLI: the engine may ask another checker inside it.
      t = 6100;
      jest.advanceTimersByTime(6100);
      const out = await pending;
      expect(out).toEqual({ label: 'not-checked', latency_ms: 6100, line: 'Still checking' });
    } finally {
      jest.useRealTimers();
    }
  });

  it('a non-http model address is no model', async () => {
    for (const modelUrl of ['file:///etc/passwd', 'javascript:alert(1)', 'not a url', 'https://api.anthropic.com/v1']) {
      const fetchImpl = answer(200, '{"label":"pass"}');
      const out = await laya.callLaya(REPLY, { modelUrl, fetchImpl });
      expect(out.label).toBe('not-checked');
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  });

  it('sends no cookies and refuses a redirect', async () => {
    const sent = answer(200, '{"label":"pass"}');
    await laya.callLaya(REPLY, { modelUrl: MODEL_URL, fetchImpl: sent });
    const init = (sent.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.credentials).toBe('omit');
    expect(init.redirect).toBe('error');
  });

  it('an oversized body is not-checked, not pass', async () => {
    const big = JSON.stringify({ label: 'pass', pad: 'x'.repeat(70000) });
    const out = await laya.callLaya(REPLY, { modelUrl: MODEL_URL, fetchImpl: answer(200, big) });
    expect(out.label).toBe('not-checked');
  });
});
export {};
