/**
 * `trustshell check` — logic under test WITHOUT the network.
 *
 * Written because the live path could not be exercised where this was
 * developed: the sandbox's shared egress IP is rate-limited by api.github.com,
 * so a live run there reports NOT CHECKED. Rather than ship the command on a
 * "it looked right" reading, the branches that decide a verdict — and the
 * stale-token fallback that keeps the "no account" promise true — are pinned
 * against a stubbed fetch here.
 */
import { parseRun, checkExitCode, formatCheckCard, runCheck, CheckError, DOES_NOT_PROVE } from '../src/lib/check';

const RUN_URL = 'https://github.com/DealAppSeo/trustshell/actions/runs/33942669558';

/** Stub `fetch`, recording every request so auth behaviour is assertable. */
function stubFetch(handler: (url: string, auth: string | undefined) => { status: number; body: unknown }) {
  const calls: { url: string; auth: string | undefined }[] = [];
  (globalThis as any).fetch = async (url: string, init?: any) => {
    const auth = init?.headers?.Authorization;
    calls.push({ url, auth });
    const { status, body } = handler(url, auth);
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body),
    };
  };
  return calls;
}

const okRun = (conclusion: string, status = 'completed') => ({
  conclusion,
  status,
  head_sha: 'abc123def456789',
  head_branch: 'main',
  name: 'check',
  display_title: 'a real commit title',
});
const jobs = (...conclusions: string[]) => ({
  total_count: conclusions.length,
  jobs: conclusions.map((c, i) => ({ name: `job-${i}`, conclusion: c })),
});

afterEach(() => { delete (globalThis as any).fetch; });

describe('parseRun', () => {
  it('extracts owner, repo and run id', () => {
    expect(parseRun(RUN_URL)).toEqual({ owner: 'DealAppSeo', repo: 'trustshell', runId: '33942669558' });
  });
  it.each(['', 'not-a-url', 'https://github.com/owner/repo', 'https://example.com/a/b/actions/runs/1'])(
    'rejects %p', (bad) => expect(parseRun(bad)).toBeNull(),
  );

  // The host must be github.com itself, not merely contain it, and a segment
  // must not be able to carry a `?` or `#` into the API path this builds.
  it.each([
    'https://evil-github.com/o/r/actions/runs/1',
    'https://github.com.attacker.test/o/r/actions/runs/1',
    'https://github.com/o/r?x=y/actions/runs/1',
  ])('rejects the lookalike %p', (bad) => expect(parseRun(bad)).toBeNull());

  it('accepts a URL with a trailing path, query or fragment', () => {
    for (const suffix of ['', '/', '/job/123', '?check_suite_focus=true', '#step:1:1']) {
      expect(parseRun(RUN_URL + suffix)).toMatchObject({ runId: '33942669558' });
    }
  });
});

