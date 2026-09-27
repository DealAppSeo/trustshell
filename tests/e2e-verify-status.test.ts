/**
 * trustshell verify and trustshell status against a mocked honesty-a.
 * No live engine. A missing first_pass prints NOT_CHECKED, never 0.
 */
import { parseArgs, run, type CliIO } from '../src/cli';
import { TrustShell } from '../src/lib/trustshell';

const ENGINE = 'https://engine.test';

const HONESTY_MISSING_FIRST_PASS = {
  status: 'counted',
  rows: [{ family: 'glm', host: 'cerebras', TRUE: 4, FALSE: 1, NOT_CHECKED: 2 }],
};

const HONESTY_COUNTED_FIRST_PASS = {
  status: 'counted',
  rows: [
    {
      family: 'glm',
      host: 'cerebras',
      TRUE: 4,
      FALSE: 1,
      NOT_CHECKED: 2,
      first_pass: { TRUE: 0, FALSE: 1, NOT_CHECKED: 2 },
    },
  ],
};

const HONESTY_COUNTED_EMPTY = {
  window_days: 7,
  status: 'counted',
  source: 'hal_quorum_validator_votes',
  writer_enabled: true,
  gap: null,
  rows: [],
};

const COUNTED_LINE = 'first-pass glm cerebras TRUE 0 FALSE 1 NOT_CHECKED 2';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function capture(): { io: CliIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s) => out.push(s), err: (s) => err.push(s) }, out, err };
}

function firstPassLine(text: string): string | undefined {
  return text.split('\n').find((line) => line.startsWith('first-pass'));
}

function installFetch(honesty: unknown = HONESTY_MISSING_FIRST_PASS): void {
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    if (method === 'POST' && url.endsWith('/api/v1/hal/evaluate')) {
      return jsonResponse(200, {
        decision: 'clean',
        hal_score: 0.2,
        mode: 'fact-check',
        signals: { families_used: 2, providers_used: 2, families: ['glm'] },
        provider_responses: [{ provider: 'glm', verdict: 'TRUE', note: 'counted' }],
      });
    }
    if (url.endsWith('/api/v1/hal/honesty-a')) return jsonResponse(200, honesty);
    if (url.endsWith('/api/v1/after-create')) {
      return jsonResponse(200, {
        can_verify: true,
        can_stake: true,
        can_rate_models: false,
      });
    }
    if (url.endsWith('/readiness')) {
      return jsonResponse(200, {
        flags: { HUMAN_AGENT_BIND_ENABLED: 'on' },
        exact_true: { REAL_STAKING_ENABLED: false },
      });
    }
    return jsonResponse(404, { error: url });
  }) as typeof fetch;
}

describe('e2e verify + status against mocked honesty-a', () => {
  const prevOffline = process.env.OFFLINE;
  const prevUrl = process.env.TRUSTSHELL_API_URL;
  const prevStake = process.env.SAYS_STAKE_LIVE;
  const prevFetch = global.fetch;

  beforeEach(() => {
    process.env.TRUSTSHELL_API_URL = ENGINE;
    delete process.env.OFFLINE;
    delete process.env.SAYS_STAKE_LIVE;
    installFetch();
  });

  afterEach(() => {
    global.fetch = prevFetch;
    if (prevOffline === undefined) delete process.env.OFFLINE;
    else process.env.OFFLINE = prevOffline;
    if (prevUrl === undefined) delete process.env.TRUSTSHELL_API_URL;
    else process.env.TRUSTSHELL_API_URL = prevUrl;
    if (prevStake === undefined) delete process.env.SAYS_STAKE_LIVE;
    else process.env.SAYS_STAKE_LIVE = prevStake;
  });

  it('verify runs, and a missing first_pass prints NOT_CHECKED not 0', async () => {
    const client = new TrustShell({ apiUrl: ENGINE });
    const verifyCap = capture();
    const verifyCode = await run(parseArgs(['verify', 'Paris is in France']), client, verifyCap.io);
    const verifyText = verifyCap.out.join('\n');
    expect(verifyCode).toBe(0);
    expect(verifyText).toMatch(/\bPASS\b/);
    expect(firstPassLine(verifyText)).toBe('first-pass NOT_CHECKED');
    expect(firstPassLine(verifyText)).not.toMatch(/\b0\b/);

    const statusCap = capture();
    const statusCode = await run(parseArgs(['status']), client, statusCap.io);
    const text = statusCap.out.join('\n');
    const firstPass = firstPassLine(text);

    expect(statusCode).toBe(0);
    expect(firstPass).toBe('first-pass NOT_CHECKED');
    expect(firstPass).not.toMatch(/\b0\b/);
    expect(text).not.toMatch(/first-pass[^\n]*\b0\b/);
    expect(text).toContain('honesty-a glm cerebras TRUE 4 FALSE 1 NOT_CHECKED 2');
    expect(text).not.toMatch(/post-HAL/);
    expect(text).toContain('can_stake shadow — not live');
    expect(text).not.toMatch(/can_stake live/);
    expect(text).toContain('can_bind NOT_CHECKED');
  });

  it('prints a counted first_pass from honesty-a on verify and status', async () => {
    installFetch(HONESTY_COUNTED_FIRST_PASS);
    const client = new TrustShell({ apiUrl: ENGINE });

    const verifyCap = capture();
    const verifyCode = await run(parseArgs(['verify', 'Paris is in France']), client, verifyCap.io);
    expect(verifyCode).toBe(0);
    expect(verifyCap.out.join('\n')).toContain(COUNTED_LINE);
    expect(verifyCap.out.join('\n')).not.toMatch(/post-HAL/);

    const jsonCap = capture();
    const jsonCode = await run(parseArgs(['verify', 'Paris is in France', '--json']), client, jsonCap.io);
    expect(jsonCode).toBe(0);
    expect(JSON.parse(jsonCap.out.join('\n')).firstPass).toBe(COUNTED_LINE);

    const statusCap = capture();
    const statusCode = await run(parseArgs(['status']), client, statusCap.io);
    const text = statusCap.out.join('\n');
    expect(statusCode).toBe(0);
    expect(text).toContain(COUNTED_LINE);
    expect(text).not.toMatch(/post-HAL/);
    expect(text).toContain('can_stake shadow — not live');
    expect(text).not.toMatch(/can_stake live/);
  });

  it('prints NOT_CHECKED when counted honesty-a has no first_pass rows', async () => {
    installFetch(HONESTY_COUNTED_EMPTY);
    const client = new TrustShell({ apiUrl: ENGINE });

    const verifyCap = capture();
    await run(parseArgs(['verify', 'Paris is in France']), client, verifyCap.io);
    expect(firstPassLine(verifyCap.out.join('\n'))).toBe('first-pass NOT_CHECKED');
    expect(firstPassLine(verifyCap.out.join('\n'))).not.toMatch(/\b0\b/);

    const statusCap = capture();
    await run(parseArgs(['status']), client, statusCap.io);
    const text = statusCap.out.join('\n');
    expect(firstPassLine(text)).toBe('first-pass NOT_CHECKED');
    expect(text).not.toMatch(/first-pass[^\n]*\b0\b/);
    expect(text).toContain('honesty-a NOT_CHECKED');
    expect(text).toContain('can_stake shadow — not live');
  });
});
