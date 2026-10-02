/**
 * A verify timeout is not-checked, never 0 and never a pass.
 */
const verify = require('../extension/verify.js') as {
  VERIFY_PATH: string;
  verifyLastReply: (
    text: string,
    options?: {
      baseUrl?: string;
      timeoutMs?: number;
      fetchImpl?: (url: string, init: { body?: string; headers?: Record<string, string>; signal?: AbortSignal }) => Promise<unknown>;
    },
  ) => Promise<string>;
};

describe('extension verify', () => {
  it('returns not-checked when the verify call times out', async () => {
    let seenUrl = '';
    let seenText = '';
    let sawKey = false;
    const result = await verify.verifyLastReply('the last reply', {
      baseUrl: 'https://repid-engine-production.up.railway.app',
      timeoutMs: 15,
      fetchImpl: (url, init) => {
        seenUrl = url;
        seenText = JSON.parse(String(init.body)).text;
        sawKey = Boolean(init.headers && (init.headers.Authorization || init.headers.authorization));
        return new Promise((_resolve, reject) => {
          const fail = () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          };
          if (init.signal?.aborted) fail();
          else init.signal?.addEventListener('abort', fail);
        });
      },
    });

    expect(seenUrl).toBe('https://repid-engine-production.up.railway.app' + verify.VERIFY_PATH);
    expect(verify.VERIFY_PATH).toBe('/api/v1/hal/evaluate');
    expect(seenText).toBe('the last reply');
    expect(sawKey).toBe(false);
    expect(result).toBe('not-checked');
    expect(result).not.toBe('pass');
    expect(result).not.toBe(0);
  });
});
