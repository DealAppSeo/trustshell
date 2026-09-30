/**
 * After a live verify quorum, POST {family, host, verdict}.
 * Timeout or non-200 prints receipt NOT_CHECKED and does not change the exit code.
 * OFFLINE=1 skips the POST.
 */
import { parseArgs, run, type CliIO } from '../src/cli';
import { postHalReceipt } from '../src/cli/status';
import { TrustShell } from '../src/lib/trustshell';

const ENGINE = 'https://engine.test';
const DEFAULT_ENGINE = 'https://repid-engine-production.up.railway.app';
const CLAIM = 'the claim you typed';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body == null ? null : JSON.stringify(body), {
    status,
    headers: body == null ? undefined : { 'content-type': 'application/json' },
  });
}

function capture(): { io: CliIO; out: string[] } {
  const out: string[] = [];
  return { io: { out: (s) => out.push(s), err: () => undefined }, out };
}

function honestyBody(): unknown {
  return {
    status: 'counted',
    rows: [{ family: 'glm', host: 'cerebras', TRUE: 1, FALSE: 0, NOT_CHECKED: 0 }],
  };
}

function evaluateBody(): unknown {
  return {
    decision: 'clean',
    hal_score: 0.1,
    mode: 'fact-check',
    signals: { families_used: 1, providers_used: 1 },
    provider_responses: [{ provider: 'glm', verdict: 'TRUE', note: 'counted' }],
  };
}

