/**
 * Receipts: evidence is read at the strongest level a check offers — the `run:` command of
 * the job, then the step name plus that step's own result, then the check name.
 *
 * WHY THESE EXIST. Matching a claim to a check by NAME made this repository unverifiable by
 * its own tool: the job that runs `tsc --noEmit` and `npx jest` is named `check`, and on the
 * head of #510 the only other checks were `Analyze (javascript-typescript)` and `gitleaks`.
 * Every claim, of every kind, read NOT CHECKED forever. The tempting fix — add `check` to the
 * word list — also matches `spell-check`, `check-licenses` and `dependency-check`, so it buys
 * verdicts with false VERIFIEDs. These tests pin the other fix: stop trusting the name.
 *
 * The direction matters as much as the verdicts. Reading steps may only ever ADD evidence or
 * take it away; it must never grant a pass the name alone would not have. Several tests below
 * exist only to hold that line.
 */
export {};

type Step = { name: string; conclusion: string | null };
type Run = { name: string; status: string; conclusion: string | null; steps?: Step[]; commands?: string[] };
type Result = { verdict: 'VERIFIED' | 'FAILED' | 'NOT_CHECKED'; why: string; level: string | null; label: string };

const core = require('../receipts/core.js') as {
  extractClaims: (text: string, source: string) => unknown[];
  groupClaims: (c: unknown[]) => unknown[];
  judge: (g: unknown[], runs: Run[]) => Result[];
  stepCouldMatter: (name: string) => boolean;
};
const wf = require('../receipts/workflow.js') as {
  jobCommands: (yaml: string, checkName: string) => string[] | null;
};

const judge = (text: string, runs: Run[]) => core.judge(core.groupClaims(core.extractClaims(text, 'PR description')), runs);
const one = (text: string, runs: Run[]) => judge(text, runs)[0]!;
const pick = (text: string, runs: Run[], label: string) => judge(text, runs).find((r) => r.label === label)!;

const step = (name: string, conclusion: string | null = 'success'): Step => ({ name, conclusion });
/** This repository's real `check` job, as the jobs API returns it. */
const checkJob = (...steps: Step[]): Run => ({
  name: 'check',
  status: 'completed',
  conclusion: 'success',
  steps: [step('Set up job'), step('Run actions/checkout@v4'), step('Install'), ...steps, step('Post Run actions/checkout@v4'), step('Complete job')],
});

describe('a job named for nothing in particular can now be read', () => {
  it('`check` with a passing `Unit tests` step verifies a tests claim', () => {
    const r = one('All tests pass.', [checkJob(step('Typecheck'), step('Unit tests'))]);
    expect(r.verdict).toBe('VERIFIED');
    expect(r.level).toBe('step');
    expect(r.why).toMatch(/step `Unit tests` in check/);
  });

  it('the same claim is NOT_CHECKED when only the name is available — the state before this change', () => {
    const r = one('All tests pass.', [{ name: 'check', status: 'completed', conclusion: 'success' }]);
    expect(r.verdict).toBe('NOT_CHECKED');
    expect(r.why).toMatch(/No check named for tests/);
  });

  it('one job answers two claims differently: typecheck passed, tests never ran', () => {
    const runs = [checkJob(step('Typecheck', 'success'), step('Unit tests', 'skipped'))];
    const text = 'tsc is clean and all tests pass.';
    expect(pick(text, runs, 'type check').verdict).toBe('VERIFIED');
    const tests = pick(text, runs, 'tests');
    expect(tests.verdict).toBe('NOT_CHECKED');
    expect(tests.why).toMatch(/\(skipped\)/);
  });

  it('a step that never ran at all reports `did not run`, not a pass', () => {
    const r = one('All tests pass.', [checkJob(step('Unit tests', null))]);
    expect(r.verdict).toBe('NOT_CHECKED');
    expect(r.why).toMatch(/did not run/);
  });

  it('a failing step is FAILED and the receipt names the step, not the job', () => {
    const r = one('All tests pass.', [checkJob(step('Unit tests', 'failure'))]);
    expect(r.verdict).toBe('FAILED');
    expect(r.why).toMatch(/step `Unit tests` in check finished failure/);
  });
});

