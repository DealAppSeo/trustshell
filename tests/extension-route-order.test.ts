/**
 * Cheap first does not put their model first.
 */
export {};

const verify = require('../extension/verify.js') as {
  verifyLastReply: (
    text: string,
    options?: {
      setting?: string;
      fetchImpl?: (url: string, init: { body?: string }) => Promise<{ status: number; json: () => Promise<unknown> }>;
    },
  ) => Promise<string>;
};

describe('extension route order', () => {
  it('cheap first does not put their model first', async () => {
    let order: string[] = [];
    await verify.verifyLastReply('the last reply', {
      setting: 'cheap first',
      fetchImpl: (_url, init) => {
        order = JSON.parse(String(init.body)).order;
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
