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
    const [r] = one('All tests pass.', [ok('receipt test')]);
    expect(r!.verdict).toBe('NOT_CHECKED');
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
  const md = core.render(one('All tests pass. Build succeeds.', [bad('test'), ok('build')]), {
    sha: 'abcdef1234567',
    repoUrl: 'https://github.com/o/r',
  });

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
