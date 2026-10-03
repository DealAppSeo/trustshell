/**
 * Receipts core: claims are read by plain patterns and judged only against check runs.
 * Three outcomes, never two, and never an accusation.
 */
export {};

type Run = { name: string; status: string; conclusion: string | null };
type Grouped = { kind: string; quote: string; sources: string[] };
type Result = Grouped & { verdict: 'VERIFIED' | 'FAILED' | 'NOT_CHECKED'; why: string };

const core = require('../receipts/core.js') as {
  MARKER: string;
  extractClaims: (text: string, source: string) => { kind: string; quote: string; source: string }[];
  groupClaims: (c: { kind: string; quote: string; source: string }[]) => Grouped[];
  judge: (g: Grouped[], runs: Run[], opts?: { selfPattern?: RegExp }) => Result[];
  render: (r: Result[], o?: { sha?: string; repoUrl?: string }) => string;
};

const kinds = (text: string) => core.extractClaims(text, 'PR description').map((c) => c.kind);
const ok = (name: string): Run => ({ name, status: 'completed', conclusion: 'success' });
const bad = (name: string): Run => ({ name, status: 'completed', conclusion: 'failure' });
const running = (name: string): Run => ({ name, status: 'in_progress', conclusion: null });
const one = (text: string, runs: Run[]) => core.judge(core.groupClaims(core.extractClaims(text, 'PR description')), runs);

describe('claims are read from what the PR says', () => {
  it.each([
    ['All tests pass.', 'tests'],
    ['21/21 tests passing', 'tests'],
    ['npm test passes locally', 'tests'],
    ['The test suite is green.', 'tests'],
    ['Fixed the failing test; all tests pass.', 'tests'],
    ['Build succeeds.', 'build'],
    ['tsc --noEmit is clean', 'typecheck'],
    ['eslint passes with no errors', 'lint'],
    ['`tsc --noEmit` is clean.', 'typecheck'],
    ['A note: tsc is clean and all tests pass locally.', 'tests'],
    ['Full jest run: 680 suites passed, 0 failed.', 'tests'],
  ])('%s -> %s', (text, kind) => {
    expect(kinds(text)).toContain(kind);
  });

  it.each([
    'Merge once tests pass.',
    'Please make sure tests pass before merging.',
    'If the build succeeds we ship.',
    'Not all tests pass yet.',
    'Tests do not pass on Windows.',
    '```\nall tests pass\n```',
    '> all tests pass',
    '<!-- tests pass -->',
    'Receipts reads what a PR claims: "all tests pass", "build succeeds", "tsc is clean".',
    'The agent wrote \u201call tests pass\u201d in its summary.',
    'is VERIFIED, because a check named `test` passed.',
    'Reads what a PR claims (tests pass, build succeeds, tsc clean, lint passes)',
    'Catches phrases such as tests pass or build succeeds.',
  ])('not a claim: %s', (text) => {
    expect(kinds(text)).toEqual([]);
  });
});