describe('verdict', () => {
  it('COMPLETE when the run succeeded and every job passed', async () => {
    stubFetch((u) => (u.includes('/jobs') ? { status: 200, body: jobs('success', 'success') } : { status: 200, body: okRun('success') }));
    const r = await runCheck(RUN_URL, {});
    expect(r.verdict).toBe('COMPLETE');
    expect(checkExitCode(r.verdict)).toBe(0);
  });

  it('INCONSISTENT when GitHub calls the run a success but a job did not pass', async () => {
    stubFetch((u) => (u.includes('/jobs') ? { status: 200, body: jobs('success', 'failure') } : { status: 200, body: okRun('success') }));
    const r = await runCheck(RUN_URL, {});
    expect(r.verdict).toBe('INCONSISTENT');
    expect(checkExitCode(r.verdict)).toBe(1);
  });

  it('treats a skipped job as not-a-failure (matches GitHub semantics)', async () => {
    stubFetch((u) => (u.includes('/jobs') ? { status: 200, body: jobs('success', 'skipped') } : { status: 200, body: okRun('success') }));
    expect((await runCheck(RUN_URL, {})).verdict).toBe('COMPLETE');
  });

  it('FAILED when the run conclusion is not success', async () => {
    stubFetch((u) => (u.includes('/jobs') ? { status: 200, body: jobs('failure') } : { status: 200, body: okRun('failure') }));
    const r = await runCheck(RUN_URL, {});
    expect(r.verdict).toBe('FAILED');
    expect(checkExitCode(r.verdict)).toBe(1);
  });

  it('INCONCLUSIVE — not COMPLETE — when the jobs endpoint cannot be read', async () => {
    stubFetch((u) => (u.includes('/jobs') ? { status: 500, body: { message: 'boom' } } : { status: 200, body: okRun('success') }));
    const r = await runCheck(RUN_URL, {});
    expect(r.verdict).toBe('INCONCLUSIVE');
    // The point of the four-valued verdict: NOT CHECKED must not exit 0.
    expect(checkExitCode(r.verdict)).toBe(3);
    expect(r.checks.find((c) => c.label.startsWith('Every job'))!.detail).toMatch(/NOT CHECKED/);
  });

  it('a run still in progress is INCONCLUSIVE, never FAILED', async () => {
    // `conclusion` is null until a run finishes. Reading that as "not success"
    // accuses a build that is still running of having failed.
    stubFetch((u) =>
      u.includes('/jobs')
        ? { status: 200, body: { total_count: 0, jobs: [] } }
        : { status: 200, body: { ...okRun('', 'in_progress'), conclusion: null } },
    );
    const r = await runCheck(RUN_URL, {});
    expect(r.verdict).toBe('INCONCLUSIVE');
    expect(checkExitCode(r.verdict)).toBe(3);
    expect(r.checks.find((c) => c.label === 'The run succeeded')!.ok).toBeNull();
    expect(formatCheckCard(r)).toMatch(/NOT CHECKED/);
  });

  it('will not claim "every job passed" when it only saw some of them', async () => {
    // GitHub returns 30 by default and says total_count separately. Asserting a
    // pass over jobs never read is the exact defect this command exists to name.
    stubFetch((u) =>
      u.includes('/jobs')
        ? { status: 200, body: { total_count: 45, jobs: [{ name: 'a', conclusion: 'success' }] } }
        : { status: 200, body: okRun('success') },
    );
    const r = await runCheck(RUN_URL, {});
    expect(r.verdict).toBe('INCONCLUSIVE');
    expect(r.checks.find((c) => c.label.startsWith('Every job'))!.detail).toMatch(/45 jobs and returned 1/);
  });

  it('asks for the maximum page size so truncation is the exception', async () => {
    const calls = stubFetch((u) =>
      u.includes('/jobs') ? { status: 200, body: jobs('success') } : { status: 200, body: okRun('success') },
    );
    await runCheck(RUN_URL, {});
    expect(calls.some((c) => c.url.includes('per_page=100'))).toBe(true);
  });

  it('throws when the run itself cannot be fetched', async () => {
    stubFetch(() => ({ status: 404, body: { message: 'Not Found' } }));
    await expect(runCheck(RUN_URL, {})).rejects.toThrow(/404/);
  });

  it('flags a bad URL as a usage error, not a runtime one', async () => {
    await expect(runCheck('nope', {})).rejects.toMatchObject({ usage: true });
    await expect(runCheck('nope', {})).rejects.toBeInstanceOf(CheckError);
  });
});

describe('the "no account" promise survives a stale token', () => {
  it('retries anonymously when a present token is rejected with 401', async () => {
    const calls = stubFetch((u, auth) => {
      if (auth) return { status: 401, body: { message: 'Bad credentials' } };
      return u.includes('/jobs') ? { status: 200, body: jobs('success') } : { status: 200, body: okRun('success') };
    });
    const r = await runCheck(RUN_URL, { GITHUB_TOKEN: 'stale-token' });
    expect(r.verdict).toBe('COMPLETE');
    expect(r.authenticated).toBe(false);
    // Every endpoint was tried with the token, then again without it.
    expect(calls.filter((c) => c.auth).length).toBe(2);
    expect(calls.filter((c) => !c.auth).length).toBe(2);
  });

  it('uses a working token and reports it', async () => {
    stubFetch((u, auth) => {
      if (!auth) return { status: 403, body: { message: 'rate limited' } };
      return u.includes('/jobs') ? { status: 200, body: jobs('success') } : { status: 200, body: okRun('success') };
    });
    const r = await runCheck(RUN_URL, { GITHUB_TOKEN: 'good' });
    expect(r.authenticated).toBe(true);
  });
});

describe('the card', () => {
  it('always carries what it does not prove', async () => {
    stubFetch((u) => (u.includes('/jobs') ? { status: 200, body: jobs('success') } : { status: 200, body: okRun('success') }));
    const card = formatCheckCard(await runCheck(RUN_URL, {}));
    expect(card).toContain('What this does not prove');
    for (const line of DOES_NOT_PROVE) expect(card).toContain(line);
    expect(card).toContain('COMPLETE');
  });

  it('names api.github.com as the only host it dialled', async () => {
    stubFetch((u) => (u.includes('/jobs') ? { status: 200, body: jobs('success') } : { status: 200, body: okRun('success') }));
    const r = await runCheck(RUN_URL, {});
    expect(r.host).toBe('api.github.com');
  });
});
