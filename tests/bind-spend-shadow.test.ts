/**
 * Bind/spend stay shadow: `status` never labels stake "live" unless
 * `SAYS_STAKE_LIVE` is set, and readiness never invents `can_bind`.
 */
import { buildStatusReport } from '../src/cli/status';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function mockFetch(scenarios: Record<string, unknown>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const [suffix, body] of Object.entries(scenarios)) {
      if (url.endsWith(suffix)) return jsonResponse(200, body);
    }
    return jsonResponse(503, {});
  }) as typeof fetch;
}

describe('bind/spend shadow', () => {
  const baseEnv = { NODE_ENV: 'test' as const, TRUSTSHELL_API_URL: 'https://engine.test' };

  it('can_stake true renders shadow when SAYS_STAKE_LIVE is unset', async () => {
    const text = await buildStatusReport({
      env: baseEnv,
      fetchImpl: mockFetch({
        '/api/v1/after-create': {
          can_verify: true,
          can_bind: true,
          can_stake: true,
          can_rate_models: false,
        },
        '/api/v1/hal/honesty-a': {
          status: 'counted',
          rows: [
            {
              family: 'glm',
              host: 'cerebras',
              TRUE: 1,
              FALSE: 0,
              NOT_CHECKED: 0,
            },
          ],
        },
        '/readiness': {
          exact_true: { HUMAN_AGENT_BIND_ENABLED: true },
        },
      }),
    });

    expect(text).toContain('can_stake shadow — not live');
    expect(text).toContain('can_bind true');
    expect(text).not.toMatch(/can_stake live/);
    // "live" may appear only inside the shadow label, never as the bare stake cell.
    expect(text).not.toMatch(/can_stake\s+live\b/);
  });

  it('readiness without exact_true.HUMAN_AGENT_BIND_ENABLED === true yields can_bind false or NOT_CHECKED', async () => {
    const readinessCases = [
      { exact_true: { HUMAN_AGENT_BIND_ENABLED: false } },
      { exact_true: { HUMAN_AGENT_BIND_ENABLED: 'true' } },
      { exact_true: { REAL_STAKING_ENABLED: true } },
      { flags: { HUMAN_AGENT_BIND_ENABLED: 'on' } },
      {},
    ];

    for (const readiness of readinessCases) {
      const text = await buildStatusReport({
        env: baseEnv,
        fetchImpl: mockFetch({
          '/api/v1/after-create': {
            can_verify: true,
            can_bind: true,
            can_stake: true,
            can_rate_models: false,
          },
          '/api/v1/hal/honesty-a': {
            status: 'counted',
            rows: [
              {
                family: 'glm',
                host: 'cerebras',
                TRUE: 1,
                FALSE: 0,
                NOT_CHECKED: 0,
              },
            ],
          },
          '/readiness': readiness,
        }),
      });

      expect(text).toMatch(/can_bind (false|NOT_CHECKED)/);
      expect(text).not.toMatch(/can_bind true/);
      expect(text).toContain('can_stake shadow — not live');
      expect(text).not.toMatch(/can_stake live/);
      expect(text).not.toMatch(/can_stake\s+live\b/);
    }
  });

  it('can_stake true stays shadow even if after-create carries a staking live field', async () => {
    const text = await buildStatusReport({
      env: baseEnv,
      fetchImpl: mockFetch({
        '/api/v1/after-create': {
          can_verify: true,
          can_bind: false,
          can_stake: true,
          can_rate_models: false,
          staking: 'live',
        },
        '/api/v1/hal/honesty-a': {
          status: 'counted',
          rows: [
            {
              family: 'glm',
              host: 'cerebras',
              TRUE: 1,
              FALSE: 0,
              NOT_CHECKED: 0,
            },
          ],
        },
        '/readiness': {
          exact_true: { HUMAN_AGENT_BIND_ENABLED: false },
        },
      }),
    });

    expect(text).toContain('can_stake shadow — not live');
    expect(text).not.toMatch(/can_stake live/);
    expect(text).not.toMatch(/can_stake\s+live\b/);
    expect(text).toContain('can_bind false');
  });

  it('can_stake true renders live only when SAYS_STAKE_LIVE is the exact string "true"', async () => {
    const liveText = await buildStatusReport({
      env: { ...baseEnv, SAYS_STAKE_LIVE: 'true' },
      fetchImpl: mockFetch({
        '/api/v1/after-create': { can_verify: true, can_bind: false, can_stake: true, can_rate_models: false },
        '/api/v1/hal/honesty-a': { status: 'counted', rows: [{ family: 'glm', host: 'cerebras', TRUE: 1, FALSE: 0, NOT_CHECKED: 0 }] },
        '/readiness': { exact_true: { HUMAN_AGENT_BIND_ENABLED: false } },
      }),
    });

    expect(liveText).toContain('can_stake live');
    expect(liveText).not.toContain('can_stake shadow — not live');
  });

  it('can_stake true stays shadow for non-exact SAYS_STAKE_LIVE values', async () => {
    const values = ['TRUE', '1', 'yes', 'on', ' true ', '  ', ''];
    for (const value of values) {
      const text = await buildStatusReport({
        env: value === '' ? baseEnv : { ...baseEnv, SAYS_STAKE_LIVE: value },
        fetchImpl: mockFetch({
          '/api/v1/after-create': { can_verify: true, can_bind: false, can_stake: true, can_rate_models: false },
          '/api/v1/hal/honesty-a': { status: 'counted', rows: [{ family: 'glm', host: 'cerebras', TRUE: 1, FALSE: 0, NOT_CHECKED: 0 }] },
          '/readiness': { exact_true: { HUMAN_AGENT_BIND_ENABLED: false } },
        }),
      });

      expect(text).toContain('can_stake shadow — not live');
      expect(text).not.toMatch(/can_stake\s+live\b/);
    }
  });
});