describe('each claim is judged only by check runs on the commit', () => {
  it('a green test job verifies a tests claim', () => {
    const [r] = one('All tests pass.', [ok('test (20.x)')]);
    expect(r!.verdict).toBe('VERIFIED');
  });

  it('a red test job fails it', () => {
    const [r] = one('All tests pass.', [ok('lint'), bad('jest')]);
    expect(r!.verdict).toBe('FAILED');
    expect(r!.why).toMatch(/jest finished failure/);
  });

  it('no test job is NOT CHECKED, even when every other check is green', () => {
    const [r] = one('All tests pass.', [ok('build'), ok('Vercel')]);
    expect(r!.verdict).toBe('NOT_CHECKED');
    expect(r!.why).toMatch(/cannot tell/);
  });

  it('a running test job is NOT CHECKED, never a pass', () => {
    const [r] = one('All tests pass.', [running('test')]);
    expect(r!.verdict).toBe('NOT_CHECKED');
    expect(r!.why).toMatch(/still running/);
  });

  it('skipped or cancelled is NOT CHECKED, not a pass and not a fail', () => {
    const [r] = one('All tests pass.', [{ name: 'test', status: 'completed', conclusion: 'skipped' }]);
    expect(r!.verdict).toBe('NOT_CHECKED');
  });

  it('the receipt job is never its own evidence', () => {
    const [r] = one('All tests pass.', [ok('receipt')]);
    expect(r!.verdict).toBe('NOT_CHECKED');
  });

  it('a check merely containing "receipt" is still evidence', () => {
    const [r] = one('All tests pass.', [ok('test'), bad('receipt-tests')]);
    expect(r!.verdict).toBe('FAILED');
  });

  it('one claim per kind, with every place it was said', () => {
    const claims = [
      ...core.extractClaims('All tests pass.', 'PR description'),
      ...core.extractClaims('tests pass', 'commit abc1234'),
    ];
    const g = core.groupClaims(claims);
    expect(g).toHaveLength(1);
    expect(g[0]!.sources).toEqual(['PR description', 'commit abc1234']);
  });
});

describe('the receipt never accuses', () => {
  const md = [
    core.render(one('All tests pass.', [bad('test')]), { sha: 'abc' }),
    core.render(one('Build succeeds.', [ok('build')]), { sha: 'abc' }),
  ].join('\n');
  it('carries the marker so the comment is updated, not duplicated', () => {
    expect(md.startsWith(core.MARKER)).toBe(true);
  });

  it('says what the evidence shows, in the three words', () => {
    expect(md).toMatch(/FAILED/);
    expect(md).toMatch(/VERIFIED/);
  });

  it('never calls anyone a liar', () => {
    expect(md).not.toMatch(/\b(?:lie|lied|lying|liar|fake|dishonest)\b/i);
  });

  it('always says what it does not prove', () => {
    expect(md).toMatch(/does not prove/);
  });

  it('a PR with no claims says so plainly', () => {
    expect(core.render([], { sha: 'abc' })).toMatch(/No claims/);
  });
});

