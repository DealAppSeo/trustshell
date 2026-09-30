/**
 * After verify, a set TRUSTSHELL_API_URL adds one honesty-a line.
 * Timeout or non-200 is NOT_CHECKED, not rows=0.
 */
import { parseArgs, run, type CliIO } from '../src/cli';
import { honestyRowsLine } from '../src/cli/status';
import { TrustShell } from '../src/lib/trustshell';

const ENGINE = 'https://engine.test';
const LINE = 'honesty-a rows=2 status=counted';
const MISSING = 'honesty-a rows=NOT_CHECKED status=NOT_CHECKED';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function capture(): { io: CliIO; out: string[] } {
  const out: string[] = [];
  return { io: { out: (s) => out.push(s), err: () => undefined }, out };
}

describe('verify honesty-a row line', () => {
  const prevUrl = process.env.TRUSTSHELL_API_URL;
  const prevOffline = process.env.OFFLINE;
  const prevFetch = global.fetch;

  beforeEach(() => {
    delete process.env.OFFLINE;
  });

  afterEach(() => {
    global.fetch = prevFetch;
    if (prevUrl === undefined) delete process.env.TRUSTSHELL_API_URL;
    else process.env.TRUSTSHELL_API_URL = prevUrl;
    if (prevOffline === undefined) delete process.env.OFFLINE;
    else process.env.OFFLINE = prevOffline;
  });

  it('prints rows and counted when the body is counted', async () => {
    process.env.TRUSTSHELL_API_URL = ENGINE;
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'POST' && url.endsWith('/api/v1/hal/evaluate')) {
        return jsonResponse(200, {
          decision: 'clean',
          hal_score: 0.1,
          mode: 'fact-check',
          signals: { families_used: 1, providers_used: 1 },
          provider_responses: [{ provider: 'glm', verdict: 'TRUE', note: 'counted' }],
        });
      }
      if (url.endsWith('/api/v1/hal/honesty-a')) {
        return jsonResponse(200, {
          status: 'counted',
          rows: [
            { family: 'glm', host: 'cerebras' },
            { family: 'qwen', host: 'together' },
          ],
        });
      }
      return jsonResponse(404, {});
    }) as typeof fetch;

    const cap = capture();
    const code = await run(parseArgs(['verify', 'the claim you typed']), new TrustShell({ apiUrl: ENGINE }), cap.io);
    const lines = cap.out.join('\n').split('\n').filter((line) => line.startsWith('honesty-a rows='));
    expect(code).toBe(0);
    expect(lines).toEqual([LINE]);
    expect(cap.out.join('\n')).not.toMatch(/HeyGen|\bstake\b/i);
  });

  it('prints NOT_CHECKED on non-200, never rows=0', async () => {
    process.env.TRUSTSHELL_API_URL = ENGINE;
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'POST' && url.endsWith('/api/v1/hal/evaluate')) {
        return jsonResponse(200, {
          decision: 'clean',
          hal_score: 0.1,
          mode: 'fact-check',
          signals: {},
          provider_responses: [{ provider: 'glm', verdict: 'TRUE', note: 'counted' }],
        });
      }
      if (url.endsWith('/api/v1/hal/honesty-a')) return jsonResponse(503, {});
      return jsonResponse(404, {});
    }) as typeof fetch;

    const cap = capture();
    await run(parseArgs(['verify', 'the claim you typed']), new TrustShell({ apiUrl: ENGINE }), cap.io);
    const text = cap.out.join('\n');
    expect(text.split('\n').filter((line) => line.startsWith('honesty-a rows='))).toEqual([MISSING]);
    expect(text).not.toMatch(/honesty-a rows=0/);
  });

  it('omits the line when TRUSTSHELL_API_URL is unset', async () => {
    delete process.env.TRUSTSHELL_API_URL;
    global.fetch = (async () => {
      throw new Error('offline');
    }) as typeof fetch;
    const cap = capture();
    await run(parseArgs(['verify', 'the claim you typed']), new TrustShell({ apiUrl: ENGINE }), cap.io);
    expect(cap.out.join('\n')).not.toContain('honesty-a rows=');
  });

  it('does not turn a timeout into rows=0', () => {
    expect(honestyRowsLine(null)).toBe(MISSING);
    expect(honestyRowsLine({ status: 'counted', rows: [] })).toBe('honesty-a rows=0 status=counted');
  });
});
