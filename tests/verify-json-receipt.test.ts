/**
 * verify --json prints receipt_written, then the family host verdict.
 * Missing is NOT_CHECKED, never 0. The claim text stays out of the JSON.
 */
import { parseArgs, run, type CliIO } from '../src/cli';
import { TrustShell } from '../src/lib/trustshell';

const ENGINE = 'https://engine.test';
const CLAIM = 'paste-your-own-claim-9f3c';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body == null ? null : JSON.stringify(body), {
    status,
    headers: body == null ? undefined : { 'content-type': 'application/json' },
  });
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

describe('verify --json receipt_written', () => {
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

  function install(receipt: () => Response | Promise<Response>): void {
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'POST' && url.endsWith('/api/v1/hal/evaluate')) return jsonResponse(200, evaluateBody());
      if (url.endsWith('/api/v1/hal/honesty-a')) return jsonResponse(200, honestyBody());
      if (method === 'POST' && url.endsWith('/api/v1/hal/receipt')) return receipt();
      return jsonResponse(404, {});
    }) as typeof fetch;
  }

  async function verifyJson(): Promise<{ code: number; raw: string; body: Record<string, unknown> }> {
    const out: string[] = [];
    const io: CliIO = { out: (s) => out.push(s), err: () => undefined };
    const code = await run(parseArgs(['verify', CLAIM, '--json']), new TrustShell({ apiUrl: ENGINE }), io);
    const raw = out.join('\n');
    return { code, raw, body: JSON.parse(raw) as Record<string, unknown> };
  }

  function expectShape(raw: string, body: Record<string, unknown>, written: true | false | 'NOT_CHECKED'): void {
    expect(body.receipt_written).toBe(written);
    expect(body.receipt_written).not.toBe(0);
    expect(raw).not.toMatch(/"receipt_written"\s*:\s*0\b/);
    expect(raw.indexOf('"receipt_written"')).toBeLessThan(raw.indexOf('"family_host_verdict"'));
    expect(body.family_host_verdict).toBe('glm cerebras PASS');
    expect(raw).not.toContain(CLAIM);
    expect(raw).not.toMatch(/stake now|every transaction earns RepID|HeyGen/i);
  }

  it('prints receipt_written true, then the family host verdict', async () => {
    install(() => jsonResponse(200, { written: true }));
    const { code, raw, body } = await verifyJson();
    expect(code).toBe(0);
    expectShape(raw, body, true);
  });

  it('prints receipt_written false when the write says so', async () => {
    install(() => jsonResponse(200, { written: false }));
    const { code, raw, body } = await verifyJson();
    expect(code).toBe(0);
    expectShape(raw, body, false);
  });

  it('prints receipt_written false on insert-error', async () => {
    install(() => jsonResponse(500, { error: 'insert-error' }));
    const { code, raw, body } = await verifyJson();
    expect(code).toBe(0);
    expectShape(raw, body, false);
  });

  it('prints NOT_CHECKED when the receipt is missing, never 0', async () => {
    install(() => jsonResponse(404, {}));
    const missing = await verifyJson();
    expect(missing.code).toBe(0);
    expectShape(missing.raw, missing.body, 'NOT_CHECKED');

    install(() => jsonResponse(503, {}));
    const down = await verifyJson();
    expectShape(down.raw, down.body, 'NOT_CHECKED');

    install(() => Promise.reject(new Error('timeout')));
    const timedOut = await verifyJson();
    expectShape(timedOut.raw, timedOut.body, 'NOT_CHECKED');
  });

  it('OFFLINE skips the receipt POST and prints NOT_CHECKED', async () => {
    process.env.OFFLINE = '1';
    let receiptPosts = 0;
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'POST' && url.endsWith('/api/v1/hal/receipt')) {
        receiptPosts += 1;
        return jsonResponse(200, { written: true });
      }
      if (method === 'POST' && url.endsWith('/api/v1/hal/evaluate')) return jsonResponse(200, evaluateBody());
      if (url.endsWith('/api/v1/hal/honesty-a')) return jsonResponse(200, honestyBody());
      return jsonResponse(404, {});
    }) as typeof fetch;
    const { code, raw, body } = await verifyJson();
    expect(code).toBe(0);
    expect(receiptPosts).toBe(0);
    expect(body.receipt_written).toBe('NOT_CHECKED');
    expect(body.receipt_written).not.toBe(0);
    expect(body.family_host_verdict).toBe('NOT_CHECKED');
    expect(raw.indexOf('"receipt_written"')).toBeLessThan(raw.indexOf('"family_host_verdict"'));
    expect(raw).not.toContain(CLAIM);
    expect(raw).not.toMatch(/"receipt_written"\s*:\s*0\b/);
  });
});
