/**
 * verify --json adds first_pass only when the count is present.
 * Missing is omitted, never 0.
 */
import { parseArgs, run, type CliIO } from '../src/cli';
import { firstPassObject } from '../src/cli/status';
import { TrustShell } from '../src/lib/trustshell';

const ENGINE = 'https://engine.test';
const CLAIM = 'paste-your-own-claim-9f3c';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body == null ? null : JSON.stringify(body), {
    status,
    headers: body == null ? undefined : { 'content-type': 'application/json' },
  });
}

describe('verify --json first_pass object', () => {
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
    expect(firstPassObject(null)).toBeUndefined();
    expect(firstPassObject({ status: 'counted', first_pass: 0 })).toBeUndefined();
    expect(firstPassObject({
      status: 'counted',
      rows: [{ family: 'glm', host: 'cerebras', TRUE: 4, FALSE: 1, NOT_CHECKED: 2 }],
    })).toBeUndefined();
    expect(firstPassObject({ status: 'missing' })).toBeUndefined();
  });

  it('prints the counted object and keeps a real inner zero', () => {
    expect(firstPassObject({
      status: 'counted',
      rows: [{ first_pass: { TRUE: 4, FALSE: 0, NOT_CHECKED: 2 } }],
    })).toEqual({ true: 4, false: 0, not_checked: 2 });
  });

  it('adds first_pass on verify --json when the row counted it', async () => {
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
          rows: [{
            family: 'glm',
            host: 'cerebras',
            first_pass: { TRUE: 4, FALSE: 1, NOT_CHECKED: 2 },
          }],
        });
      }
      if (method === 'POST' && url.endsWith('/api/v1/hal/receipt')) {
        return jsonResponse(200, { written: true });
      }
      return jsonResponse(404, {});
    }) as typeof fetch;

    const out: string[] = [];
    const io: CliIO = { out: (s) => out.push(s), err: () => undefined };
    const code = await run(parseArgs(['verify', CLAIM, '--json']), new TrustShell({ apiUrl: ENGINE }), io);
    expect(code).toBe(0);
    const raw = out.join('\n');
    const body = JSON.parse(raw) as Record<string, unknown>;
    expect(body.receipt_written).toBe(true);
    expect(body.family_host_verdict).toBe('glm cerebras PASS');
    expect(body.first_pass).toEqual({ true: 4, false: 1, not_checked: 2 });
    expect(body.firstPass).toBe('first-pass glm cerebras TRUE 4 FALSE 1 NOT_CHECKED 2');
    expect(raw.indexOf('"receipt_written"')).toBeLessThan(raw.indexOf('"family_host_verdict"'));
    expect(raw).not.toMatch(/"first_pass"\s*:\s*0\b/);
    expect(raw).not.toContain(CLAIM);
  });

  it('omits first_pass when the counted row has no nested count', async () => {
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'POST' && url.endsWith('/api/v1/hal/evaluate')) {
        return jsonResponse(200, {
          decision: 'clean',
          hal_score: 0.2,
          mode: 'fact-check',
          signals: { families_used: 2, providers_used: 2 },
          provider_responses: [],
        });
      }
      if (url.endsWith('/api/v1/hal/honesty-a')) {
        return jsonResponse(200, {
          status: 'counted',
          rows: [{ family: 'glm', host: 'cerebras', TRUE: 4, FALSE: 1, NOT_CHECKED: 2 }],
        });
      }
      return jsonResponse(404, {});
    }) as typeof fetch;

    const out: string[] = [];
    const io: CliIO = { out: (s) => out.push(s), err: () => undefined };
    const code = await run(parseArgs(['verify', CLAIM, '--json']), new TrustShell({ apiUrl: ENGINE }), io);
    expect(code).toBe(0);
    const raw = out.join('\n');
    const body = JSON.parse(raw) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(body, 'first_pass')).toBe(false);
    expect(body.firstPass).toBe('first-pass NOT_CHECKED');
    expect(raw).not.toMatch(/"first_pass"\s*:\s*0\b/);
    expect(body.receipt_written).not.toBe(0);
  });
});
