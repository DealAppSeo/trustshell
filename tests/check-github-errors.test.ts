/**
 * What `check` says when GitHub will not hand over the run. No network: `fetch` is stubbed.
 *
 * Two answers a first-time user meets within minutes, and both used to print GitHub's raw text:
 *   - 404 for a run in a private repository (the first run most people try is their own), which
 *     read `check failed: GitHub 404: Not Found` and named neither cause;
 *   - 403 or 429 once the anonymous limit of 60 requests an hour is spent, which read as a
 *     permission error and did not say it lifts by itself or that GITHUB_TOKEN raises it.
 * The message still starts `GitHub <status>:`; lib/try-door.ts and the MCP `inspect_run` reason key on that.
 */
import { runCheck, CheckError } from '../src/lib/check';
import { publicWhy } from '../lib/try-door';

const RUN_URL = 'https://github.com/DealAppSeo/trustshell/actions/runs/33942669558';
const RESET = 1795083300; // 2026-11-19T10:15:00Z
const GITHUB_RATE_TEXT = "API rate limit exceeded for 203.0.113.7. (But here's the good news: Authenticated requests get a higher rate limit.)";

function stubFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  (globalThis as any).fetch = async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    text: async () => JSON.stringify(body),
  });
}

async function failure(env: Record<string, string> = {}): Promise<CheckError> {
  const e = await runCheck(RUN_URL, env).catch((x) => x);
  expect(e).toBeInstanceOf(CheckError);
  return e;
}

afterEach(() => { delete (globalThis as any).fetch; });

describe('check: a run GitHub does not show (404)', () => {
  it('names the run, and both causes: a wrong id or a private repository', async () => {
    stubFetch(404, { message: 'Not Found' });
    const e = await failure();
    expect(e.message).toMatch(/^GitHub 404: /);
    expect(e.message).toContain('run 33942669558');
    expect(e.message).toContain('DealAppSeo/trustshell');
    expect(e.message).toMatch(/private/);
    expect(e.message).toMatch(/public runs only/);
    expect(e.usage).toBe(false); // exit 3, not a usage error
  });
});

describe('check: the request limit is spent (403 or 429 with x-ratelimit-remaining: 0)', () => {
  it.each([403, 429])('%i without a token: says rate limited, when it resets, and that GITHUB_TOKEN raises it', async (status) => {
    stubFetch(status, { message: GITHUB_RATE_TEXT }, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(RESET) });
    const e = await failure();
    expect(e.message).toMatch(new RegExp(`^GitHub ${status}: rate limited`));
    expect(e.message).toContain(new Date(RESET * 1000).toISOString());
    expect(e.message).toContain('GITHUB_TOKEN');
    expect(e.message).not.toContain('203.0.113.7'); // GitHub's text, with the caller's address, is replaced
  });

  it('with a token that was used: does not tell the reader to set the token they already set', async () => {
    stubFetch(403, { message: GITHUB_RATE_TEXT }, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(RESET) });
    const e = await failure({ GITHUB_TOKEN: 'placeholder' });
    expect(e.message).toMatch(/^GitHub 403: rate limited/);
    expect(e.message).not.toMatch(/Set GITHUB_TOKEN/);
  });

  it('no usable reset header: still says rate limited, and invents no time', async () => {
    stubFetch(403, { message: GITHUB_RATE_TEXT }, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': 'soon' });
    const e = await failure();
    expect(e.message).toMatch(/^GitHub 403: rate limited/);
    expect(e.message).not.toMatch(/resets at/);
  });
});

describe('check: every other refusal keeps GitHub\'s own words', () => {
  it('a 403 that is not the rate limit', async () => {
    stubFetch(403, { message: 'Resource not accessible' }, { 'x-ratelimit-remaining': '41' });
    expect((await failure()).message).toBe('GitHub 403: Resource not accessible');
  });

  it('a response with no headers object at all', async () => {
    (globalThis as any).fetch = async () => ({ ok: false, status: 500, text: async () => '{"message":"boom"}' });
    expect((await failure()).message).toBe('GitHub 500: boom');
  });
});

describe('the anonymous try-door still shows the status and nothing else', () => {
  it.each([
    [404, { message: 'Not Found' }, {}],
    [403, { message: GITHUB_RATE_TEXT }, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(RESET) }],
  ] as const)('%i', async (status, body, headers) => {
    stubFetch(status, body, headers);
    expect(publicWhy(await failure(), 'fallback')).toBe(`GitHub ${status}`);
  });
});