describe('verify hal receipt POST', () => {
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

  function install(receipt: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> | Response): {
    receipts: { url: string; init?: RequestInit }[];
  } {
    const receipts: { url: string; init?: RequestInit }[] = [];
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'POST' && url.endsWith('/api/v1/hal/evaluate')) return jsonResponse(200, evaluateBody());
      if (url.endsWith('/api/v1/hal/honesty-a')) return jsonResponse(200, honestyBody());
      if (method === 'POST' && url.endsWith('/api/v1/hal/receipt')) {
        receipts.push({ url, init });
        return receipt(input, init);
      }
      return jsonResponse(404, {});
    }) as typeof fetch;
    return { receipts };
  }

  function expectReceiptBody(init: RequestInit | undefined): void {
    const raw = String(init?.body ?? '');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed).toEqual({ family: 'glm', host: 'cerebras', verdict: 'PASS' });
    expect(Object.keys(parsed)).toEqual(['family', 'host', 'verdict']);
    expect(raw).not.toContain(CLAIM);
    expect(raw).not.toMatch(/user/i);
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBeUndefined();
    expect(headers.Authorization).toBeUndefined();
  }

  it('posts family host verdict when the receipt returns written true', async () => {
    process.env.TRUSTSHELL_API_URL = ENGINE;
    const seen = install(() => jsonResponse(200, { written: true }));
    const cap = capture();
    const code = await run(parseArgs(['verify', CLAIM]), new TrustShell({ apiUrl: ENGINE }), cap.io);
    expect(code).toBe(0);
    expect(seen.receipts).toHaveLength(1);
    expect(seen.receipts[0].url).toBe(`${ENGINE}/api/v1/hal/receipt`);
    expectReceiptBody(seen.receipts[0].init);
    expect(cap.out.join('\n')).not.toContain('receipt NOT_CHECKED');
    expect(cap.out.join('\n')).not.toMatch(/HeyGen|\bstake\b/i);
  });

  it('treats a 204 receipt as written', async () => {
    process.env.TRUSTSHELL_API_URL = ENGINE;
    const seen = install(() => new Response(null, { status: 204 }));
    const cap = capture();
    const code = await run(parseArgs(['verify', CLAIM]), new TrustShell({ apiUrl: ENGINE }), cap.io);
    expect(code).toBe(0);
    expect(seen.receipts).toHaveLength(1);
    expectReceiptBody(seen.receipts[0].init);
    expect(cap.out.join('\n')).not.toContain('receipt NOT_CHECKED');
  });

  it('prints receipt NOT_CHECKED on non-200 and keeps the verify exit', async () => {
    process.env.TRUSTSHELL_API_URL = ENGINE;
    install(() => jsonResponse(503, {}));
    const cap = capture();
    const code = await run(parseArgs(['verify', CLAIM]), new TrustShell({ apiUrl: ENGINE }), cap.io);
    const lines = cap.out.join('\n').split('\n').filter((line) => line === 'receipt NOT_CHECKED');
    expect(code).toBe(0);
    expect(lines).toEqual(['receipt NOT_CHECKED']);
  });

  it('prints receipt receipt-missing when the receipt route is 404', async () => {
    process.env.TRUSTSHELL_API_URL = ENGINE;
    install(() => jsonResponse(404, {}));
    const cap = capture();
    const code = await run(parseArgs(['verify', CLAIM]), new TrustShell({ apiUrl: ENGINE }), cap.io);
    expect(code).toBe(0);
    expect(cap.out.join('\n').split('\n').filter((line) => line === 'receipt receipt-missing')).toEqual([
      'receipt receipt-missing',
    ]);
  });

  it('prints receipt insert-error when the receipt body names that error', async () => {
    process.env.TRUSTSHELL_API_URL = ENGINE;
    install(() => jsonResponse(500, { error: 'insert-error' }));
    const cap = capture();
    const code = await run(parseArgs(['verify', CLAIM]), new TrustShell({ apiUrl: ENGINE }), cap.io);
    expect(code).toBe(0);
    expect(cap.out.join('\n').split('\n').filter((line) => line === 'receipt insert-error')).toEqual([
      'receipt insert-error',
    ]);
  });

  it('prints receipt receipt-missing when a 200 says written false for that reason', async () => {
    process.env.TRUSTSHELL_API_URL = ENGINE;
    install(() => jsonResponse(200, { written: false, reason: 'receipt-missing' }));
    const cap = capture();
    const code = await run(parseArgs(['verify', CLAIM]), new TrustShell({ apiUrl: ENGINE }), cap.io);
    expect(code).toBe(0);
    const lines = cap.out.join('\n').split('\n');
    expect(lines.filter((line) => line === 'receipt receipt-missing')).toEqual(['receipt receipt-missing']);
    expect(lines.filter((line) => line === 'receipt insert-error')).toEqual([]);
  });

  it('prints receipt NOT_CHECKED when the receipt POST rejects', async () => {
    process.env.TRUSTSHELL_API_URL = ENGINE;
    install(() => Promise.reject(new Error('timeout')));
    const cap = capture();
    const code = await run(parseArgs(['verify', CLAIM]), new TrustShell({ apiUrl: ENGINE }), cap.io);
    expect(code).toBe(0);
    expect(cap.out.join('\n').split('\n').filter((line) => line === 'receipt NOT_CHECKED')).toEqual([
      'receipt NOT_CHECKED',
    ]);
  });

  it('posts to the default engine when TRUSTSHELL_API_URL is unset', async () => {
    delete process.env.TRUSTSHELL_API_URL;
    const seen = install(() => jsonResponse(200, { written: true }));
    const cap = capture();
    const code = await run(parseArgs(['verify', CLAIM]), new TrustShell({ apiUrl: ENGINE }), cap.io);
    expect(code).toBe(0);
    expect(seen.receipts.map((call) => call.url)).toEqual([`${DEFAULT_ENGINE}/api/v1/hal/receipt`]);
    expectReceiptBody(seen.receipts[0].init);
    expect(cap.out.join('\n')).not.toContain('receipt NOT_CHECKED');
  });

  it('does not add a receipt line in json mode', async () => {
    process.env.TRUSTSHELL_API_URL = ENGINE;
    const seen = install(() => jsonResponse(503, {}));
    const cap = capture();
    const code = await run(parseArgs(['verify', CLAIM, '--json']), new TrustShell({ apiUrl: ENGINE }), cap.io);
    expect(code).toBe(0);
    expect(seen.receipts).toHaveLength(1);
    const raw = cap.out.join('\n');
    expect(JSON.parse(raw).verdict).toBe('PASS');
    expect(raw).not.toContain('receipt NOT_CHECKED');
  });

  it('OFFLINE skips the receipt POST', async () => {
    process.env.OFFLINE = '1';
    process.env.TRUSTSHELL_API_URL = ENGINE;
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return jsonResponse(200, { written: true });
    }) as typeof fetch;
    const result = await postHalReceipt({
      env: process.env,
      fetchImpl,
      body: honestyBody(),
      verdict: 'PASS',
    });
    expect(result).toBe('skipped');
    expect(calls).toBe(0);

    const seen = install(() => jsonResponse(200, { written: true }));
    const cap = capture();
    const code = await run(parseArgs(['verify', CLAIM]), new TrustShell({ apiUrl: ENGINE }), cap.io);
    expect(code).toBe(0);
    expect(seen.receipts).toHaveLength(0);
    expect(cap.out.join('\n')).not.toContain('receipt NOT_CHECKED');
  });
});
