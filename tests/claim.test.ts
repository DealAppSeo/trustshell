/**
 * B17 — `trustshell check "<sentence>"` and the MCP `check_claim` tool give the SAME label as
 * the Chrome extension, by calling the same endpoint through ONE function (src/lib/claim.ts).
 *
 * fetch is stubbed throughout: these pin the request contract and the exit-code mapping, not
 * production. Three outcomes, never two — every way of not getting an answer is not-checked.
 */
import * as claim from '../src/lib/claim';
import { classifyClaim, resolveClassifyUrl, isUrlOperand, DEFAULT_API_URL } from '../src/lib/claim';
import { parseArgs, run, runClaimCheck, type CliIO } from '../src/cli/index';
import { createServer } from '../src/mcp/index';
import { TrustShell } from '../src/lib/trustshell';

type Call = { url: string; init: any };

function stubFetch(respond: (call: Call) => Promise<any> | any) {
  const calls: Call[] = [];
  const fn = jest.fn(async (url: any, init: any) => {
    const call = { url: String(url), init };
    calls.push(call);
    return respond(call);
  });
  (globalThis as any).fetch = fn;
  return { calls, fn };
}

function reply(status: number, body: unknown) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { status, ok: status === 200, text: async () => text };
}

function captureIO(): CliIO & { lines: string[]; errs: string[] } {
  const lines: string[] = [];
  const errs: string[] = [];
  return { lines, errs, out: (s) => lines.push(s), err: (s) => errs.push(s) };
}

const realFetch = (globalThis as any).fetch;
const savedUrl = process.env.TRUSTSHELL_API_URL;

