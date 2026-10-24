/**
 * Loop sprint 1 (claims-vs-code, 2026-10-23). "OFFLINE=1 sends nothing" was true for the CLI
 * (`check`, `verify`, pinned by tests/offline-sends-nothing.test.ts) and for the MCP `check_claim`,
 * `inspect_run` and `status`. It was not true for the MCP `verify_output` (and its aliases `verify`
 * and `evaluate`) or the SDK call under them: `TrustShell.score` only looked at
 * TRUSTSHELL_LOCAL_ONLY, so the text went to HAL. The audit (CLAIMS_CODE_AUDIT.md, "found in
 * passing") got a live PASS from `verify_output` with OFFLINE=1.
 *
 * These drive the real MCP server over a REAL TrustShell client with global fetch stubbed, so a
 * send cannot hide behind a mock client. The control runs prove the instrument can see a send:
 * with OFFLINE unset the same calls reach the stub and come back PASS.
 */
import { createServer } from '../src/mcp/index';
import { TrustShell } from '../src/lib/trustshell';

const ENGINE = 'https://engine-offline.test';
const TEXT = 'paste-your-own-claim-77b1';
const HAL = {
  decision: 'clean',
  hal_score: 0.05,
  mode: 'fact-check',
  signals: { families_used: 2, providers_used: 2 },
  provider_responses: [{ provider: 'groq', verdict: 'TRUE' }],
};

describe('OFFLINE=1 sends nothing from MCP verify_output / verify / evaluate and the SDK', () => {
  const prevOffline = process.env.OFFLINE;
  const prevLocal = process.env.TRUSTSHELL_LOCAL_ONLY;
  const prevFetch = global.fetch;
  let calls: string[];

  beforeEach(() => {
    delete process.env.OFFLINE;
    delete process.env.TRUSTSHELL_LOCAL_ONLY;
    calls = [];
    global.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(JSON.stringify(HAL), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
  });

  afterEach(() => {
    global.fetch = prevFetch;
    if (prevOffline === undefined) delete process.env.OFFLINE;
    else process.env.OFFLINE = prevOffline;
    if (prevLocal === undefined) delete process.env.TRUSTSHELL_LOCAL_ONLY;
    else process.env.TRUSTSHELL_LOCAL_ONLY = prevLocal;
  });

  const tools = ['verify_output', 'verify', 'evaluate'] as const;

  it.each(tools)('control: with OFFLINE unset, MCP %s reaches HAL and answers PASS', async (name) => {
    const server: any = createServer(new TrustShell({ apiUrl: ENGINE }));
    const r = await server._registeredTools[name].handler({ text: TEXT });
    expect(calls).toHaveLength(1);
    expect(r.content[0].text).toContain('PASS');
  });

  it.each(tools)('OFFLINE=1: MCP %s answers NOT_CHECKED, never PASS, and sends nothing', async (name) => {
    process.env.OFFLINE = '1';
    const server: any = createServer(new TrustShell({ apiUrl: ENGINE }));
    const r = await server._registeredTools[name].handler({ text: TEXT });
    const text: string = r.content[0].text;
    expect(calls).toEqual([]);
    expect(text).toContain('NOT_CHECKED');
    expect(text).not.toMatch(/"verdict":\s*"PASS"/);
    expect(text).toContain('OFFLINE=1');
    // Nobody saw the text: the same field the local-only result sets.
    expect(JSON.stringify(JSON.parse(text).untrusted_data.seenBy)).toBe('[]');
    expect(text).not.toContain(TEXT);
  });

  it('OFFLINE=1: the SDK (verifyOutput and evaluate) is NOT_CHECKED, ok false, nothing sent', async () => {
    process.env.OFFLINE = '1';
    const shell = new TrustShell({ apiUrl: ENGINE });
    for (const r of [await shell.verifyOutput(TEXT), await shell.evaluate(TEXT)]) {
      expect(r.verdict).toBe('NOT_CHECKED');
      expect(r.ok).toBe(false);
      expect(r.trustScore).toBe(0);
      expect(r.seenBy).toEqual([]);
      expect(r.decisionReason).toContain('OFFLINE=1');
    }
    expect(calls).toEqual([]);
  });

  it('only the value 1 turns it on (OFFLINE=0 and an empty OFFLINE still send)', async () => {
    const shell = new TrustShell({ apiUrl: ENGINE });
    process.env.OFFLINE = '0';
    expect((await shell.verifyOutput(TEXT)).verdict).toBe('PASS');
    process.env.OFFLINE = '';
    expect((await shell.verifyOutput(TEXT)).verdict).toBe('PASS');
    expect(calls).toHaveLength(2);
  });

  it('TRUSTSHELL_LOCAL_ONLY keeps its own reason when both are set', async () => {
    process.env.OFFLINE = '1';
    process.env.TRUSTSHELL_LOCAL_ONLY = '1';
    const r = await new TrustShell({ apiUrl: ENGINE }).verifyOutput(TEXT);
    expect(r.verdict).toBe('NOT_CHECKED');
    expect(calls).toEqual([]);
  });
});
