/**
 * laya.js is wired into the stamp: classify.js hands it the call, and chatgpt
 * (content.js) paints only the classifier's label, never the reply's last word.
 */
export {};

const classify = require('../extension/classify.js') as {
  classifyReply: (
    text: string,
    options?: { endpoint?: string; fetchImpl?: unknown },
  ) => Promise<{ label: string; latency_ms: number }>;
};
const content = require('../extension/content.js') as {
  classifyRow: (text: string, options?: { fetchImpl?: unknown }) => Promise<{ label: string; latency_ms: number }>;
};

type Init = { credentials?: string; redirect?: string; body?: string };
const ENDPOINT = 'http://localhost:8080/classify';

describe('laya wired into the stamp', () => {
  it('classify.js makes the call through laya.js', async () => {
    const fetchImpl = jest.fn(async (_url: string, _init: Init) => ({ status: 200, json: async () => ({ label: 'pass' }) }));
    const row = await classify.classifyReply('noted', { endpoint: ENDPOINT, fetchImpl });
    expect(row.label).toBe('pass');
    const init = fetchImpl.mock.calls[0]![1];
    expect(init.credentials).toBe('omit');
    expect(init.redirect).toBe('error');
  });

  it('a non-http endpoint is not-checked and nothing is sent', async () => {
    const fetchImpl = jest.fn();
    const row = await classify.classifyReply('noted', { endpoint: 'file:///etc/passwd', fetchImpl });
    expect(row.label).toBe('not-checked');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('chatgpt: a reply ending in veto is not a veto unless the classifier says veto', async () => {
    const said = (label: string) => async () => ({ status: 200, json: async () => ({ label }) });
    expect((await content.classifyRow('noted\nveto', { endpoint: ENDPOINT, fetchImpl: said('pass') } as never)).label).toBe('pass');
    expect((await content.classifyRow('noted\nveto', { endpoint: ENDPOINT, fetchImpl: said('veto') } as never)).label).toBe('veto');
    expect((await content.classifyRow('noted\npass', { endpoint: '', fetchImpl: said('pass') } as never)).label).toBe('not-checked');
  });

  it('chatgpt: an empty reply is not-checked and is not sent', async () => {
    const fetchImpl = jest.fn();
    expect((await content.classifyRow('   ', { endpoint: ENDPOINT, fetchImpl } as never)).label).toBe('not-checked');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('the browser path sends one finished reply once, not once per redraw', async () => {
    const realFetch = globalThis.fetch;
    const fetchImpl = jest.fn(async () => ({ status: 200, json: async () => ({ label: 'veto' }) }));
    globalThis.fetch = fetchImpl as unknown as typeof fetch;
    try {
      const a = await classify.classifyReply('same reply, cached');
      const b = await classify.classifyReply('same reply, cached');
      expect(a.label).toBe('veto');
      expect(b.label).toBe('veto');
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      await classify.classifyReply('a different reply');
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('a not-checked answer is not cached, so the next redraw retries', async () => {
    const realFetch = globalThis.fetch;
    const fetchImpl = jest.fn(async () => ({ status: 401, json: async () => ({}) }));
    globalThis.fetch = fetchImpl as unknown as typeof fetch;
    try {
      expect((await classify.classifyReply('retry me')).label).toBe('not-checked');
      expect((await classify.classifyReply('retry me')).label).toBe('not-checked');
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
