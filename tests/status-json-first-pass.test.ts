/**
 * trustshell status --json. A missing first_pass is omitted, never 0.
 */
import { parseArgs, run, type CliIO } from '../src/cli';
import { TrustShell } from '../src/lib/trustshell';

const ENGINE = 'https://engine.test';

const MISSING = {
  status: 'counted',
  rows: [{ family: 'glm', host: 'cerebras', TRUE: 4, FALSE: 1, NOT_CHECKED: 2 }],
};

const COUNTED = {
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

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function installFetch(honesty: unknown): void {
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    if (method === 'POST' && url.endsWith('/api/v1/hal/evaluate')) {
      return jsonResponse(200, { decision: 'clean', hal_score: 0.2 });
    }
    if (url.endsWith('/api/v1/hal/honesty-a')) return jsonResponse(200, honesty);
    if (url.endsWith('/api/v1/after-create')) {
      return jsonResponse(200, { can_verify: true, can_stake: true, can_rate_models: false });
    }
    if (url.endsWith('/readiness')) {
      return jsonResponse(200, { flags: { HUMAN_AGENT_BIND_ENABLED: 'on' }, exact_true: { REAL_STAKING_ENABLED: false } });
    }
    return jsonResponse(404, {});
  }) as typeof fetch;
}

describe('status --json first_pass', () => {
  const prevOffline = process.env.OFFLINE;
  const prevUrl = process.env.TRUSTSHELL_API_URL;
  const prevStake = process.env.SAYS_STAKE_LIVE;
  const prevFetch = global.fetch;

  beforeEach(() => {
    process.env.TRUSTSHELL_API_URL = ENGINE;
    delete process.env.OFFLINE;
    delete process.env.SAYS_STAKE_LIVE;
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

  async function statusJson(honesty: unknown): Promise<{ raw: string; body: Record<string, unknown> }> {
    installFetch(honesty);
    const out: string[] = [];
    const io: CliIO = { out: (s) => out.push(s), err: () => undefined };
    const code = await run(parseArgs(['status', '--json']), new TrustShell({ apiUrl: ENGINE }), io);
    expect(code).toBe(0);
    const raw = out.join('\n');
    return { raw, body: JSON.parse(raw) as Record<string, unknown> };
  }

  it('omits a missing first_pass and never prints 0', async () => {
    const { raw, body } = await statusJson(MISSING);
    expect(Object.prototype.hasOwnProperty.call(body, 'first_pass')).toBe(false);
    expect(raw).not.toMatch(/"first_pass"\s*:\s*0\b/);
    expect(raw).not.toMatch(/"firstPass"\s*:\s*0\b/);
    expect(body.honesty_a).toBe('glm cerebras TRUE 4 FALSE 1 NOT_CHECKED 2');
    expect(body.can_stake).toBe('shadow — not live');
    expect(body.can_stake).not.toBe('live');
    expect(raw).not.toMatch(/stake now/i);
    expect(body.can_bind).toBe('NOT_CHECKED');
  });

  it('keeps a counted first_pass, including a real zero, as text', async () => {
    const { raw, body } = await statusJson(COUNTED);
    expect(body.first_pass).toBe('glm cerebras TRUE 0 FALSE 1 NOT_CHECKED 2');
    expect(typeof body.first_pass).toBe('string');
    expect(raw).not.toMatch(/"first_pass"\s*:\s*0\b/);
    expect(body.can_stake).toBe('shadow — not live');
    expect(String(body.can_stake)).not.toMatch(/stake now/i);
  });
});
