/**
 * verify --json omits a missing post_hal and never prints 0.
 */
import { parseArgs, run, type CliIO } from '../src/cli';
import { postHalValue } from '../src/cli/status';
import { TrustShell } from '../src/lib/trustshell';

const ENGINE = 'https://engine.test';
const CLAIM = 'paste-your-own-claim-9f3c';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('verify --json post_hal', () => {
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
    expect(postHalValue(null)).toBeUndefined();
    expect(postHalValue({ status: 'counted', rows: [{ family: 'glm', host: 'cerebras' }] })).toBeUndefined();
    expect(postHalValue({ status: 'counted', post_hal_verdict: 0 })).toBe('NOT_CHECKED');
    expect(JSON.stringify({ post_hal: postHalValue({ post_hal_verdict: 0 }) })).not.toMatch(/"post_hal"\s*:\s*0\b/);
  });

  it('prints TRUE when the column is present', () => {
    expect(postHalValue({
      status: 'counted',
      rows: [{ post_hal_verdict: 'TRUE' }],
    })).toBe('TRUE');
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

  it('omits post_hal on verify --json when the column is missing', async () => {
    const { code, raw, body } = await verify({
      status: 'counted',
      rows: [{ family: 'glm', host: 'cerebras', TRUE: 4, FALSE: 1, NOT_CHECKED: 2 }],
    });
    expect(code).toBe(0);
    expect(Object.prototype.hasOwnProperty.call(body, 'post_hal')).toBe(false);
    expect(raw).not.toMatch(/"post_hal"\s*:\s*0\b/);
    expect(body.receipt_written).not.toBe(0);
    expect(raw).not.toContain(CLAIM);
  });

  it('prints post_hal TRUE and does not print 0', async () => {
    const { code, raw, body } = await verify({
      status: 'counted',
      rows: [{ family: 'glm', host: 'cerebras', post_hal_verdict: 'TRUE' }],
    });
    expect(code).toBe(0);
    expect(body.post_hal).toBe('TRUE');
    expect(raw).not.toMatch(/"post_hal"\s*:\s*0\b/);
  });
});