describe('the command is the first level that is evidence rather than a label', () => {
  const withCmds = (...c: string[]): Run => ({ ...checkJob(step('Unit tests')), commands: c });

  it('a matching `run:` command upgrades the level and says so', () => {
    const r = one('All tests pass.', [withCmds('npm ci', "npx jest --testPathIgnorePatterns '/node_modules/'")]);
    expect(r.verdict).toBe('VERIFIED');
    expect(r.level).toBe('command');
    expect(r.why).toMatch(/workflow file at this commit runs a matching command/);
  });

  it('commands for another kind do not upgrade this one', () => {
    const r = one('All tests pass.', [withCmds('npm ci', 'npx tsc --noEmit')]);
    expect(r.verdict).toBe('VERIFIED');
    expect(r.level).toBe('step');
  });

  it('a command can never grant a verdict on its own: no matching step, no evidence', () => {
    const r = one('All tests pass.', [{ ...checkJob(step('Deploy preview')), commands: ['npx jest'] }]);
    expect(r.verdict).toBe('NOT_CHECKED');
    expect(r.level).toBeNull();
  });
});

describe('reading steps may only ADD evidence, never invent it', () => {
  it('a job named `test` whose steps run no tests is no longer evidence', () => {
    // Name-only, this check reads VERIFIED. That is the overclaim being removed: when the
    // steps are readable they are the answer, including when the answer is "it did not".
    const named: Run = { name: 'test', status: 'completed', conclusion: 'success' };
    expect(one('All tests pass.', [named]).verdict).toBe('VERIFIED');
    const read: Run = { ...named, steps: [step('Set up job'), step('Install'), step('Deploy'), step('Complete job')] };
    expect(one('All tests pass.', [read]).verdict).toBe('NOT_CHECKED');
  });

  it('scaffolding is never evidence, even when it names a runner', () => {
    const r = one('All tests pass.', [
      {
        name: 'check',
        status: 'completed',
        conclusion: 'success',
        steps: [step('Set up job'), step('Install Playwright'), step('Cache jest'), step('Run actions/setup-node@v4'), step('Complete job')],
      },
    ]);
    expect(r.verdict).toBe('NOT_CHECKED');
  });

  it('a check with no steps keeps name-level matching and admits the level out loud', () => {
    const r = one('All tests pass.', [{ name: 'jest', status: 'completed', conclusion: 'success' }]);
    expect(r.verdict).toBe('VERIFIED');
    expect(r.level).toBe('name');
    expect(r.why).toMatch(/label rather than evidence/);
  });

  it('another red check on the commit still blocks a step-level pass', () => {
    const r = one('All tests pass.', [checkJob(step('Unit tests')), { name: 'deploy-preview', status: 'completed', conclusion: 'failure' }]);
    expect(r.verdict).toBe('NOT_CHECKED');
    expect(r.why).toMatch(/may cover the same ground/);
  });

  it('a still-running job never passes on a step that already went green', () => {
    const job = { ...checkJob(step('Unit tests', 'success')), status: 'in_progress', conclusion: null };
    expect(one('All tests pass.', [job]).verdict).toBe('NOT_CHECKED');
  });

  it('a subtype claim reads a step named only for the subtype', () => {
    const r = one('Unit tests pass.', [checkJob(step('unit'))]);
    expect(r.verdict).toBe('VERIFIED');
    expect(r.level).toBe('step');
  });
});

