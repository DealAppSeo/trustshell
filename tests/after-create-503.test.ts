/**
 * A 503 from after-create leaves every cell NOT_CHECKED, including can_list.
 */
import { loadAfterCreate, NOT_CHECKED_TABLE } from '../lib/after-create';

const testEnv = { NODE_ENV: 'test' as const, TRUSTSHELL_API_URL: 'https://engine.test' };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('after-create 503', () => {
  it('leaves every cell NOT_CHECKED even when join is up', async () => {
    const table = await loadAfterCreate({
      env: testEnv,
      fetchImpl: async (url) => {
        const href = String(url);
        if (href.endsWith('/api/v1/trustmarket/join')) {
          return jsonResponse(200, { can_list: true, can_stake: true });
        }
        return jsonResponse(503, { error: 'down' });
      },
    });
    expect(table).toEqual({ ...NOT_CHECKED_TABLE, source: 'NOT_CHECKED' });
    expect(table.can_list).toBe('NOT_CHECKED');
    expect(table.can_stake).toBe('NOT_CHECKED');
    expect(table.can_stake).not.toBe('live');
  });
});