describe('red-team findings (Grok, repid-engine dispatch 2026-10-03)', () => {
  it.each(['attestation', 'contest-results', 'latest-deploy', 'protest', 'rebuild-cache-warm'])(
    'a check named %s is not evidence for a tests claim',
    (name) => {
      const [r] = one('All tests pass.', [ok(name)]);
      expect(r!.verdict).toBe('NOT_CHECKED');
    },
  );

  it.each(['test', 'unit-tests', 'e2e (chromium)', 'jest', 'Test Suite', 'ci / test'])('a check named %s is', (name) => {
    const [r] = one('All tests pass.', [ok(name)]);
    expect(r!.verdict).toBe('VERIFIED');
  });

  it('PR text cannot ping, link, embed or break the table', () => {
    const md = core.render(
      one('All tests pass @everyone ![x](https://t.example/p.png) [l](https://e.example) <img src=x> | col', []),
      { sha: 'abc' },
    );
    const row = md.split('\n').find((l) => l.startsWith('| **tests**: All'))!;
    expect(row).not.toMatch(/(^|[^​])@everyone/);
    expect(row).not.toMatch(/!\[x\]\(/);
    expect(row).not.toMatch(/(^|[^\\])\[l\]\(/);
    expect(row).not.toMatch(/(^|[^\\])<img/);
    expect(row.split(/(?<!\\)\|/).length).toBe(6);
  });
});

describe('the comment it edits must be its own', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('skips a marker comment written by a person and posts a new one', async () => {
    const calls: { url: string; method: string }[] = [];
    globalThis.fetch = (async (url: string, init: { method?: string } = {}) => {
      calls.push({ url, method: init.method || 'GET' });
      if (url.includes('/comments?per_page=100')) {
        return new Response(JSON.stringify([{ id: 7, body: `${core.MARKER}\nplanted`, user: { type: 'User' } }]), { status: 200 });
      }
      return new Response(JSON.stringify({ id: 9 }), { status: 201 });
    }) as unknown as typeof fetch;
    const idx = require('../receipts/index.js') as { upsertComment: (r: string, n: number, t: string, b: string) => Promise<string> };
    expect(await idx.upsertComment('o/r', 1, 't', `${core.MARKER}\nreceipt`)).toBe('posted');
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
  });

  it('updates its own bot comment in place', async () => {
    const calls: { url: string; method: string }[] = [];
    globalThis.fetch = (async (url: string, init: { method?: string } = {}) => {
      calls.push({ url, method: init.method || 'GET' });
      if (url.includes('/comments?per_page=100')) {
        return new Response(JSON.stringify([{ id: 7, body: `${core.MARKER}\nold`, user: { type: 'Bot' } }]), { status: 200 });
      }
      return new Response(JSON.stringify({ id: 7 }), { status: 200 });
    }) as unknown as typeof fetch;
    const idx = require('../receipts/index.js') as { upsertComment: (r: string, n: number, t: string, b: string) => Promise<string> };
    expect(await idx.upsertComment('o/r', 1, 't', `${core.MARKER}\nnew`)).toBe('updated');
    expect(calls.find((c) => c.method === 'PATCH')!.url).toMatch(/\/issues\/comments\/7$/);
  });
});

// CC2's review of 33f78ea, every row reproduced against core.js at that head. Each was a false
// FAILED or false VERIFIED; each must now be NOT a verdict, or NOT CHECKED.
describe('CC2 review: text that is not a claim gets no verdict', () => {
  it.each([
    'Do all tests pass?',
    'Could you confirm the tests pass?',
    'Hopefully all tests pass now.',
    'Before this PR, all tests passed on main.',
    'Not all of the tests pass.',
    'None of the tests pass yet.',
    'Only 3/10 tests pass.',
    'Tests pass only because I skipped the flaky ones.',
  ])('%s', (text) => {
    expect(kinds(text)).toEqual([]);
  });

  it('a local claim is NOT CHECKED, never judged against CI', () => {
    for (const runs of [[bad('test')], [ok('test')]]) {
      const [r] = one('Tests passed locally.', runs);
      expect(r!.verdict).toBe('NOT_CHECKED');
      expect(r!.why).toMatch(/local run/);
    }
  });

  it('10/10 is still a claim', () => {
    expect(kinds('10/10 tests pass.')).toContain('tests');
  });
});

describe('CC2 review: check names cannot grant a false VERIFIED', () => {
  const cases: [string, Run[]][] = [
    ['Integration tests pass.', [ok('unit'), bad('integration')]],
    ['All tests pass.', [ok('test'), bad('playwright')]],
    ['E2E tests pass.', [ok('e2e-lint'), bad('cypress')]],
    ['All tests pass.', [ok('test (lint)'), bad('receipt-tests')]],
    ['tsc is clean.', [ok('PR types label')]],
    ['All tests pass.', [ok('Upload test results')]],
    ['Tests pass.', [ok('unit-price-sync')]],
    ['All tests pass.', [ok('spec-gate')]],
  ];
  it.each(cases)('%s with %j is not VERIFIED', (text, runs) => {
    const [r] = one(text, runs);
    expect(r!.verdict).not.toBe('VERIFIED');
  });

  it('a unit-only claim is not FAILED by a failing e2e check', () => {
    const [r] = one('Unit tests pass.', [ok('unit tests'), bad('e2e')]);
    expect(r!.verdict).not.toBe('FAILED');
  });

  it('a failing integration check fails an integration claim', () => {
    const [r] = one('Integration tests pass.', [bad('integration tests')]);
    expect(r!.verdict).toBe('FAILED');
  });

  it('any failed check on the commit blocks VERIFIED', () => {
    const [r] = one('Build succeeds.', [ok('build'), bad('deploy-preview')]);
    expect(r!.verdict).toBe('NOT_CHECKED');
    expect(r!.why).toMatch(/deploy-preview \(failure\)/);
  });
});

describe('the wait settles before it judges', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('a check created late is still waited for, not missed', async () => {
    let poll = 0;
    globalThis.fetch = (async (url: string) => {
      if (url.includes('/status')) return new Response(JSON.stringify({ statuses: [] }), { status: 200 });
      poll += 1;
      // Poll 1: only `test`, done. Poll 2: a late `integration` appears, still running. Then it fails.
      const runs =
        poll === 1
          ? [{ name: 'test', status: 'completed', conclusion: 'success' }]
          : poll === 2
            ? [{ name: 'test', status: 'completed', conclusion: 'success' }, { name: 'integration', status: 'in_progress', conclusion: null }]
            : [{ name: 'test', status: 'completed', conclusion: 'success' }, { name: 'integration', status: 'completed', conclusion: 'failure' }];
      return new Response(JSON.stringify({ check_runs: runs }), { status: 200 });
    }) as unknown as typeof fetch;
    const idx = require('../receipts/index.js') as {
      waitForOthers: (r: string, s: string, t: string, p: RegExp, timeout: number, poll: number, floor: number) => Promise<Run[]>;
    };
    const ev = await idx.waitForOthers('o/r', 'sha', 't', /^receipts?$/i, 5000, 1, 0);
    expect(ev.map((r) => r.name)).toContain('integration');
    const [r] = core.judge(core.groupClaims(core.extractClaims('All tests pass.', 'PR description')), ev);
    expect(r!.verdict).toBe('FAILED');
  });
});

