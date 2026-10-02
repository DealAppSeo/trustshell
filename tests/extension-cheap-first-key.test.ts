/**
 * Cheap first still does not put their model first.
 */
export {};

const verify = require('../extension/verify.js') as {
  verifyLastReply: (
    text: string,
    options?: {
      setting?: string;
      key?: string;
      fetchImpl?: (url: string, init: { body?: string }) => Promise<{ status: number; json: () => Promise<unknown> }>;
    },
  ) => Promise<string>;
};

describe('cheap first with a key', () => {
  it('cheap first still does not put their model first', async () => {
    let order: string[] = [];
    await verify.verifyLastReply('the last reply', {
      setting: 'cheap first',
      key: 'gsk_present',
      fetchImpl: (url, init) => {
        expect(String(url)).not.toMatch(/anthropic/i);
        order = JSON.parse(String(init.body)).order;
        expect(String(init.body)).not.toContain('gsk_present');
        return Promise.resolve({
          status: 200,
          json: () => Promise.resolve({ decision: 'clean' }),
        });
      },
    });
    expect(order[0]).not.toBe('my-model');
    expect(order[0]).toBe('groq');
    expect(order.includes('anthropic')).toBe(false);
  });
});
