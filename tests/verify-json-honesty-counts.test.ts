/**
 * verify --json omits a missing honesty vote count and never prints 0 for it.
 * A real zero inside a complete count is kept.
 */
import { parseArgs, run, type CliIO } from '../src/cli';
import { honestyCountObject } from '../src/cli/status';
import { TrustShell } from '../src/lib/trustshell';

const ENGINE = 'https://engine.test';
const CLAIM = 'paste-your-own-claim-9f3c';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('verify --json honesty_counts', () => {
  const prevUrl = process.env.TRUSTSHELL_API_URL;
  const prevOffline = process.env.OFFLINE;
  const prevFetch = global.fetch;

  beforeEach(() => {
    delete process.env.OFFLINE;
    process.env.TRUSTSHELL_API_URL = ENGINE;
  });

  afterEach(() => {
    global.fetch = prevFetch;
    if (prevUrl === undefined) delete process.env.TRUSTSHELL_API_URL;
    else process.env.TRUSTSHELL_API_URL = prevUrl;
    if (prevOffline === undefined) delete process.env.OFFLINE;
    else process.env.OFFLINE = prevOffline;
  });

  it('omits a missing column and never prints 0', () => {
    expect(honestyCountObject(null)).toBeUndefined();
    expect(honestyCountObject({ status: 'counted', rows: [{ family: 'glm', FALSE: 1, NOT_CHECKED: 2 }] })).toBeUndefined();
    expect(honestyCountObject({ status: 'counted', rows: [{ TRUE: 0 }] })).toBeUndefined();
    const printed = JSON.stringify({ honesty_counts: honestyCountObject({ status: 'counted', rows: [{ TRUE: 0 }] }) });
    expect(printed).not.toMatch(/"honesty_counts"\s*:\s*0\b/);
  });

  it('keeps a real zero when every column is present', () => {
    expect(honestyCountObject({
      status: 'counted',
      rows: [{ TRUE: 4, FALSE: 0, NOT_CHECKED: 2 }],
    })).toEqual({ true: 4, false: 0, not_checked: 2 });
  });

  async function verify(honesty: unknown): Promise<{ code: number; raw: string; body: Record<string, unknown> }> {
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'POST' && url.endsWith('/api/v1/hal/evaluate')) {
        return jsonResponse(200, {
          decision: 'clean',
          hal_score: 0.2,
          mode: 'fact-check',
          signals: { families_used: 1, providers_used: 1 },
          provider_responses: [],
        });
      }
      if (url.endsWith('/api/v1/hal/honesty-a')) return jsonResponse(200, honesty);
      if (method === 'POST' && url.endsWith('/api/v1/hal/receipt')) return jsonResponse(200, { written: true });
      return jsonResponse(404, {});
    }) as typeof fetch;
    const out: string[] = [];
    const io: CliIO = { out: (s) => out.push(s), err: () => undefined };
    const code = await run(parseArgs(['verify', CLAIM, '--json']), new TrustShell({ apiUrl: ENGINE }), io);
    const raw = out.join('\n');
    return { code, raw, body: JSON.parse(raw) as Record<string, unknown> };
  }

  it('omits honesty_counts on verify --json when a column is missing', async () => {
    const { code, raw, body } = await verify({
      status: 'counted',
      rows: [{ family: 'glm', host: 'cerebras', FALSE: 1, NOT_CHECKED: 2 }],
    });
    expect(code).toBe(0);
    expect(Object.prototype.hasOwnProperty.call(body, 'honesty_counts')).toBe(false);
    expect(raw).not.toMatch(/"honesty_counts"\s*:\s*0\b/);
    expect(raw).not.toContain(CLAIM);
  });

  it('prints the counted object, including a real zero', async () => {
    const { code, raw, body } = await verify({
      status: 'counted',
      rows: [{ family: 'glm', host: 'cerebras', TRUE: 4, FALSE: 0, NOT_CHECKED: 2 }],
    });
    expect(code).toBe(0);
    expect(body.honesty_counts).toEqual({ true: 4, false: 0, not_checked: 2 });
    expect(raw).not.toMatch(/"honesty_counts"\s*:\s*0\b/);
  });
});
