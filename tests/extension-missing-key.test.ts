/**
 * A missing key stays not-checked. Anthropic is not called.
 */
export {};

const verify = require('../extension/verify.js') as {
  verifyLastReply: (
    text: string,
    options?: {
      setting?: string;
      keys?: Record<string, string>;
      key?: string;
      baseUrl?: string;
      fetchImpl?: (url: string, init: { body?: string }) => Promise<{ status: number; json: () => Promise<unknown> }>;
    },
  ) => Promise<string>;
};

function cleanFetch(seen: string[]) {
  return (url: string) => {
    seen.push(String(url));
    return Promise.resolve({
      status: 200,
      json: () => Promise.resolve({ decision: 'clean' }),
    });
  };
}

describe('extension missing key', () => {
  it('a missing key stays not-checked and does not call anthropic', async () => {
    const missingCalls: string[] = [];
    const missing = await verify.verifyLastReply('the last reply', {
      setting: 'cheap first',
      keys: { anthropic: 'present', groq: '   ' },
      fetchImpl: cleanFetch(missingCalls),
    });
    expect(missingCalls).toEqual([]);
    expect(missing).toBe('not-checked');
    expect(missing).not.toBe('pass');
    expect(missing).not.toBe(0);
    expect(missing).not.toBe('0');

    const emptyCalls: string[] = [];
    const empty = await verify.verifyLastReply('the last reply', {
      setting: 'cheap first',
      key: '',
      fetchImpl: cleanFetch(emptyCalls),
    });
    expect(emptyCalls).toEqual([]);
    expect(empty).toBe('not-checked');
    expect(empty).not.toBe('pass');
    expect(empty).not.toBe(0);

    const blankCalls: string[] = [];
    const blank = await verify.verifyLastReply('the last reply', {
      key: '   ',
      baseUrl: 'https://api.anthropic.com',
      fetchImpl: cleanFetch(blankCalls),
    });
    expect(blankCalls).toEqual([]);
    expect(blank).toBe('not-checked');

    const anthropicCalls: string[] = [];
    const blocked = await verify.verifyLastReply('the last reply', {
      baseUrl: 'https://api.anthropic.com',
      fetchImpl: cleanFetch(anthropicCalls),
    });
    expect(anthropicCalls).toEqual([]);
    expect(blocked).toBe('not-checked');
    expect(blocked).not.toBe('pass');
  });
});
