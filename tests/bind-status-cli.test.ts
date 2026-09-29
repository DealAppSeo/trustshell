/**
 * trustshell bind-status reads after-create. can_stake true prints shadow, never live.
 */
import { parseArgs, run, type CliIO } from '../src/cli';

const ENGINE = 'https://engine.test';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('bind-status', () => {
  const prevOffline = process.env.OFFLINE;
  const prevUrl = process.env.TRUSTSHELL_API_URL;
  const prevStake = process.env.SAYS_STAKE_LIVE;
  const prevFetch = global.fetch;

  afterEach(() => {
    global.fetch = prevFetch;
    if (prevOffline === undefined) delete process.env.OFFLINE;
    else process.env.OFFLINE = prevOffline;
    if (prevUrl === undefined) delete process.env.TRUSTSHELL_API_URL;
    else process.env.TRUSTSHELL_API_URL = prevUrl;
    if (prevStake === undefined) delete process.env.SAYS_STAKE_LIVE;
    else process.env.SAYS_STAKE_LIVE = prevStake;
  });

  async function runStatus(body: unknown, status = 200): Promise<string> {
    process.env.TRUSTSHELL_API_URL = ENGINE;
    process.env.SAYS_STAKE_LIVE = '1';
    delete process.env.OFFLINE;
    global.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/v1/after-create')) return jsonResponse(status, body);
      return jsonResponse(404, {});
    }) as typeof fetch;
    const out: string[] = [];
    const io: CliIO = { out: (s) => out.push(s), err: () => undefined };
    const code = await run(parseArgs(['bind-status']), {} as never, io);
    expect(code).toBe(0);
    return out.join('\n');
  }

  it('prints can_bind and keeps a true stake in shadow', async () => {
    const text = await runStatus({
      status: 'counted',
      can_bind: true,
      can_stake: true,
    });
    expect(text).toBe('can_bind true\ncan_stake shadow — not live');
    expect(text).not.toMatch(/can_stake live|stake live|stake now/i);
    expect(text).not.toMatch(/\b0\b/);
  });

  it('a 503 is NOT_CHECKED, never live', async () => {
    const text = await runStatus({ error: 'down' }, 503);
    expect(text).toBe('can_bind NOT_CHECKED\ncan_stake NOT_CHECKED');
    expect(text).not.toMatch(/live|stake now/i);
  });
});
