/**
 * TRUSTSHELL_LAYA selects the lane before HAL.
 * Unset stays on the quorum. local uses the hook. engine calls classify.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs, run, EXIT, type CliIO } from '../src/cli';
import { classify } from '../src/cli/classify';
import { layaRecords } from '../src/laya/hook';
import { TrustShell } from '../src/lib/trustshell';

const ENGINE = 'https://engine.test';
const PARIS = 'The capital of France is Paris.';

function capture(): { io: CliIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s) => out.push(s), err: (s) => err.push(s) }, out, err };
}

function evaluateResponse(): Response {
  return new Response(JSON.stringify({
    decision: 'clean',
    hal_score: 0.1,
    mode: 'fact-check',
    signals: { families_used: 1, providers_used: 1 },
    provider_responses: [{ provider: 'glm', verdict: 'TRUE', note: 'counted' }],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

function classifyResponse(lane: string): Response {
  return new Response(JSON.stringify({ classify: lane }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('laya classify', () => {
  const prevUrl = process.env.TRUSTSHELL_API_URL;
  const prevOffline = process.env.OFFLINE;
  const prevLaya = process.env.TRUSTSHELL_LAYA;
  const prevFetch = global.fetch;

  beforeEach(() => {
    process.env.TRUSTSHELL_API_URL = ENGINE;
    delete process.env.OFFLINE;
    delete process.env.TRUSTSHELL_LAYA;
  });

  afterEach(() => {
    global.fetch = prevFetch;
    if (prevUrl === undefined) delete process.env.TRUSTSHELL_API_URL;
    else process.env.TRUSTSHELL_API_URL = prevUrl;
    if (prevOffline === undefined) delete process.env.OFFLINE;
    else process.env.OFFLINE = prevOffline;
    if (prevLaya === undefined) delete process.env.TRUSTSHELL_LAYA;
    else process.env.TRUSTSHELL_LAYA = prevLaya;
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

  it('unset TRUSTSHELL_LAYA keeps ok on the existing quorum', async () => {
    const calls: string[] = [];
    const before = layaRecords().length;
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      calls.push(`${method} ${url}`);
      if (method === 'POST' && url.endsWith('/api/v1/hal/evaluate')) return evaluateResponse();
      return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const cap = capture();
    const code = await run(parseArgs(['verify', 'ok']), new TrustShell({ apiUrl: ENGINE }), cap.io);
    expect(code).toBe(EXIT.OK);
    expect(calls.some((line) => line.includes('/api/v1/hal/evaluate'))).toBe(true);
    expect(calls.some((line) => line.includes('/api/v1/laya/classify'))).toBe(false);
    expect(cap.out.join('\n')).not.toContain('laya cheap');
    expect(cap.out.join('\n')).not.toBe('ASK');
    expect(layaRecords().length).toBe(before);
  });

  it('local skips HAL for ok and prints receipt_written false', async () => {
    process.env.TRUSTSHELL_LAYA = 'local';
    const before = layaRecords().length;
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
    expect(layaRecords().slice(before).map((row) => row.classify)).toEqual(['cheap']);
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
    expect(calls).toEqual([]);
  });

  it('local prints ASK and exits 4 without calling HAL', async () => {
    process.env.TRUSTSHELL_LAYA = 'local';
    const before = layaRecords().length;
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
    expect(layaRecords().slice(before).map((row) => row.classify)).toEqual(['ask']);
    expect(calls).toEqual([]);
  });

  it('local keeps the Paris sentence on the existing quorum', async () => {
    process.env.TRUSTSHELL_LAYA = 'local';
    const before = layaRecords().length;
    const calls: string[] = [];
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      calls.push(`${method} ${url}`);
      if (method === 'POST' && url.endsWith('/api/v1/hal/evaluate')) return evaluateResponse();
      return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const cap = capture();
    const code = await run(parseArgs(['verify', PARIS]), new TrustShell({ apiUrl: ENGINE }), cap.io);
    expect(code).toBe(EXIT.OK);
    expect(calls.some((line) => line.startsWith('POST ') && line.includes('/api/v1/hal/evaluate'))).toBe(true);
    expect(layaRecords().slice(before).map((row) => row.classify)).toEqual(['escalate']);
    expect(cap.out.join('\n')).not.toContain('laya cheap');
    expect(cap.out.join('\n')).not.toBe('ASK');
  });

  it('engine uses the classify body for cheap, escalate, and ask', async () => {
    process.env.TRUSTSHELL_LAYA = 'engine';
    const seen: Array<{ method: string; url: string; body: string }> = [];
    let lane = 'cheap';
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      seen.push({ method, url, body: typeof init?.body === 'string' ? init.body : '' });
      if (url.endsWith('/api/v1/laya/classify')) return classifyResponse(lane);
      if (method === 'POST' && url.endsWith('/api/v1/hal/evaluate')) return evaluateResponse();
      return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const cheap = capture();
    const cheapCode = await run(parseArgs(['verify', PARIS, '--json']), new TrustShell({ apiUrl: ENGINE }), cheap.io);
    expect(cheapCode).toBe(EXIT.OK);
    const cheapBody = JSON.parse(cheap.out.join('\n')) as Record<string, unknown>;
    expect(cheapBody.receipt_written).toBe(false);
    expect(cheapBody.family_host_verdict).toBe('laya cheap NOT_CHECKED');
    expect(seen.some((call) => call.method === 'POST' && call.url.endsWith('/api/v1/laya/classify'))).toBe(true);
    expect(seen.some((call) => call.url.includes('/api/v1/hal/evaluate'))).toBe(false);

    seen.length = 0;
    lane = 'escalate';
    const up = capture();
    const upCode = await run(parseArgs(['verify', 'ok']), new TrustShell({ apiUrl: ENGINE }), up.io);
    expect(upCode).toBe(EXIT.OK);
    expect(seen.some((call) => call.url.includes('/api/v1/hal/evaluate'))).toBe(true);
    expect(up.out.join('\n')).not.toContain('laya cheap');

    seen.length = 0;
    lane = 'ask';
    const ask = capture();
    const askCode = await run(parseArgs(['verify', PARIS]), new TrustShell({ apiUrl: ENGINE }), ask.io);
    expect(askCode).toBe(EXIT.ASK);
    expect(ask.out).toEqual(['ASK']);
    expect(seen.some((call) => call.url.includes('/api/v1/hal/evaluate'))).toBe(false);
  });

  it('engine classify timeout escalates', async () => {
    process.env.TRUSTSHELL_LAYA = 'engine';
    const calls: string[] = [];
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      calls.push(`${method} ${url}`);
      if (url.endsWith('/api/v1/laya/classify')) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 5000);
          init?.signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new Error('aborted'));
          });
        });
        return classifyResponse('cheap');
      }
      if (method === 'POST' && url.endsWith('/api/v1/hal/evaluate')) return evaluateResponse();
      return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const cap = capture();
    const code = await run(parseArgs(['verify', 'ok']), new TrustShell({ apiUrl: ENGINE }), cap.io);
    expect(code).toBe(EXIT.OK);
    expect(calls.some((line) => line.includes('/api/v1/laya/classify'))).toBe(true);
    expect(calls.some((line) => line.includes('/api/v1/hal/evaluate'))).toBe(true);
    expect(cap.out.join('\n')).not.toContain('laya cheap');
  });
});
