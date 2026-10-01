/**
 * verify --json omits a missing honesty_rows count and never prints 0.
 * A counted empty list is a real 0.
 */
import { parseArgs, run, type CliIO } from '../src/cli';
import { honestyRowsValue } from '../src/cli/status';
import { TrustShell } from '../src/lib/trustshell';

const ENGINE = 'https://engine.test';
const CLAIM = 'paste-your-own-claim-9f3c';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('verify --json honesty_rows', () => {
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

  it('omits a missing count and never prints 0', () => {
    expect(honestyRowsValue(null)).toBeUndefined();
    expect(honestyRowsValue({ status: 'counted' })).toBeUndefined();
    expect(honestyRowsValue({ status: 'missing', rows: [] })).toBeUndefined();
    const printed = JSON.stringify({ honesty_rows: honestyRowsValue({ status: 'missing', rows: [] }) });
    expect(printed).not.toMatch(/"honesty_rows"\s*:\s*0\b/);
  });

  it('keeps a counted zero when the rows array is empty', () => {
    expect(honestyRowsValue({ status: 'counted', rows: [] })).toBe(0);
    expect(honestyRowsValue({ status: 'counted', rows: [{ family: 'glm' }, { family: 'qwen' }] })).toBe(2);
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

  it('omits honesty_rows on verify --json when the count is missing', async () => {
    const { code, raw, body } = await verify({ status: 'missing' });
    expect(code).toBe(0);
    expect(Object.prototype.hasOwnProperty.call(body, 'honesty_rows')).toBe(false);
    expect(raw).not.toMatch(/"honesty_rows"\s*:\s*0\b/);
    expect(body.receipt_written).not.toBe(0);
    expect(raw).not.toContain(CLAIM);
  });

  it('prints a counted row total, including a real zero', async () => {
    const counted = await verify({
      status: 'counted',
      rows: [{ family: 'glm', host: 'cerebras' }, { family: 'qwen', host: 'groq' }],
    });
    expect(counted.code).toBe(0);
    expect(counted.body.honesty_rows).toBe(2);
    const empty = await verify({ status: 'counted', rows: [] });
    expect(empty.body.honesty_rows).toBe(0);
    expect(empty.raw).toMatch(/"honesty_rows"\s*:\s*0\b/);
  });
});
