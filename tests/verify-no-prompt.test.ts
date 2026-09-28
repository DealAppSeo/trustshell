/**
 * Two mocked verify calls back to back. No human prompt.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs, run, type CliIO } from '../src/cli';
import { TrustShell } from '../src/lib/trustshell';

const ENGINE = 'https://engine.test';
const cli = readFileSync(join(__dirname, '../src/cli/index.ts'), 'utf8');

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('verify back to back', () => {
  const prevOffline = process.env.OFFLINE;
  const prevUrl = process.env.TRUSTSHELL_API_URL;
  const prevFetch = global.fetch;

  afterEach(() => {
    global.fetch = prevFetch;
    if (prevOffline === undefined) delete process.env.OFFLINE;
    else process.env.OFFLINE = prevOffline;
    if (prevUrl === undefined) delete process.env.TRUSTSHELL_API_URL;
    else process.env.TRUSTSHELL_API_URL = prevUrl;
  });

  it('does not prompt a human', async () => {
    expect(cli).not.toMatch(/readline|createInterface|prompt\(/);
    process.env.TRUSTSHELL_API_URL = ENGINE;
    delete process.env.OFFLINE;
    const posts: string[] = [];
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'POST' && url.endsWith('/api/v1/hal/evaluate')) {
        posts.push(url);
        return jsonResponse({
          decision: 'clean',
          hal_score: 0.2,
          mode: 'fact-check',
          signals: { families_used: 2, providers_used: 2, families: ['glm'] },
          provider_responses: [{ provider: 'glm', verdict: 'TRUE', note: 'counted' }],
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

    const client = new TrustShell({ apiUrl: ENGINE });
    const out: string[] = [];
    const err: string[] = [];
    const io: CliIO = { out: (s) => out.push(s), err: (s) => err.push(s) };
    const first = await run(parseArgs(['verify', 'Paris is in France']), client, io);
    const second = await run(parseArgs(['verify', 'Paris is in France']), client, io);
    const text = [...out, ...err].join('\n');

    expect(first).toBe(0);
    expect(second).toBe(0);
    expect(posts).toHaveLength(2);
    expect(text).toMatch(/\bPASS\b/);
    expect(text).toContain('first-pass NOT_CHECKED');
    expect(text).not.toMatch(/are you sure|press enter|\[y\/n\]|readline|createInterface/i);
    expect(text).not.toMatch(/stake now/i);
  });
});
