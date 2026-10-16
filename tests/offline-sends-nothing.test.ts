/**
 * SEC F3 (security run 2026-10-16). OFFLINE=1 printed NOT_CHECKED for `verify`, but the claim had
 * already gone to HAL (docs/getting-started.md even said "`verify` still calls HAL"), and
 * `check` sent the sentence to /api/v1/classify or asked api.github.com as usual.
 *
 * Now OFFLINE=1 makes `check` (both forms) and `verify` answer NOT_CHECKED, exit 2, before any
 * fetch. `scripts/check-egress.cjs` proves the same thing against the compiled CLI with every
 * network surface stubbed to throw.
 */
import { parseArgs, run, EXIT, type CliIO } from '../src/cli';
import { classifyClaim } from '../src/lib/claim';
import { TrustShell } from '../src/lib/trustshell';

const ENGINE = 'https://engine.test';
const CLAIM = 'paste-your-own-claim-9f3c';

describe('SEC F3: OFFLINE=1 sends nothing from check or verify', () => {
  const prevOffline = process.env.OFFLINE;
  const prevUrl = process.env.TRUSTSHELL_API_URL;
  const prevFetch = global.fetch;
  let calls: string[];

  beforeEach(() => {
    process.env.OFFLINE = '1';
    process.env.TRUSTSHELL_API_URL = ENGINE;
    calls = [];
    global.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ decision: 'clean', label: 'pass', verdict: 'PASS' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
  });

  afterEach(() => {
    global.fetch = prevFetch;
    if (prevOffline === undefined) delete process.env.OFFLINE;
    else process.env.OFFLINE = prevOffline;
    if (prevUrl === undefined) delete process.env.TRUSTSHELL_API_URL;
    else process.env.TRUSTSHELL_API_URL = prevUrl;
  });

  async function cli(argv: string[]) {
    const out: string[] = [];
    const io: CliIO = { out: (s) => out.push(s), err: (s) => out.push(s) };
    const code = await run(parseArgs(argv), new TrustShell({ apiUrl: ENGINE }), io);
    return { code, text: out.join('\n') };
  }

  it('verify: NOT_CHECKED, exit 2, and the claim never left', async () => {
    const { code, text } = await cli(['verify', CLAIM]);
    expect(calls).toEqual([]);
    expect(code).toBe(EXIT.NOT_CHECKED);
    expect(text).toContain('NOT_CHECKED');
    expect(text).not.toMatch(/\bPASS\b/);
    expect(text).not.toContain(CLAIM);
  });

  it('verify --json: NOT_CHECKED fields, exit 2, nothing sent', async () => {
    const { code, text } = await cli(['verify', CLAIM, '--json']);
    expect(calls).toEqual([]);
    expect(code).toBe(EXIT.NOT_CHECKED);
    const body = JSON.parse(text) as Record<string, unknown>;
    expect(body.family_host_verdict).toBe('NOT_CHECKED');
    expect(body.receipt_written).toBe('NOT_CHECKED');
    expect(text).not.toContain(CLAIM);
  });

  it('check "<sentence>": not-checked, exit 2, nothing sent', async () => {
    const { code, text } = await cli(['check', 'Paris is the capital of France.']);
    expect(calls).toEqual([]);
    expect(code).toBe(2);
    expect(text.split('\n')[0]).toBe('not-checked');
    expect(text).toContain('OFFLINE=1');
  });

  it('check <github run url>: NOT_CHECKED, exit 2, GitHub not asked', async () => {
    const { code, text } = await cli(['check', 'https://github.com/DealAppSeo/trustshell/actions/runs/1']);
    expect(calls).toEqual([]);
    expect(code).toBe(EXIT.NOT_CHECKED);
    expect(text).toContain('NOT_CHECKED');
  });

  it('classifyClaim itself (also the MCP check_claim tool and quarantine release) sends nothing', async () => {
    const fetchImpl = jest.fn();
    const r = await classifyClaim('Paris is the capital of France.', { env: { OFFLINE: '1' }, fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(r.label).toBe('not-checked');
  });
});
