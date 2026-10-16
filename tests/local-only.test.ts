/**
 * SEC F2 (security run 2026-10-16), design and stub: src/lib/local-only.ts.
 *
 * Pinned: the default is unchanged (text is still sent); `localOnly: true` or TRUSTSHELL_LOCAL_ONLY=1
 * refuses every send of the person's text with NOT_CHECKED before any fetch; a HAL result says which
 * providers saw the text (`seenBy`), from the engine's answer, or 'unknown' when it does not say.
 */
import { TrustShell } from '../src/lib/trustshell';
import { classifyClaim } from '../src/lib/claim';
import { resolveLayaLane } from '../src/cli/laya-lane';
import { parseArgs, run, type CliIO } from '../src/cli';

const ENGINE = 'https://engine-f2.test';

function stub(body: unknown) {
  const calls: string[] = [];
  const fn = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { calls, fn };
}

const HAL = {
  decision: 'clean',
  hal_score: 0.1,
  mode: 'fact-check',
  signals: { families_used: 2, providers_used: 2 },
  provider_responses: [
    { provider: 'groq', verdict: 'TRUE' },
    { provider: 'cerebras', verdict: 'ERROR' },
  ],
};

describe('SEC F2: local-only refuses every send of your text; seenBy says who saw it', () => {
  const prevFetch = global.fetch;
  const prevLocal = process.env.TRUSTSHELL_LOCAL_ONLY;
  let s: ReturnType<typeof stub>;

  beforeEach(() => {
    delete process.env.TRUSTSHELL_LOCAL_ONLY;
    s = stub(HAL);
    global.fetch = s.fn;
  });

  afterEach(() => {
    global.fetch = prevFetch;
    if (prevLocal === undefined) delete process.env.TRUSTSHELL_LOCAL_ONLY;
    else process.env.TRUSTSHELL_LOCAL_ONLY = prevLocal;
  });

  it('default unchanged: verify still sends, and seenBy names every provider the engine sent it to', async () => {
    const r = await new TrustShell({ apiUrl: ENGINE }).verifyOutput('Paris is the capital of France.');
    expect(s.calls).toHaveLength(1);
    expect(r.verdict).toBe('PASS');
    // cerebras errored, but it received the text, so it saw it.
    expect(r.seenBy).toEqual(['groq', 'cerebras']);
  });

  it("an engine answer that does not say who saw it is 'unknown', never []", async () => {
    s = stub({ decision: 'clean', hal_score: 0.1 });
    global.fetch = s.fn;
    const r = await new TrustShell({ apiUrl: ENGINE }).verifyOutput('x');
    expect(r.seenBy).toBe('unknown');
  });

  it.each([
    ['localOnly: true', { localOnly: true }, undefined],
    ['TRUSTSHELL_LOCAL_ONLY=1', {}, '1'],
  ])('%s: verify is NOT_CHECKED, nothing sent, seenBy []', async (_why, cfg, env) => {
    if (env) process.env.TRUSTSHELL_LOCAL_ONLY = env;
    const r = await new TrustShell({ apiUrl: ENGINE, ...cfg }).verifyOutput('Paris is the capital of France.');
    expect(s.calls).toEqual([]);
    expect(r.verdict).toBe('NOT_CHECKED');
    expect(r.ok).toBe(false);
    expect(r.seenBy).toEqual([]);
    expect(r.decisionReason).toMatch(/local-only is on/);
  });

  it('MCP verify_output carries seenBy too', async () => {
    const { createServer } = await import('../src/mcp/index');
    const server: any = createServer(new TrustShell({ apiUrl: ENGINE }));
    const r = await server._registeredTools['verify_output'].handler({ text: 'Paris is the capital of France.' });
    expect(JSON.stringify(r)).toContain('seenBy');
    expect(r.content[0].text).toContain('cerebras');
  });

  it('check "<sentence>": not-checked, nothing sent (option and env)', async () => {
    const byOption = await classifyClaim('Paris is the capital of France.', { localOnly: true, fetchImpl: s.fn, env: {} });
    const byEnv = await classifyClaim('Paris is the capital of France.', { fetchImpl: s.fn, env: { TRUSTSHELL_LOCAL_ONLY: '1' } });
    expect(s.calls).toEqual([]);
    expect(byOption.label).toBe('not-checked');
    expect(byEnv.reason).toMatch(/local-only is on/);
  });

  it('the verify engine lane does not post the claim', async () => {
    const lane = await resolveLayaLane(
      'a claim',
      { TRUSTSHELL_LAYA: 'engine', TRUSTSHELL_API_URL: ENGINE, TRUSTSHELL_LOCAL_ONLY: '1' } as unknown as NodeJS.ProcessEnv,
      s.fn,
    );
    expect(lane).toBe('escalate');
    expect(s.calls).toEqual([]);
  });

  it('CLI verify --json under TRUSTSHELL_LOCAL_ONLY=1: NOT_CHECKED, exit 2, seenBy [], no text sent', async () => {
    process.env.TRUSTSHELL_LOCAL_ONLY = '1';
    const out: string[] = [];
    const io: CliIO = { out: (x) => out.push(x), err: (x) => out.push(x) };
    const code = await run(parseArgs(['verify', 'Paris is the capital of France.', '--json']), new TrustShell({ apiUrl: ENGINE }), io);
    const body = JSON.parse(out.join('\n')) as Record<string, unknown>;
    expect(body.verdict).toBe('NOT_CHECKED');
    expect(body.seenBy).toEqual([]);
    expect(code).toBe(2);
    expect(s.calls.filter((u) => u.endsWith('/api/v1/hal/evaluate') || u.endsWith('/api/v1/classify'))).toEqual([]);
  });
});