beforeEach(() => {
  delete process.env.TRUSTSHELL_API_URL;
});
afterEach(() => {
  (globalThis as any).fetch = realFetch;
  if (savedUrl === undefined) delete process.env.TRUSTSHELL_API_URL;
  else process.env.TRUSTSHELL_API_URL = savedUrl;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('request contract', () => {
  it('POSTs {text, labels:[pass,veto,not-checked]} as JSON to <default>/api/v1/classify', async () => {
    const { calls } = stubFetch(() => reply(200, { label: 'pass', latency_ms: 42 }));
    const r = await classifyClaim('Paris is the capital of France.');
    expect(r).toEqual({ label: 'pass', latency_ms: 42 });
    expect(calls).toHaveLength(1);
    const c = calls[0]!;
    expect(c.url).toBe('https://repid-engine-production.up.railway.app/api/v1/classify');
    expect(c.init.method).toBe('POST');
    expect(c.init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(c.init.body)).toEqual({
      text: 'Paris is the capital of France.',
      labels: ['pass', 'veto', 'not-checked'],
    });
  });

  it('uses the same endpoint string as the Chrome extension', () => {
    const fs = require('node:fs') as typeof import('node:fs');
    const src = fs.readFileSync(require('node:path').join(__dirname, '..', 'extension', 'select.js'), 'utf8');
    expect(src).toContain(`'${DEFAULT_API_URL}/api/v1/classify'`);
  });

  it('honours TRUSTSHELL_API_URL (trailing slash stripped)', async () => {
    process.env.TRUSTSHELL_API_URL = 'http://localhost:9999/';
    const { calls } = stubFetch(() => reply(200, { label: 'veto', latency_ms: 1 }));
    await classifyClaim('x');
    expect(calls[0]!.url).toBe('http://localhost:9999/api/v1/classify');
  });

  it('never sends a secret: the sentence is redacted before it leaves', async () => {
    const { calls } = stubFetch(() => reply(200, { label: 'pass', latency_ms: 1 }));
    await classifyClaim('my key is sb_secret_abcdef123456 ok');
    expect(JSON.parse(calls[0]!.init.body).text).not.toContain('sb_secret_');
  });

  it('says when something was removed, and only then', async () => {
    stubFetch(() => reply(200, { label: 'pass', latency_ms: 1 }));
    const removed = await classifyClaim('Write to jane.doe' + '@example.com about Paris.');
    expect(removed.scrubbed).toBe(true);
    const clean = await classifyClaim('Paris is the capital of France.');
    expect(clean).not.toHaveProperty('scrubbed');
  });

  it('a not-checked answer still says something was removed', async () => {
    stubFetch(() => reply(500, 'boom'));
    const r = await classifyClaim('Call (555) 123-4567 about Paris.');
    expect(r.label).toBe('not-checked');
    expect(r.scrubbed).toBe(true);
  });

  it('a sentence that is only a key is a local error, and nothing is sent', async () => {
    const { calls } = stubFetch(() => reply(200, { label: 'pass' }));
    await expect(classifyClaim('AKIA' + 'IOSFODNN7EXAMPLE')).rejects.toThrow(/looked like a key or personal data/);
    expect(calls).toHaveLength(0);
  });

  it('a non-http base URL is a local error, and nothing is sent', async () => {
    const { calls } = stubFetch(() => reply(200, { label: 'pass' }));
    expect(() => resolveClassifyUrl('ftp://example.com', {})).toThrow(claim.ClaimError);
    await expect(classifyClaim('x', { apiUrl: 'ftp://example.com' })).rejects.toBeInstanceOf(claim.ClaimError);
    expect(calls).toHaveLength(0);
  });
});

describe('labels outside an answer are not-checked, never pass', () => {
  const cases: [string, () => any][] = [
    ['non-200', () => reply(503, { label: 'pass' })],
    ['off-contract label', () => reply(200, { label: 'PASS' })],
    ['unknown label', () => reply(200, { label: 'true' })],
    ['missing label', () => reply(200, { latency_ms: 3 })],
    ['non-JSON body', () => reply(200, 'pass')],
    ['empty body', () => reply(200, '')],
    ['network failure', () => Promise.reject(new Error('ECONNREFUSED'))],
  ];
  for (const [name, respond] of cases) {
    it(name, async () => {
      stubFetch(respond);
      const r = await classifyClaim('The Moon is made of cheese.');
      expect(r.label).toBe('not-checked');
      expect(typeof r.reason).toBe('string');
    });
  }

  it('timeout (default 6 s) → not-checked, and the request is aborted', async () => {
    jest.useFakeTimers();
    let signal: AbortSignal | undefined;
    stubFetch((c) => {
      signal = c.init.signal;
      return new Promise(() => {});
    });
    const p = classifyClaim('slow');
    await Promise.resolve();
    jest.advanceTimersByTime(claim.CLAIM_TIMEOUT_MS);
    const r = await p;
    expect(claim.CLAIM_TIMEOUT_MS).toBe(6000);
    expect(r.label).toBe('not-checked');
    expect(r.reason).toMatch(/6000 ms/);
    expect(signal?.aborted).toBe(true);
  });
});

describe('CLI: trustshell check "<sentence>"', () => {
  async function cli(argv: string[], respond: () => any) {
    stubFetch(respond);
    const io = captureIO();
    const code = await run(parseArgs(argv), new TrustShell({ apiUrl: 'http://unused.invalid' }), io);
    return { code, io };
  }

  it('pass → exit 0, label on its own line first, then one explanation line', async () => {
    const { code, io } = await cli(['check', 'Paris is the capital of France.'], () =>
      reply(200, { label: 'pass', latency_ms: 5 }),
    );
    expect(code).toBe(0);
    expect(io.lines[0]).toBe('pass');
    expect(io.lines).toHaveLength(2);
  });

  it('prints the removed-before-sending line only when the scrubber removed something', async () => {
    const { io } = await cli(['check', 'Mail jane.doe' + '@example.com: Paris is in France.'], () =>
      reply(200, { label: 'pass', latency_ms: 5 }),
    );
    expect(io.lines).toEqual(['pass', expect.any(String), claim.SCRUBBED_LINE]);
  });

  it('veto → exit 1', async () => {
    const { code, io } = await cli(['check', 'The Moon is made of cheese.'], () =>
      reply(200, { label: 'veto', latency_ms: 5 }),
    );
    expect(code).toBe(1);
    expect(io.lines[0]).toBe('veto');
  });

  it('not-checked → exit 2 (never 0)', async () => {
    const { code, io } = await cli(['check', 'Pizza is the best food.'], () =>
      reply(200, { label: 'not-checked', latency_ms: 5 }),
    );
    expect(code).toBe(2);
    expect(io.lines[0]).toBe('not-checked');
  });

  it('network failure → not-checked exit 2', async () => {
    const { code, io } = await cli(['check', 'x'], () => Promise.reject(new Error('down')));
    expect(code).toBe(2);
    expect(io.lines[0]).toBe('not-checked');
  });

  it('local error (bad TRUSTSHELL_API_URL) → exit 3, nothing sent', async () => {
    process.env.TRUSTSHELL_API_URL = 'file:///etc/passwd';
    const { code, io } = await cli(['check', 'x'], () => reply(200, { label: 'pass' }));
    expect(code).toBe(3);
    expect(io.lines[0]).toBe('error');
    expect((globalThis as any).fetch).not.toHaveBeenCalled();
  });

  it('--json prints the response object', async () => {
    const { code, io } = await cli(['check', 'Paris is the capital of France.', '--json'], () =>
      reply(200, { label: 'pass', latency_ms: 7 }),
    );
    expect(code).toBe(0);
    expect(JSON.parse(io.lines.join('\n'))).toEqual({ label: 'pass', latency_ms: 7 });
  });

  it('an unquoted multi-word sentence is checked whole', () => {
    expect(parseArgs(['check', 'Paris', 'is', 'nice']).operand).toBe('Paris is nice');
  });

  it('a URL operand still goes to the GitHub run check, never to the classifier', async () => {
    expect(isUrlOperand('https://github.com/o/r/actions/runs/1')).toBe(true);
    expect(isUrlOperand('github.com/o/r/actions/runs/1')).toBe(true);
    expect(isUrlOperand('Paris is the capital of France.')).toBe(false);
    const spy = jest.spyOn(claim, 'classifyClaim');
    const { code, io } = await cli(['check', 'https://example.com/not-a-run'], () => reply(200, {}));
    expect(spy).not.toHaveBeenCalled();
    expect(code).toBe(2); // the existing CheckError usage path, unchanged
    expect(io.errs.join('\n')).toMatch(/check failed/);
  });
});

describe('MCP check_claim and the CLI share ONE function', () => {
  function tool(name: string) {
    const server: any = createServer(new TrustShell({ apiUrl: 'http://unused.invalid' }));
    const t = server._registeredTools?.[name];
    expect(t).toBeDefined();
    return t;
  }

  it('MCP returns the same label as the CLI for the same stubbed answer', async () => {
    for (const label of ['pass', 'veto', 'not-checked'] as const) {
      stubFetch(() => reply(200, { label, latency_ms: 9 }));
      const res = await tool('check_claim').handler({ text: 'a sentence' });
      expect(JSON.parse(res.content[0].text)).toEqual({ label, latency_ms: 9 });
      const io = captureIO();
      const code = await runClaimCheck('a sentence', false, io);
      expect(io.lines[0]).toBe(label);
      expect(code).toBe(claim.CLAIM_EXIT[label]);
    }
  });

  it('both surfaces call claim.classifyClaim (spied once each)', async () => {
    stubFetch(() => reply(200, { label: 'veto', latency_ms: 1 }));
    const spy = jest.spyOn(claim, 'classifyClaim');
    await tool('check_claim').handler({ text: 's' });
    await runClaimCheck('s', true, captureIO());
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
