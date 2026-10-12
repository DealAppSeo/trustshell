/**
 * Reading an agent's two RepID fields from the public passport route, from the browser. Three
 * outcomes, never two; and an unreadable passport is never a score of zero or "no ID".
 */
import { fetchTwoFields } from '../lib/passport-client';

const json = (status: number, b: unknown) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
const passport = {
  reputation: { repid_score: 200, tier: 'PROBATIONARY' },
  identity_erc8004: { registered_onchain: 'NOT_MINTED', token_id: null },
};
const at = (res: () => Response | Promise<Response>, urls: string[] = []) =>
  fetchTwoFields('a/b c', {
    base: 'https://e.test/',
    fetchImpl: (async (u: string) => {
      urls.push(String(u));
      return res();
    }) as never,
  });

describe('fetchTwoFields', () => {
  it('reads score and ID as two fields and encodes the agent id into the path', async () => {
    const urls: string[] = [];
    const r = await at(() => json(200, passport), urls);
    expect(urls).toEqual(['https://e.test/api/v1/passport/a%2Fb%20c']);
    expect(r).toEqual({
      state: 'READ',
      fields: { score: 200, tier: 'PROBATIONARY', mint: 'NOT_MINTED', token: { state: 'NOT_CHECKED', reason: 'the engine sent no token id' } },
    });
  });

  it('a 404 is NOT_CHECKED not_found, not a zero', async () => {
    expect(await at(() => json(404, { error: 'no' }))).toEqual({ state: 'NOT_CHECKED', reason: 'not_found' });
  });

  it('a 5xx or a network error is NOT_CHECKED unreachable', async () => {
    expect(await at(() => json(503, {}))).toEqual({ state: 'NOT_CHECKED', reason: 'unreachable' });
    expect(await fetchTwoFields('x', { base: 'https://e.test', fetchImpl: (async () => { throw new TypeError('down'); }) as never })).toEqual({
      state: 'NOT_CHECKED',
      reason: 'unreachable',
    });
  });

  it('a body that is not a passport is bad_response, not "no ID"', async () => {
    expect(await at(() => new Response('<html>', { status: 200 }))).toEqual({ state: 'NOT_CHECKED', reason: 'bad_response' });
    expect(await at(() => json(200, { hello: 'world' }))).toEqual({ state: 'NOT_CHECKED', reason: 'bad_response' });
  });

  it('is NOT_CHECKED with no engine configured', async () => {
    expect(await fetchTwoFields('x', { base: '' })).toEqual({ state: 'NOT_CHECKED', reason: 'no_engine' });
  });
});
