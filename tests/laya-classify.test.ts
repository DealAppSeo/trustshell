/**
 * Laya classifies a claim before HAL. Local text only.
 * cheap skips HAL. escalate keeps the quorum. ask exits 4.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs, run, EXIT, type CliIO } from '../src/cli';
import { classify } from '../src/cli/classify';
import { TrustShell } from '../src/lib/trustshell';

const ENGINE = 'https://engine.test';
const PARIS = 'The capital of France is Paris.';

function capture(): { io: CliIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s) => out.push(s), err: (s) => err.push(s) }, out, err };
}

describe('laya classify', () => {
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

  it('classifies ok as cheap and the Paris sentence as escalate', () => {
    expect(classify('ok')).toBe('cheap');
    expect(classify(PARIS)).toBe('escalate');
    expect(classify('Is this true?')).toBe('ask');
  });

  it('does not call a paid API from classify.ts', () => {
    const src = readFileSync(join(__dirname, '../src/cli/classify.ts'), 'utf8');
    expect(src).not.toMatch(/fetch\(|openai|anthropic|generativelanguage|https:\/\/|process\.env/i);
    expect(src).not.toMatch(/^import /m);
  });

  it('skips HAL for ok and prints receipt_written false', async () => {
    const calls: string[] = [];
    global.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      throw new Error('HAL called');
    }) as typeof fetch;
    const client = {
      verifyOutput: async () => {
        throw new Error('HAL called');
      },
    } as unknown as TrustShell;

    const human = capture();
    const humanCode = await run(parseArgs(['verify', 'ok']), client, human.io);
    expect(humanCode).toBe(EXIT.OK);
    expect(human.out).toEqual(['laya cheap NOT_CHECKED']);
    expect(calls).toEqual([]);

    const json = capture();
    const jsonCode = await run(parseArgs(['verify', 'ok', '--json']), client, json.io);
    expect(jsonCode).toBe(EXIT.OK);
    const raw = json.out.join('\n');
    const body = JSON.parse(raw) as Record<string, unknown>;
    expect(body.receipt_written).toBe(false);
    expect(typeof body.receipt_written).toBe('boolean');
    expect(body.family_host_verdict).toBe('laya cheap NOT_CHECKED');
    expect(body).not.toHaveProperty('claim');
    expect(raw).not.toMatch(/"receipt_written"\s*:\s*0\b/);
    expect(raw).not.toMatch(/"first_pass"\s*:\s*0\b/);
    expect(calls).toEqual([]);
  });

  it('prints ASK and exits 4 without calling HAL', async () => {
    const calls: string[] = [];
    global.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      throw new Error('HAL called');
    }) as typeof fetch;
    const client = {
      verifyOutput: async () => {
        throw new Error('HAL called');
      },
    } as unknown as TrustShell;
    const cap = capture();
    const code = await run(parseArgs(['verify', 'Is this true?']), client, cap.io);
    expect(code).toBe(4);
    expect(code).toBe(EXIT.ASK);
    expect(cap.out).toEqual(['ASK']);
    expect(calls).toEqual([]);
  });

  it('keeps the Paris sentence on the existing quorum', async () => {
    const calls: string[] = [];
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      calls.push(`${method} ${url}`);
      if (method === 'POST' && url.endsWith('/api/v1/hal/evaluate')) {
        return new Response(JSON.stringify({
          decision: 'clean',
          hal_score: 0.1,
          mode: 'fact-check',
          signals: { families_used: 1, providers_used: 1 },
          provider_responses: [{ provider: 'glm', verdict: 'TRUE', note: 'counted' }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 404, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const cap = capture();
    const code = await run(parseArgs(['verify', PARIS]), new TrustShell({ apiUrl: ENGINE }), cap.io);
    expect(code).toBe(EXIT.OK);
    expect(calls.some((line) => line.startsWith('POST ') && line.includes('/api/v1/hal/evaluate'))).toBe(true);
    expect(cap.out.join('\n')).not.toContain('laya cheap');
    expect(cap.out.join('\n')).not.toBe('ASK');
  });
});
