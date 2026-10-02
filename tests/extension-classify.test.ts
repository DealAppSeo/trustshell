/**
 * The classifier call returns pass, veto, or not-checked.
 * A missing endpoint, a timeout, and an empty body are not-checked, not 0.
 */
const classify = require('../extension/classify.js') as {
  classifyReply: (
    text: string,
    options?: {
      endpoint?: string;
      timeoutMs?: number;
      fetchImpl?: (
        url: string,
        init: { body?: string; signal?: AbortSignal },
      ) => Promise<{ status: number; json: () => Promise<unknown> }>;
    },
  ) => Promise<{ label: string; latency_ms: number }>;
};

describe('extension classify', () => {
  it('a missing endpoint, a timeout, and an empty body are not-checked, not 0', async () => {
    const logged: unknown[][] = [];
    const log = console.log;
    console.log = (...args: unknown[]) => {
      logged.push(args);
    };
    try {
      const missing = await classify.classifyReply('noted reply\nveto', { endpoint: '' });
      expect(missing.label).toBe('not-checked');
      expect(missing.label).not.toBe(0);
      expect(missing.label).not.toBe('pass');
      expect(typeof missing.latency_ms).toBe('number');

      let anthropicCalls = 0;
      const blocked = await classify.classifyReply('noted reply\nveto', {
        endpoint: 'https://api.anthropic.com/v1/messages',
        fetchImpl: () => {
          anthropicCalls += 1;
          return Promise.resolve({ status: 200, json: async () => ({ label: 'pass' }) });
        },
      });
      expect(anthropicCalls).toBe(0);
      expect(blocked.label).toBe('not-checked');
      expect(blocked.label).not.toBe(0);

      const empty = await classify.classifyReply('noted reply\nveto', {
        endpoint: 'https://repid-engine-production.up.railway.app/api/v1/classify',
        fetchImpl: async (url, init) => {
          expect(url).not.toMatch(/anthropic/i);
          const body = JSON.parse(init.body || '{}') as { text?: string; labels?: string[] };
          expect(body.labels).toEqual(['pass', 'veto', 'not-checked']);
          expect(String(body.text || '')).toContain('noted reply');
          return { status: 200, json: async () => ({}) };
        },
      });
      expect(empty.label).toBe('not-checked');
      expect(empty.label).not.toBe(0);
      expect(empty.label).not.toBe('pass');

      const blank = await classify.classifyReply('noted reply\nveto', {
        endpoint: 'https://repid-engine-production.up.railway.app/api/v1/classify',
        fetchImpl: async () => ({ status: 200, json: async () => '' }),
      });
      expect(blank.label).toBe('not-checked');
      expect(blank.label).not.toBe(0);

      const timed = await classify.classifyReply('noted reply\nveto', {
        endpoint: 'https://repid-engine-production.up.railway.app/api/v1/classify',
        timeoutMs: 20,
        fetchImpl: (_url, init) =>
          new Promise((_resolve, reject) => {
            if (init.signal) init.signal.addEventListener('abort', () => reject(new Error('timeout')));
          }),
      });
      expect(timed.label).toBe('not-checked');
      expect(timed.label).not.toBe(0);
      expect(timed.label).not.toBe('pass');
      expect(logged).toEqual([]);
    } finally {
      console.log = log;
    }
  });
});
