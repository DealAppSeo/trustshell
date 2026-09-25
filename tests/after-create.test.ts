import { loadAfterCreate, NOT_CHECKED_TABLE } from '../lib/after-create';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('after-create', () => {
  const ok = {
    can_verify: true,
    can_bind: false,
    can_stake: false,
    can_rate_models: true,
  };

  it('renders a 200 fixture', async () => {
    const table = await loadAfterCreate({
      env: {},
      fetchImpl: async () => jsonResponse(200, ok),
    });
    expect(table).toEqual({
      can_verify: 'true',
      can_bind: 'false',
      can_stake: 'false',
      can_rate_models: 'true',
    });
  });

  it('renders NOT_CHECKED for a 503 fixture', async () => {
    const table = await loadAfterCreate({
      env: {},
      fetchImpl: async () => jsonResponse(503, { error: 'down' }),
    });
    expect(table).toEqual(NOT_CHECKED_TABLE);
  });

  it('keeps can_stake true in shadow unless SAYS_STAKE_LIVE is set', async () => {
    const body = { ...ok, can_stake: true };
    const shadow = await loadAfterCreate({
      env: {},
      fetchImpl: async () => jsonResponse(200, body),
    });
    expect(shadow.can_stake).toBe('shadow — not live');

    const labeled = await loadAfterCreate({
      env: { SAYS_STAKE_LIVE: '1' },
      fetchImpl: async () => jsonResponse(200, body),
    });
    expect(labeled.can_stake).toBe('live');
  });

  it('a blank URL is NOT_CHECKED in every cell', async () => {
    const table = await loadAfterCreate({
      env: { TRUSTSHELL_API_URL: '  ' },
      fetchImpl: async () => {
        throw new Error('should not fetch');
      },
    });
    expect(table).toEqual(NOT_CHECKED_TABLE);
  });
});
