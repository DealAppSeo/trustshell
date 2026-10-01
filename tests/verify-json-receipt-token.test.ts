/**
 * verify --json omits a skipped receipt token and never prints 0.
 */
import { parseArgs, run, type CliIO } from '../src/cli';
import { receiptToken } from '../src/cli/status';
import { TrustShell } from '../src/lib/trustshell';

const ENGINE = 'https://engine.test';
const CLAIM = 'paste-your-own-claim-9f3c';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('verify --json receipt token', () => {
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

  it('omits a skipped receipt and never prints 0', () => {
    expect(receiptToken('skipped')).toBeUndefined();
    expect(receiptToken('columns-missing')).toBe('columns-missing');
    expect(receiptToken('receipt-missing')).toBe('receipt-missing');
    expect(receiptToken('NOT_CHECKED')).toBe('NOT_CHECKED');
    const printed = JSON.stringify({ receipt: receiptToken('skipped') });
    expect(printed).not.toMatch(/"receipt"\s*:\s*0\b/);
  });

  async function verify(offline: boolean): Promise<{ code: number; raw: string; body: Record<string, unknown> }> {
    if (offline) process.env.OFFLINE = '1';
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
      if (url.endsWith('/api/v1/hal/honesty-a')) {
        return jsonResponse(200, { status: 'counted', rows: [{ family: 'glm', host: 'cerebras' }] });
      }
      if (method === 'POST' && url.endsWith('/api/v1/hal/receipt')) return jsonResponse(404, {});
      return jsonResponse(404, {});
    }) as typeof fetch;
    const out: string[] = [];
    const io: CliIO = { out: (s) => out.push(s), err: () => undefined };
    const code = await run(parseArgs(['verify', CLAIM, '--json']), new TrustShell({ apiUrl: ENGINE }), io);
    const raw = out.join('\n');
    return { code, raw, body: JSON.parse(raw) as Record<string, unknown> };
  }

  it('prints receipt-missing and does not print 0', async () => {
    const { code, raw, body } = await verify(false);
    expect(code).toBe(0);
    expect(body.receipt).toBe('receipt-missing');
    expect(body.receipt_written).toBe('NOT_CHECKED');
    expect(raw).not.toMatch(/"receipt"\s*:\s*0\b/);
    expect(raw).not.toContain(CLAIM);
  });

  it('omits the receipt token when OFFLINE=1', async () => {
    const { code, raw, body } = await verify(true);
    expect(code).toBe(0);
    expect(Object.prototype.hasOwnProperty.call(body, 'receipt')).toBe(false);
    expect(raw).not.toMatch(/"receipt"\s*:\s*0\b/);
    expect(body.receipt_written).toBe('NOT_CHECKED');
  });
});
