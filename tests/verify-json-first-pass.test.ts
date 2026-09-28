/**
 * verify --json prints a missing first_pass as NOT_CHECKED, never 0.
 */
import { parseArgs, run, type CliIO } from '../src/cli';
import { TrustShell } from '../src/lib/trustshell';

const ENGINE = 'https://engine.test';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('verify --json first_pass', () => {
  const prevUrl = process.env.TRUSTSHELL_API_URL;
  const prevOffline = process.env.OFFLINE;
  const prevFetch = global.fetch;

  afterEach(() => {
    global.fetch = prevFetch;
    if (prevUrl === undefined) delete process.env.TRUSTSHELL_API_URL;
    else process.env.TRUSTSHELL_API_URL = prevUrl;
    if (prevOffline === undefined) delete process.env.OFFLINE;
    else process.env.OFFLINE = prevOffline;
  });

  it('omits a counted zero when first_pass is missing', async () => {
    process.env.TRUSTSHELL_API_URL = ENGINE;
    delete process.env.OFFLINE;
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'POST' && url.endsWith('/api/v1/hal/evaluate')) {
        return jsonResponse({
          decision: 'clean',
          hal_score: 0.2,
          mode: 'fact-check',
          signals: { families_used: 2, providers_used: 2 },
          provider_responses: [],
        });
      }
      if (url.endsWith('/api/v1/hal/honesty-a')) {
        return jsonResponse({
          status: 'counted',
          rows: [{ family: 'glm', host: 'cerebras', TRUE: 4, FALSE: 1, NOT_CHECKED: 2 }],
        });
      }
      return jsonResponse({});
    }) as typeof fetch;

    const out: string[] = [];
    const io: CliIO = { out: (s) => out.push(s), err: () => undefined };
    const code = await run(
      parseArgs(['verify', 'Paris is in France', '--json']),
      new TrustShell({ apiUrl: ENGINE }),
      io,
    );
    expect(code).toBe(0);
    const raw = out.join('\n');
    const body = JSON.parse(raw) as { firstPass?: unknown };
    expect(body.firstPass).toBe('first-pass NOT_CHECKED');
    expect(raw).not.toMatch(/"firstPass"\s*:\s*0\b/);
    expect(raw).not.toMatch(/"first_pass"\s*:\s*0\b/);
  });
});