describe('the workflow reader refuses rather than guessing', () => {
  const y = (s: string) => s.replace(/^\n/, '');

  it('reads inline and block-scalar commands from the named job', () => {
    expect(
      wf.jobCommands(
        y(`
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Unit tests
        run: npx jest
      - name: Many
        run: |
          npm ci
          npm run lint
`),
        'check',
      ),
    ).toEqual(['npx jest', 'npm ci\nnpm run lint']);
  });

  it('resolves a job whose display name overrides its key', () => {
    const text = y(`
jobs:
  analyze:
    name: Analyze (javascript-typescript)
    steps:
      - run: echo hi
`);
    expect(wf.jobCommands(text, 'Analyze (javascript-typescript)')).toEqual(['echo hi']);
    expect(wf.jobCommands(text, 'analyze')).toBeNull();
  });

  it('a `name:` nested under `outputs:` is not the job name (measured in this repo)', () => {
    expect(
      wf.jobCommands(
        y(`
jobs:
  build:
    outputs:
      name: \${{ steps.tag.outputs.name }}
    steps:
      - run: npm run build
`),
        'build',
      ),
    ).toEqual(['npm run build']);
  });

  it.each([
    ['no jobs: block', y('name: x\non:\n  push:\n')],
    ['two jobs that could both be this check', y('jobs:\n  a:\n    name: same\n    steps:\n      - run: x\n  b:\n    name: same\n    steps:\n      - run: y\n')],
    ['another job whose name is an expression and could resolve to this one', y('jobs:\n  check:\n    steps:\n      - run: npx jest\n  other:\n    name: \${{ inputs.n }}\n    steps:\n      - run: y\n')],
  ])('refuses: %s', (_label, text) => {
    expect(wf.jobCommands(text, 'check')).toBeNull();
  });

  it('a job that only `uses:` actions runs no commands, which is not the same as unreadable', () => {
    expect(wf.jobCommands(y('jobs:\n  check:\n    steps:\n      - uses: a/b@v1\n'), 'check')).toEqual([]);
  });
});

describe('an unnamed step shows its own command, and is judged as one', () => {
  // GitHub displays a step with no `name:` as `Run <command>`. That is the strongest label
  // available and free — and the one place a step name can be made to say anything, which
  // the live simulation on #510 found. An auto-named step must match a COMMAND pattern.
  const job = (...steps: Step[]): Run => ({ name: 'ci', status: 'completed', conclusion: 'success', steps });

  it('`Run npx jest` is evidence', () => {
    expect(one('All tests pass.', [job(step('Run npx jest'))]).verdict).toBe('VERIFIED');
  });

  it('a step that only ECHOES the claim is not evidence', () => {
    const r = one('All tests pass.', [job(step('Run echo "all tests pass"'))]);
    expect(r.verdict).toBe('NOT_CHECKED');
    expect(r.level).toBeNull();
  });

  it.each([
    ['Run actions/checkout@v4'],
    ['Run ./.github/actions/run-tests'],
    ['Run npm ci'],
    ['Run true # tests'],
  ])('%s is not evidence', (name) => {
    expect(one('All tests pass.', [job(step(name))]).verdict).toBe('NOT_CHECKED');
  });

  it('a script name may carry a prefix: `npm run sdk:build` is a build', () => {
    const r = one('The build passes.', [job(step('Run npm run sdk:build'))]);
    expect(r.verdict).toBe('VERIFIED');
  });

  it('a near-miss script name is not: `npm run build-report` builds nothing', () => {
    expect(one('The build passes.', [job(step('Run npm run build-report'))]).verdict).toBe('NOT_CHECKED');
  });
});

describe('stepCouldMatter decides whether a workflow fetch can add anything', () => {
  it.each([
    ['Unit tests', true],
    ['Typecheck', true],
    ['unit', true],
    ['Install', false],
    ['Run actions/checkout@v4', false],
    ['Set up job', false],
    ['Complete job', false],
    ['', false],
  ])('%s -> %s', (name, want) => {
    expect(core.stepCouldMatter(name)).toBe(want);
  });
});
