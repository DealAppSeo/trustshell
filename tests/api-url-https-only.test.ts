/**
 * SEC F10 (security run 2026-10-16). TRUSTSHELL_API_URL took any URL: pointed at plain http on another
 * machine, claims, agent ids and the REPID_API_KEY bearer token crossed the network in clear text.
 *
 * Pinned here: an override is https only (plain http only for localhost); REPID_API_KEY never goes to
 * a non-https origin; a non-default origin prints a loud stderr warning. Refused means NOTHING was sent.
 */
import { TrustShell } from '../src/lib/trustshell';
import { kernelReceipt } from '../src/lib/kernel-client';
import { classifyClaim } from '../src/lib/claim';
import { myJob } from '../src/lib/my-job';
import { parseArgs, run, type CliIO } from '../src/cli';
import { resolveLayaLane } from '../src/cli/laya-lane';

const TOKEN = ['not', 'a', 'real', 'credential'].join('-');
const EVIL = 'http://evil.example';

type Call = { url: string; auth: string | undefined };

function spyFetch(): { calls: Call[]; fn: typeof fetch } {
  const calls: Call[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const h = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url: String(input), auth: h.Authorization ?? h.authorization });
    return new Response(JSON.stringify({ agentId: 'a', repid: 1, tier: 'X', grants: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { calls, fn };
}

describe('SEC F10: the backend override is https only, and the key never goes to plain http', () => {
  const prevUrl = process.env.TRUSTSHELL_API_URL;
  const prevFetch = global.fetch;
  let spy: ReturnType<typeof spyFetch>;
  let stderr: string[];
  let writeSpy: jest.SpyInstance;

  beforeEach(() => {
    spy = spyFetch();
    global.fetch = spy.fn;
    stderr = [];
    writeSpy = jest.spyOn(process.stderr, 'write').mockImplementation((s: string | Uint8Array) => {
      stderr.push(String(s));
      return true;
    });
  });

  afterEach(() => {
    writeSpy.mockRestore();
    global.fetch = prevFetch;
    if (prevUrl === undefined) delete process.env.TRUSTSHELL_API_URL;
    else process.env.TRUSTSHELL_API_URL = prevUrl;
  });

  it('SDK: plain http to another host is refused before anything is sent, key included', async () => {
    process.env.TRUSTSHELL_API_URL = EVIL;
    expect(() => new TrustShell({ apiKey: TOKEN })).toThrow(/must be https/);
    expect(() => new TrustShell({ apiKey: TOKEN, apiUrl: EVIL })).toThrow(/must be https/);
    expect(spy.calls).toEqual([]);
  });

  it('SDK: plain http on this machine is allowed, but the key is NOT sent to it', async () => {
    const client = new TrustShell({ apiKey: TOKEN, apiUrl: 'http://127.0.0.1:9' });
    await client.getRepID('trinity-shofet').catch(() => undefined);
    expect(spy.calls.length).toBeGreaterThan(0);
    for (const c of spy.calls) expect(c.auth).toBeUndefined();
  });

  it('SDK: https sends the key, and a non-default host gets one loud stderr warning', async () => {
    const client = new TrustShell({ apiKey: TOKEN, apiUrl: 'https://engine-f10.test' });
    await client.getRepID('trinity-shofet').catch(() => undefined);
    await client.getRepID('trinity-shofet').catch(() => undefined);
    expect(spy.calls[0]!.auth).toBe(`Bearer ${TOKEN}`);
    // The host is read back out of the line and compared whole (a substring test is what CodeQL's
    // js/incomplete-url-substring-sanitization flags, even in a test).
    const named = stderr.map((s) => /^WARNING: TrustShell is using the backend (\S+), /.exec(s)?.[1]).filter(Boolean);
    expect(named.map((u) => new URL(u as string).host)).toEqual(['engine-f10.test']);
  });

  it('the default backend prints no warning', () => {
    delete process.env.TRUSTSHELL_API_URL;
    new TrustShell({ apiKey: TOKEN });
    expect(stderr.join('')).not.toContain('WARNING');
  });

  it('kernel receipt: refused for plain http elsewhere, nothing sent; no key to localhost http', async () => {
    const refused = await kernelReceipt('rcpt-12345678', { apiKey: TOKEN, apiUrl: EVIL, fetch: spy.fn });
    expect(refused.ok).toBe(false);
    expect(spy.calls).toEqual([]);
    await kernelReceipt('rcpt-12345678', { apiKey: TOKEN, apiUrl: 'http://localhost:9', fetch: spy.fn });
    expect(spy.calls).toHaveLength(1);
    expect(spy.calls[0]!.auth).toBeUndefined();
  });

  it('check "<sentence>": refused before sending', async () => {
    await expect(classifyClaim('Paris is the capital of France.', { env: { TRUSTSHELL_API_URL: EVIL }, fetchImpl: spy.fn })).rejects.toThrow(/must be https/);
    expect(spy.calls).toEqual([]);
  });

  it('my_job: NOT_CHECKED with the reason, nothing sent', async () => {
    const r = await myJob({ env: { TRUSTSHELL_API_URL: EVIL, TRUSTSHELL_AGENT_ID: 'trinity-shofet' }, fetchImpl: spy.fn as never });
    expect(r.status).toBe('NOT_CHECKED');
    expect(spy.calls).toEqual([]);
  });

  it('verify\'s engine lane does not post the claim to plain http elsewhere', async () => {
    const lane = await resolveLayaLane('a claim', { TRUSTSHELL_API_URL: EVIL, TRUSTSHELL_LAYA: 'engine' } as unknown as NodeJS.ProcessEnv, spy.fn);
    expect(lane).toBe('escalate');
    expect(spy.calls).toEqual([]);
  });

  it('status: NOT_CHECKED, nothing sent', async () => {
    process.env.TRUSTSHELL_API_URL = EVIL;
    const out: string[] = [];
    const io: CliIO = { out: (s) => out.push(s), err: (s) => out.push(s) };
    await run(parseArgs(['status']), {} as never, io);
    expect(out.join('\n')).toContain('NOT_CHECKED');
    expect(spy.calls).toEqual([]);
  });
});