describe('CC2 pass 2: a check that did not finish green blocks VERIFIED', () => {
  const run = (name: string, status: string, conclusion: string | null): Run => ({ name, status, conclusion });
  it.each([
    ['in_progress', null],
    ['queued', null],
    ['completed', 'cancelled'],
    ['completed', 'action_required'],
    ['completed', 'stale'],
  ])('another check %s/%s → NOT_CHECKED', (status, conclusion) => {
    const [r] = one('All tests pass.', [ok('test'), run('ci/circleci: build-and-verify', status, conclusion)]);
    expect(r!.verdict).toBe('NOT_CHECKED');
  });
  it.each(['skipped', 'neutral'])('another check %s still allows VERIFIED', (conclusion) => {
    const [r] = one('All tests pass.', [ok('test'), run('Buildkite', 'completed', conclusion)]);
    expect(r!.verdict).toBe('VERIFIED');
  });
});

describe('CC2 pass 2: deploy, preview and docs jobs are not test or build evidence', () => {
  it('a failing integration-deploy does not FAIL an integration claim', () => {
    const [r] = one('Integration tests pass.', [bad('integration-deploy')]);
    expect(r!.verdict).toBe('NOT_CHECKED');
  });
  it.each([
    ['E2E tests pass.', 'e2e-preview-deploy'],
    ['All tests pass.', 'test-deploy-preview'],
    ['Build passes.', 'build-docs'],
  ])('%s against a green %s is NOT_CHECKED', (text, name) => {
    const [r] = one(text, [ok(name)]);
    expect(r!.verdict).toBe('NOT_CHECKED');
  });
});

describe('CC2 pass 2: a subtype claim reads a check named only for the subtype', () => {
  it('Unit tests pass, with unit red, is FAILED', () => {
    const [r] = one('Unit tests pass.', [bad('unit'), ok('test')]);
    expect(r!.verdict).toBe('FAILED');
    expect(r!.why).toMatch(/^unit finished failure/);
  });
});

