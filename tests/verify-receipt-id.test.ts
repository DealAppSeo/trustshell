/**
 * verify prints the receipt id and one family host verdict line.
 * A missing id or count is NOT_CHECKED, never 0.
 */
import { parseArgs, run, type CliIO } from '../src/cli';
import { receiptIdToken } from '../src/cli/status';
import { TrustShell } from '../src/lib/trustshell';

const ENGINE = 'https://engine.test';
const CLAIM = 'the claim you typed';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body == null ? null : JSON.stringify(body), {
    status,
    headers: body == null ? undefined : { 'content-type': 'application/json' },
  });
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

describe('verify receipt id', () => {
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

  function install(honesty: unknown, receipt: unknown): void {
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'POST' && url.endsWith('/api/v1/hal/evaluate')) return jsonResponse(200, evaluateBody());
      if (url.endsWith('/api/v1/hal/honesty-a')) return jsonResponse(200, honesty);
      if (method === 'POST' && url.endsWith('/api/v1/hal/receipt')) return jsonResponse(200, receipt);
      return jsonResponse(404, {});
    }) as typeof fetch;
  }

  async function verify(json = false): Promise<{ code: number; text: string }> {
    const out: string[] = [];
    const io: CliIO = { out: (s) => out.push(s), err: () => undefined };
    const args = json ? ['verify', CLAIM, '--json'] : ['verify', CLAIM];
    const code = await run(parseArgs(args), new TrustShell({ apiUrl: ENGINE }), io);
    return { code, text: out.join('\n') };
  }

  it('prints the receipt id and one family host verdict line', async () => {
    install(
      { status: 'counted', rows: [{ family: 'glm', host: 'cerebras', TRUE: 1, FALSE: 0, NOT_CHECKED: 2 }] },
      { written: true, receipt_id: 'rcpt-7' },
    );
    const { code, text } = await verify();
    const lines = text.split('\n');
    expect(code).toBe(0);
    expect(lines.filter((line) => line === 'receipt-id rcpt-7')).toEqual(['receipt-id rcpt-7']);
    expect(lines.filter((line) => line === 'glm cerebras PASS')).toEqual(['glm cerebras PASS']);
    expect(text).not.toContain(CLAIM);
    expect(text).not.toMatch(/receipt-id 0\b/);
  });

  it('prints NOT_CHECKED for a missing id or count, never 0', () => {
    expect(receiptIdToken(undefined)).toBe('NOT_CHECKED');
    expect(receiptIdToken(0)).toBe('NOT_CHECKED');
    expect(receiptIdToken('0')).toBe('NOT_CHECKED');
    expect(receiptIdToken(' rcpt-7 ')).toBe('rcpt-7');
  });

  it('prints NOT_CHECKED when the receipt id and the count are missing', async () => {
    install(
      { status: 'counted', rows: [{ family: 'glm', host: 'cerebras' }] },
      { written: true, receipt_id: 0 },
    );
    const human = await verify();
    expect(human.code).toBe(0);
    expect(human.text.split('\n').filter((line) => line === 'receipt-id NOT_CHECKED')).toEqual([
      'receipt-id NOT_CHECKED',
    ]);
    expect(human.text.split('\n').filter((line) => line === 'glm cerebras PASS')).toEqual(['glm cerebras PASS']);
    expect(human.text).toContain('first-pass NOT_CHECKED');
    expect(human.text).not.toMatch(/receipt-id 0\b/);
    expect(human.text).not.toMatch(/\bTRUE 0\b/);

    const json = await verify(true);
    const body = JSON.parse(json.text) as Record<string, unknown>;
    expect(body.receipt_id).toBe('NOT_CHECKED');
    expect(body.family_host_verdict).toBe('glm cerebras PASS');
    expect(json.text).not.toMatch(/"receipt_id"\s*:\s*0\b/);
    expect(body.receipt_written).not.toBe(0);
  });
});
