/**
 * After verify, print one line: family host verdict.
 * A missing family or host is NOT_CHECKED. Never Paris, stake, or HeyGen.
 */
import { parseArgs, run, type CliIO } from '../src/cli';
import { familyHostVerdictLine } from '../src/cli/status';
import { TrustShell } from '../src/lib/trustshell';

const ENGINE = 'https://engine.test';

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

function installFetch(honesty: unknown, decision: 'clean' | 'flagged' | 'vetoed'): void {
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    if (method === 'POST' && url.endsWith('/api/v1/hal/evaluate')) {
      return jsonResponse(200, {
        decision,
        hal_score: decision === 'vetoed' ? 0.9 : 0.2,
        mode: 'fact-check',
        signals: { families_used: 1, providers_used: 1 },
        provider_responses: [{ provider: 'glm', verdict: decision === 'vetoed' ? 'FALSE' : 'TRUE', note: 'counted' }],
      });
    }
    if (url.endsWith('/api/v1/hal/honesty-a')) return jsonResponse(200, honesty);
    return jsonResponse(404, {});
  }) as typeof fetch;
}

describe('verify family host verdict', () => {
  const prevUrl = process.env.TRUSTSHELL_API_URL;
  const prevOffline = process.env.OFFLINE;
  const prevFetch = global.fetch;

  beforeEach(() => {
    process.env.TRUSTSHELL_API_URL = ENGINE;
    delete process.env.OFFLINE;
  });

  afterEach(() => {
    global.fetch = prevFetch;
    if (prevUrl === undefined) delete process.env.TRUSTSHELL_API_URL;
    else process.env.TRUSTSHELL_API_URL = prevUrl;
    if (prevOffline === undefined) delete process.env.OFFLINE;
    else process.env.OFFLINE = prevOffline;
  });

  it('prints one line of family, host, and verdict', async () => {
    const honesty = { status: 'counted', rows: [{ family: 'glm', host: 'cerebras', TRUE: 1, FALSE: 0, NOT_CHECKED: 0 }] };
    installFetch(honesty, 'clean');
    const cap = capture();
    const code = await run(parseArgs(['verify', 'the claim you typed']), new TrustShell({ apiUrl: ENGINE }), cap.io);
    const text = cap.out.join('\n');
    expect(code).toBe(0);
    expect(text.split('\n').filter((line) => line === 'glm cerebras PASS')).toEqual(['glm cerebras PASS']);
    expect(text).not.toMatch(/\bParis\b|\bstake\b|HeyGen/i);
  });

  it('prints NOT_CHECKED when family or host is missing', async () => {
    installFetch({ status: 'counted', rows: [{ family: 'glm' }] }, 'flagged');
    const cap = capture();
    await run(parseArgs(['verify', 'the claim you typed']), new TrustShell({ apiUrl: ENGINE }), cap.io);
    expect(cap.out.join('\n').split('\n').filter((line) => line === 'NOT_CHECKED')).toEqual(['NOT_CHECKED']);
  });

  it('uses the verdict from this check', () => {
    const body = { rows: [{ family: 'glm', host: 'cerebras' }] };
    expect(familyHostVerdictLine(body, 'VETO')).toBe('glm cerebras VETO');
    expect(familyHostVerdictLine(null, 'PASS')).toBe('NOT_CHECKED');
  });
});