describe('every page of checks is read', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('a failing check on page 2 still blocks VERIFIED', async () => {
    globalThis.fetch = (async (url: string) => {
      if (url.includes('/status')) return new Response(JSON.stringify({ statuses: [] }), { status: 200 });
      const page = Number(new URL(url).searchParams.get('page'));
      const runs =
        page === 1
          ? Array.from({ length: 100 }, (_, i) => ({ name: i === 0 ? 'test' : `job-${i}`, status: 'completed', conclusion: 'success' }))
          : [{ name: 'deploy-check', status: 'completed', conclusion: 'failure' }];
      return new Response(JSON.stringify({ check_runs: runs }), { status: 200 });
    }) as unknown as typeof fetch;
    const idx = require('../receipts/index.js') as { evidenceFor: (r: string, s: string, t: string) => Promise<Run[]> };
    const ev = await idx.evidenceFor('o/r', 'sha', 't');
    expect(ev).toHaveLength(101);
    const [r] = core.judge(core.groupClaims(core.extractClaims('All tests pass.', 'PR description')), ev);
    expect(r!.verdict).toBe('NOT_CHECKED');
  });

  it('statuses are paged too: a red status on page 2 blocks VERIFIED', async () => {
    globalThis.fetch = (async (url: string) => {
      const page = Number(new URL(url).searchParams.get('page'));
      if (url.includes('/status')) {
        expect(new URL(url).searchParams.get('per_page')).toBe('100');
        const statuses =
          page === 1
            ? Array.from({ length: 100 }, (_, i) => ({ context: `ctx-${i}`, state: 'success' }))
            : [{ context: 'legacy-ci', state: 'failure' }];
        return new Response(JSON.stringify({ statuses }), { status: 200 });
      }
      return new Response(JSON.stringify({ check_runs: [ok('test')] }), { status: 200 });
    }) as unknown as typeof fetch;
    const idx = require('../receipts/index.js') as { evidenceFor: (r: string, s: string, t: string) => Promise<Run[]> };
    const ev = await idx.evidenceFor('o/r', 'sha', 't');
    expect(ev.some((r) => r.name === 'legacy-ci')).toBe(true);
    const [r] = core.judge(core.groupClaims(core.extractClaims('All tests pass.', 'PR description')), ev);
    expect(r!.verdict).toBe('NOT_CHECKED');
  });

  it('more check runs than it reads leaves the commit unsettled, never VERIFIED', async () => {
    globalThis.fetch = (async (url: string) => {
      if (url.includes('/status')) return new Response(JSON.stringify({ statuses: [] }), { status: 200 });
      const runs = Array.from({ length: 100 }, (_, i) => ({ name: i === 0 ? 'test' : `job-${i}`, status: 'completed', conclusion: 'success' }));
      return new Response(JSON.stringify({ check_runs: runs }), { status: 200 });
    }) as unknown as typeof fetch;
    const idx = require('../receipts/index.js') as { evidenceFor: (r: string, s: string, t: string) => Promise<Run[]> };
    const ev = await idx.evidenceFor('o/r', 'sha', 't');
    const [r] = core.judge(core.groupClaims(core.extractClaims('All tests pass.', 'PR description')), ev);
    expect(r!.verdict).toBe('NOT_CHECKED');
    expect(r!.why).toMatch(/not read/);
  });
});

describe('one sentence, two claims', () => {
  it('each row names the claim it judges', () => {
    const md = core.render(one('tsc is clean and all tests pass.', [ok('test'), ok('tsc')]), { sha: 'abc1234' });
    expect(md).toMatch(/\| \*\*type check\*\*: tsc is clean/);
    expect(md).toMatch(/\| \*\*tests\*\*: tsc is clean/);
  });
});

describe('single quotes never hide a claim (CC2 at ac442ff)', () => {
  it.each([
    "Rewrote the '90s-era parser; all tests pass on the maintainers' branch.",
    "Fixed the 'flaky test. All tests pass in the reviewers' CI run.",
    'Renamed the ‘check job; all tests pass and it’s green.',
    "It's ready: all tests pass.",
  ])('%s is still a claim', (text) => {
    expect(kinds(text)).toContain('tests');
  });
});
