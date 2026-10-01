/**
 * verify --json omits a missing first_pass key.
 * OFFLINE=1 prints NOT_CHECKED and does not print PASS.
 * Both paths assert the exit code.
 */
import { parseArgs, run, type CliIO } from '../src/cli';
import { TrustShell } from '../src/lib/trustshell';

const ENGINE = 'https://engine.test';
const CLAIM = 'paste-your-own-claim-9f3c';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('verify --json offline', () => {
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

  async function verifyJson(): Promise<{ code: number; raw: string; body: Record<string, unknown> }> {
    const out: string[] = [];
    const io: CliIO = { out: (s) => out.push(s), err: () => undefined };
    const code = await run(parseArgs(['verify', CLAIM, '--json']), new TrustShell({ apiUrl: ENGINE }), io);
    const raw = out.join('\n');
    return { code, raw, body: JSON.parse(raw) as Record<string, unknown> };
  }

  it('omits a missing first_pass key and never prints 0', async () => {
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
        return jsonResponse(200, {
          status: 'counted',
          rows: [{ family: 'glm', host: 'cerebras' }],
        });
      }
      return jsonResponse(404, {});
    }) as typeof fetch;

    const { code, raw, body } = await verifyJson();
    expect(code).toBe(0);
    expect(Object.prototype.hasOwnProperty.call(body, 'first_pass')).toBe(false);
    expect(raw).not.toMatch(/"first_pass"\s*:\s*0\b/);
    expect(body.receipt_written).not.toBe(0);
  });

  it('OFFLINE=1 is NOT_CHECKED, not PASS', async () => {
    process.env.OFFLINE = '1';
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'POST' && url.endsWith('/api/v1/hal/evaluate')) {
        return jsonResponse(200, {
          decision: 'clean',
          hal_score: 0.1,
          mode: 'fact-check',
          signals: { families_used: 1, providers_used: 1, families: ['glm'] },
          provider_responses: [{ provider: 'glm', verdict: 'TRUE', note: 'counted' }],
        });
      }
      if (method === 'POST' && url.endsWith('/api/v1/hal/receipt')) {
        return jsonResponse(200, { written: true });
      }
      if (url.endsWith('/api/v1/hal/honesty-a')) {
        return jsonResponse(200, {
          status: 'counted',
          rows: [{ family: 'glm', host: 'cerebras', first_pass: { TRUE: 1, FALSE: 0, NOT_CHECKED: 0 } }],
        });
      }
      return jsonResponse(404, {});
    }) as typeof fetch;

    const { code, raw, body } = await verifyJson();
    expect(code).toBe(0);
    expect(raw).toContain('NOT_CHECKED');
    expect(raw).not.toMatch(/\bPASS\b/);
    expect(body.receipt_written).toBe('NOT_CHECKED');
    expect(body.family_host_verdict).toBe('NOT_CHECKED');
    expect(Object.prototype.hasOwnProperty.call(body, 'first_pass')).toBe(false);
    expect(raw).not.toMatch(/"first_pass"\s*:\s*0\b/);
    expect(raw).not.toContain(CLAIM);
  });
});
