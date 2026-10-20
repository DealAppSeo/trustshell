/**
 * `trustshell check <run-url> --claims` — claim-to-evidence mapping, against RECORDED GitHub responses.
 *
 * The standard under test: never claim more than the evidence proves.
 *  - Each claim is atomic and gets its own verdict.
 *  - A green run supports "this workflow run succeeded" and nothing wider.
 *  - DENY BY DEFAULT: a verdict is given only when every line is a plain claim line (printable ASCII,
 *    starts with a letter, no Markdown or HTML, one sentence) that the templates read end to end.
 *    One line that is not blocks every verdict in the text.
 *
 * Fixtures (tests/fixtures/action-evidence/) are real api.github.com answers for trustshell's own
 * `check` workflow, recorded anonymously on 2026-10-19 and replayed here with no network:
 *   green-run.json   run 39290226738, push to main, conclusion success, 1 job      (unmodified)
 *   failed-run.json  run 39166529852, pull_request, conclusion failure, 1 job     (unmodified)
 *   no-jobs.json     green-run with the jobs list emptied                         (DERIVED, says so)
 * Further shapes are derived inline from those, each one named where it is made.
 *
 * Every input XC1 used across four adversarial rounds (side-session-notes/…/xc1-*-pr583.md) is in
 * the regression corpus below: none may yield exit 0 or a SUPPORTED outcome.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ACTION_EVIDENCE_SCHEMA,
  MAX_CLAIMS,
  MAX_CLAIM_TEXT,
  MAX_LINE,
  MIN_SUPPORTING_SHA,
  buildRecord,
  claimsExitCode,
  cleanCodePoints,
  digestRecord,
  inspectRunClaims,
  mapClaims,
  normalizeClaimText,
  plainLineProblem,
  readClaims,
  tallyClaims,
  urlAttempt,
  type ActionEvidenceRecord,
  type ClaimEntry,
  type Observation,
} from '../src/lib/action-evidence';
import { CheckError } from '../src/lib/check';
import { jcsSha256 } from '../src/lib/jcs';
import { DEMO_BANNER, mdCode, renderCardHtml, renderCardMarkdown } from '../src/lib/evidence-card';

const FX = join(__dirname, 'fixtures', 'action-evidence');
const NOW = () => new Date('2026-10-19T22:10:00.000Z');
const GREEN_SHA = '5cd68edc782fb2dd74e343e9335d3a8bcb04d5e5';
const CH = (...cps: number[]) => String.fromCodePoint(...cps);
const FENCE = '`'.repeat(3);

interface Fixture {
  _provenance: { modified: false | string };
  run_url: string;
  responses: Record<string, { status: number; body: any }>;
}

function load(name: string): Fixture {
  return JSON.parse(readFileSync(join(FX, name), 'utf8')) as Fixture;
}

const claimsFile = (name: string) => readFileSync(join(FX, 'claims', name), 'utf8');

/** Replay recorded responses. Any request that was not recorded fails the test rather than going out. */
function replay(fx: Fixture) {
  const calls: string[] = [];
  (globalThis as any).fetch = async (url: string) => {
    calls.push(url);
    const u = new URL(url);
    if (u.host !== 'api.github.com') throw new Error(`egress to ${u.host}`);
    const r = fx.responses[u.pathname + u.search];
    if (!r) throw new Error(`unrecorded request: ${url}`);
    return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => JSON.stringify(r.body) };
  };
  return calls;
}

/** A deep copy of a fixture with one response altered — for the derived shapes. */
function derive(name: string, alter: (fx: Fixture, runPath: string, jobsPath: string) => void): Fixture {
  const fx = load(name);
  const [runPath, jobsPath] = Object.keys(fx.responses) as [string, string];
  alter(fx, runPath, jobsPath);
  return fx;
}

async function inspect(fx: Fixture, claims: string, url = fx.run_url) {
  const calls = replay(fx);
  const out = await inspectRunClaims(url, claims, { env: {}, now: NOW });
  delete (globalThis as any).fetch;
  return { ...out, calls };
}

const only = (r: { claims: ClaimEntry[] } | ClaimEntry[], template: string) =>
  (Array.isArray(r) ? r : r.claims).filter((c) => c.template === template);
const verdicts = (r: { claims: ClaimEntry[] } | ClaimEntry[]) =>
  (Array.isArray(r) ? r : r.claims).map((c) => `${c.template}:${c.status}`);
const supported = (r: { claims: ClaimEntry[] } | ClaimEntry[]) => (Array.isArray(r) ? r : r.claims).filter((c) => c.status === 'SUPPORTED');
const OUTCOMES = new Set(['gha.run_succeeded', 'ci.all_checks_pass', 'ci.tests_pass', 'ci.build_unscoped']);

afterEach(() => {
  delete (globalThis as any).fetch;
});

describe('fixtures say what they are', () => {
  it('the recorded runs are unmodified and the derived one says it is derived', () => {
    expect(load('green-run.json')._provenance.modified).toBe(false);
    expect(load('failed-run.json')._provenance.modified).toBe(false);
    expect(load('no-jobs.json')._provenance.modified).toMatch(/^DERIVED/);
  });
});

describe('a valid green run', () => {
  it('records the observation field by field, as GitHub reported it', async () => {
    const { record } = await inspect(load('green-run.json'), claimsFile('narrow-true.txt'));
    const o = record.observation;
    expect(o).toMatchObject({
      platform: 'github-actions',
      host: 'api.github.com',
      url: 'https://github.com/DealAppSeo/trustshell/actions/runs/39290226738',
      owner: 'DealAppSeo',
      repo: 'trustshell',
      run_id: 39290226738,
      run_attempt: 1,
      workflow: { name: 'check', path: '.github/workflows/check.yml' },
      head_sha: GREEN_SHA,
      status: 'completed',
      conclusion: 'success',
      fetchedAt: '2026-10-19T22:10:00.000Z',
      freshness: 'LIVE',
    });
    expect(o.check.verdict).toBe('COMPLETE');
    expect(o.jobs).toEqual({
      http_status: 200,
      total: 1,
      items: [{ name: 'check', status: 'completed', conclusion: 'success', head_sha: GREEN_SHA, run_attempt: 1 }],
    });
  });

  it('holds ONLY schema, observation, claims, assurance and does_not_prove', async () => {
    const { record } = await inspect(load('green-run.json'), claimsFile('narrow-true.txt'));
    expect(Object.keys(record).sort()).toEqual(['assurance', 'claims', 'does_not_prove', 'observation', 'schema']);
    expect(record.schema).toBe(ACTION_EVIDENCE_SCHEMA);
    expect(record.schema).toBe('dev.trustshell.action-evidence/0.1-draft');
    expect(record.assurance).toEqual({ cryptographic_integrity: 'NOT_CHECKED', observation: 'PLATFORM_REPORTED' });
  });

  it('supports each narrow claim, one verdict per atomic claim, and exits 0', async () => {
    const { record } = await inspect(load('green-run.json'), claimsFile('narrow-true.txt'));
    expect(record.claims.map((c) => [c.claim, c.template, c.status])).toEqual([
      ['The check workflow passed', 'gha.run_succeeded', 'SUPPORTED'],
      ['on 5cd68edc782f', 'git.head_sha', 'SUPPORTED'],
      ['run 39290226738', 'gha.run_id', 'SUPPORTED'],
      ['attempt 1', 'gha.run_attempt', 'SUPPORTED'],
    ]);
    for (const c of record.claims) {
      expect(c.sentence).toBe('The check workflow passed on 5cd68edc782f, run 39290226738, attempt 1.');
      expect(c.evidence_fields.length).toBeGreaterThan(0);
      for (const f of c.evidence_fields) expect(f).toMatch(/^\/observation\//);
    }
    expect(claimsExitCode(record)).toBe(0);
  });

  it('dials api.github.com and nothing else: the two requests `check` makes', async () => {
    const { calls } = await inspect(load('green-run.json'), 'The workflow passed in run 39290226738.');
    expect(calls).toEqual([
      'https://api.github.com/repos/DealAppSeo/trustshell/actions/runs/39290226738',
      'https://api.github.com/repos/DealAppSeo/trustshell/actions/runs/39290226738/jobs?per_page=100',
    ]);
  });
});

// ── the plain-line grammar: deny by default ──────────────────────────────────────────────────────

describe('plain-line grammar', () => {
  it.each([
    ['The check workflow passed on 5cd68edc782f, run 39290226738, attempt 1.', null],
    ['The workflow passed: https://github.com/DealAppSeo/trustshell/actions/runs/39290226738', null],
    ["It doesn't fail, and coverage is 98%.", null],
    ['- The check workflow passed.', /start with a letter/],
    ['1. The check workflow passed.', /start with a letter/],
    [' The check workflow passed.', /start with a letter/],
    ['The check workflow passed (run 39290226738).', /Markdown or HTML/],
    ['The `check` workflow passed.', /Markdown or HTML/],
    ['The **check** workflow passed.', /Markdown or HTML/],
    ['~~The check workflow passed.~~', /Markdown or HTML|start with a letter/],
    ['The check workflow passed <!-- note -->', /Markdown or HTML/],
    ['The check workflow passed | ok', /Markdown or HTML/],
    ['The check workflow passed &#x274C;', /Markdown or HTML/],
    ['The check workflow passed $x$', /Markdown or HTML/],
    ['The check workflow passed \\', /Markdown or HTML/],
    ['Has the check workflow passed?', /question mark/],
    ['The check workflow passed. It is green.', /more than one sentence/],
    ['The check workflow passed' + CH(0x274c), /non-ASCII/],
    ['The check workflow ' + CH(0xff50) + 'assed', /non-ASCII/],
    ['The check' + CH(0x200b) + ' workflow passed', /non-ASCII/],
    ['The check workflow passed\tok', /non-ASCII or control/],
    ['A' + 'a'.repeat(MAX_LINE), /longer than/],
  ])('%p', (line, problem) => {
    if (problem === null) expect(plainLineProblem(line)).toBeNull();
    else expect(plainLineProblem(line)).toMatch(problem);
  });

  it('splits on \\n, \\r\\n and \\r, and ignores blank lines', () => {
    expect(readClaims('One.\r\nTwo.\rThree.\n\n   \nFour.').lines.map((l) => [l.lineNo, l.text])).toEqual([
      [1, 'One.'],
      [2, 'Two.'],
      [3, 'Three.'],
      [6, 'Four.'],
    ]);
  });

  it('one line that is not plain blocks every verdict in the text, and is listed with its line number', () => {
    const c = map1('The check workflow passed on 5cd68edc782f, run 39290226738.\n## Summary');
    expect(supported(c)).toEqual([]);
    expect(only(c, 'gha.run_succeeded')[0]!.reason).toMatch(/line 2: it holds Markdown or HTML syntax/);
    expect(only(c, 'excluded.markup')[0]!.claim).toBe('## Summary');
  });

  it('one plain line with unread words blocks every verdict in the text', () => {
    const c = map1('The check workflow passed on 5cd68edc782f, run 39290226738.\nThat is false.');
    expect(supported(c)).toEqual([]);
    expect(only(c, 'gha.run_succeeded')[0]!.reason).toMatch(/line 2: it has words no template reads/);
  });

  it('a line that opens with an auxiliary verb asks, and blocks the text', () => {
    for (const t of ['Has the check workflow passed on 5cd68edc782f.', 'And is CI green on 5cd68edc782f.']) {
      expect(supported(map1(t))).toEqual([]);
      expect(map1(t, FAILED).filter((e) => e.status === 'CONTRADICTED')).toEqual([]);
    }
  });

  it('a non-plain line is never read, but is listed, cleaned for display', () => {
    const c = map1('The check' + CH(0x202e) + ' workflow passed ' + CH(27) + '[2J');
    expect(c).toHaveLength(1);
    expect(c[0]!.template).toBe('excluded.markup');
    expect(c[0]!.claim).toBe('The check workflow passed [2J');
  });
});

describe('XC1 regression corpus: every input from four rounds; never exit 0, never a SUPPORTED outcome', () => {
  // The inputs live in a shared fixture, so the guided-mode tests run the same ones.
  const { CORPUS } = require('./fixtures/action-evidence/xc1-corpus.cjs') as { CORPUS: [string, string][] };

  it.each(CORPUS)('%s', (_label, text) => {
    for (const o of [OBS, FAILED]) {
      const c = map1(text, o);
      expect(c.filter((e) => e.status === 'SUPPORTED' && OUTCOMES.has(e.template))).toEqual([]);
      expect(claimsExitCode(buildRecord(o, text))).not.toBe(0);
    }
  });

  it('X9: the same run id in another repository keeps its own verdict (exit 1, not 0)', () => {
    const text = 'The check workflow passed: https://github.com/DealAppSeo/trustshell/actions/runs/39290226738 and https://github.com/evil/other/actions/runs/39290226738';
    expect(only(map1(text), 'gha.run_id').map((e) => e.status).sort()).toEqual(['CONTRADICTED', 'SUPPORTED']);
    expect(claimsExitCode(buildRecord(OBS, text))).toBe(1);
  });

  it('Y1: two lines with no blank line between are one paragraph on GitHub, so they block every verdict', () => {
    const c = map1('The check workflow passed in run 39290226738.\nCI passed on 5cd68edc782f.');
    expect(c.filter((e) => e.status !== 'NOT_CHECKED')).toEqual([]);
    expect(only(c, 'gha.run_succeeded')[0]!.reason).toMatch(/lines 1 and 2 are not separated by a blank line/);
    // The same two claims as separate paragraphs are each decided.
    expect(only(map1('The check workflow passed in run 39290226738.\n\nCI passed on 5cd68edc782f.'), 'gha.run_succeeded')[0]!.status).toBe('SUPPORTED');
  });

  it('Y1: a line holding only a no-break space is a paragraph line, not a blank one', () => {
    const { lines } = readClaims('One.\n' + CH(0xa0) + '\nTwo.');
    expect(lines.map((l) => l.lineNo)).toEqual([1, 2, 3]);
    expect(lines[1]!.problem).toMatch(/non-ASCII/);
  });

  it('Z1: a workflow display name can be shared by two files, so name plus commit is not compared', () => {
    const labeler = { ...OBS, workflow: { name: 'check', path: '.github/workflows/labeler.yml' } };
    for (const o of [OBS, labeler]) {
      const [c] = only(map1('The check workflow passed on 5cd68edc782f.', o), 'gha.run_succeeded');
      expect(c!.status).toBe('NOT_CHECKED');
      expect(c!.reason).toMatch(/only the run id identifies one/);
      expect(claimsExitCode(buildRecord(o, 'The check workflow passed on 5cd68edc782f.'))).toBe(3);
    }
  });

  it('W2: a GitHub URL starts at a host boundary; github.com inside another host name is not GitHub', () => {
    for (const host of ['agithub.com', 'thegithub.com', 'https://evil.github.com', 'https://x.com/github.com']) {
      expect(only(map1(`See ${host}/DealAppSeo/trustshell/actions/runs/39290226738`), 'gha.run_id')).toEqual([]);
      expect(only(map1(`See ${host}/DealAppSeo/trustshell/commit/5cd68edc782f`), 'git.head_sha')).toEqual([]);
    }
    for (const host of ['github.com', 'www.github.com', 'https://github.com', 'https://www.github.com']) {
      has(`${host}/DealAppSeo/trustshell/actions/runs/39290226738`, 'gha.run_id', 'SUPPORTED');
      has(`${host}/DealAppSeo/trustshell/commit/5cd68edc782f`, 'git.head_sha', 'SUPPORTED');
    }
  });

  it(`Z2: a SHA match shorter than ${MIN_SUPPORTING_SHA} characters is NOT_CHECKED; a mismatch of any length is CONTRADICTED`, () => {
    for (const sha of ['5cd68ed', '5cd68edc', '5cd68edc782']) {
      const [c] = only(map1(`Fixed in ${sha}.`), 'git.head_sha');
      expect(c!.status).toBe('NOT_CHECKED');
      expect(c!.reason).toMatch(/do not identify one commit/);
    }
    has('Fixed in 5cd68edc782f.', 'git.head_sha', 'SUPPORTED');
    has('Fixed in 5cd68ee.', 'git.head_sha', 'CONTRADICTED');
  });
});

// ── what a run can and cannot support ─────────────────────────────────────────────────────────────

describe('a misleading green workflow supports nothing wider than itself', () => {
  it('"all tests pass" and "all checks pass" stay NOT_CHECKED on a green run; only the citations stand', async () => {
    const { record } = await inspect(load('green-run.json'), claimsFile('misleading-green.txt'));
    expect(only(record, 'ci.tests_pass').map((c) => c.status)).toEqual(['NOT_CHECKED']);
    expect(only(record, 'ci.all_checks_pass').map((c) => c.status)).toEqual(['NOT_CHECKED']);
    expect(only(record, 'excluded.fix').map((c) => c.status)).toEqual(['NOT_CHECKED']);
    expect(only(record, 'excluded.readiness').map((c) => c.status)).toEqual(['NOT_CHECKED']);
    expect(supported(record).map((c) => c.claim)).toEqual(['on 5cd68edc782f', 'in 5cd68edc782f']);
    expect(only(record, 'ci.tests_pass')[0]!.reason).toMatch(/consistent with this claim but does not establish it/);
    expect(only(record, 'ci.all_checks_pass')[0]!.reason).toMatch(/other checks on this commit were not read/);
    expect(claimsExitCode(record)).toBe(3);
  });

  it('XC1 F7: "the workflow passed on <sha>" is not vouched for by whichever workflow ran on that commit', async () => {
    const fx = derive('green-run.json', (f, r) => {
      f.responses[r]!.body.name = 'Labeler';
      f.responses[r]!.body.path = '.github/workflows/labeler.yml';
    });
    const { record } = await inspect(fx, 'The workflow passed on 5cd68edc782f.');
    const [c] = only(record, 'gha.run_succeeded');
    expect(c!.status).toBe('NOT_CHECKED');
    expect(c!.reason).toMatch(/A commit has many workflow runs/);
    expect(claimsExitCode(record)).toBe(3);
  });

  it('XC1 F1: an attempt number alone ties nothing to this run', () => {
    const [c] = only(map1('The workflow passed on attempt 1.'), 'gha.run_succeeded');
    expect(c!.status).toBe('NOT_CHECKED');
    expect(c!.reason).toMatch(/cites neither this run's commit nor its run id/);
  });

  it('an outcome claim the line never ties to this run is not compared', () => {
    expect(verdicts(map1('The workflow passed.'))).toEqual(['gha.run_succeeded:NOT_CHECKED']);
  });

  it('a green run is not evidence for a line about another commit', () => {
    expect(verdicts(map1('The workflow passed on deadbeef1.'))).toEqual(['gha.run_succeeded:NOT_CHECKED', 'git.head_sha:CONTRADICTED']);
  });

  it('a citation on one line ties nothing on the next', () => {
    expect(only(map1('CI passed on run 39290226738.\n\nThe run passed.'), 'gha.run_succeeded')[0]!.status).toBe('NOT_CHECKED');
  });

  it('a line that cites this run is still judged on its own when another line is wrong', () => {
    const c = map1('The check workflow passed on 5cd68edc782f, run 39290226738.\n\nFixed in deadbeef1.');
    expect(only(c, 'gha.run_succeeded')[0]!.status).toBe('SUPPORTED');
    expect(only(c, 'git.head_sha').map((e) => e.status)).toEqual(['SUPPORTED', 'CONTRADICTED']);
  });

  it('the same run id in another repository is a different run', () => {
    const c = map1('The workflow passed: https://github.com/someone/else/actions/runs/39290226738');
    expect(only(c, 'gha.run_id')[0]!.status).toBe('CONTRADICTED');
    expect(only(c, 'gha.run_succeeded')[0]!.status).toBe('NOT_CHECKED');
  });
});

describe('a claim naming the wrong SHA', () => {
  it('is CONTRADICTED, names both values, leaves the rest uncompared, and exits 1', async () => {
    const { record } = await inspect(load('green-run.json'), claimsFile('wrong-sha.txt'));
    const [sha] = only(record, 'git.head_sha');
    expect(sha!.status).toBe('CONTRADICTED');
    expect(sha!.claim).toBe('in a1b2c3d4');
    expect(sha!.reason).toContain('a1b2c3d4');
    expect(sha!.reason).toContain('5cd68edc782f');
    expect(only(record, 'excluded.fix')[0]!.status).toBe('NOT_CHECKED');
    expect(only(record, 'ci.all_checks_pass')[0]!.status).toBe('NOT_CHECKED');
    expect(claimsExitCode(record)).toBe(1);
  });
});

describe('a claim naming the wrong run attempt', () => {
  it('splits run and attempt into separate verdicts, and exits 1', async () => {
    const { record } = await inspect(load('green-run.json'), claimsFile('wrong-attempt.txt'));
    expect(only(record, 'gha.run_id')[0]!.status).toBe('SUPPORTED');
    const [attempt] = only(record, 'gha.run_attempt');
    expect(attempt!.status).toBe('CONTRADICTED');
    expect(attempt!.reason).toMatch(/attempt 2.*attempt 1/);
    expect(only(record, 'ci.all_checks_pass')[0]!.status).toBe('NOT_CHECKED');
    expect(claimsExitCode(record)).toBe(1);
  });

  it('a URL naming an attempt GitHub did not answer for records nothing', async () => {
    const fx = load('green-run.json');
    replay(fx);
    await expect(inspectRunClaims(fx.run_url + '/attempts/2', 'x', { env: {}, now: NOW })).rejects.toBeInstanceOf(CheckError);
  });

  it('a URL naming the attempt GitHub did answer for is accepted', async () => {
    const fx = load('green-run.json');
    const { record } = await inspect(fx, 'x', fx.run_url + '/attempts/1');
    expect(record.observation.run_attempt).toBe(1);
  });

  it('reads the attempt from a URL', () => {
    expect(urlAttempt('https://github.com/o/r/actions/runs/123/attempts/2')).toBe(2);
    expect(urlAttempt('https://github.com/o/r/actions/runs/123/attempts/2/job/9')).toBe(2);
    expect(urlAttempt('https://github.com/o/r/actions/runs/123')).toBeNull();
  });
});

describe('missing evidence decides nothing', () => {
  const CLAIM = 'The check workflow passed in run 39290226738.';
  const runSucceeded = (r: ActionEvidenceRecord) => only(r, 'gha.run_succeeded')[0]!;

  it('no jobs at all (derived fixture)', async () => {
    const { record } = await inspect(load('no-jobs.json'), CLAIM);
    expect(record.observation.check.verdict).toBe('INCONCLUSIVE');
    expect(runSucceeded(record).status).toBe('NOT_CHECKED');
    expect(runSucceeded(record).reason).toMatch(/no jobs/);
    expect(claimsExitCode(record)).toBe(3);
  });

  it('the jobs endpoint answers 404 (derived: jobs response replaced)', async () => {
    const fx = derive('green-run.json', (f, _r, j) => {
      f.responses[j] = { status: 404, body: { message: 'Not Found' } };
    });
    const { record } = await inspect(fx, CLAIM);
    expect(runSucceeded(record).status).toBe('NOT_CHECKED');
    expect(runSucceeded(record).reason).toMatch(/HTTP 404/);
  });

  it('GitHub reports more jobs than it returned (derived: total_count raised)', async () => {
    const fx = derive('green-run.json', (f, _r, j) => {
      f.responses[j]!.body.total_count = 45;
    });
    const { record } = await inspect(fx, CLAIM);
    expect(runSucceeded(record).status).toBe('NOT_CHECKED');
    expect(runSucceeded(record).reason).toMatch(/45 jobs and returned 1/);
  });

  it('the run has not finished (derived: status in_progress, conclusion null)', async () => {
    const fx = derive('green-run.json', (f, r) => {
      f.responses[r]!.body.status = 'in_progress';
      f.responses[r]!.body.conclusion = null;
    });
    const { record } = await inspect(fx, CLAIM + '\n\nAll checks pass on 5cd68edc782f.');
    expect(runSucceeded(record).status).toBe('NOT_CHECKED');
    expect(only(record, 'ci.all_checks_pass')[0]!.status).toBe('NOT_CHECKED');
    expect(claimsExitCode(record)).toBe(3);
  });

  it('every job was skipped (derived: job conclusion skipped)', async () => {
    const fx = derive('green-run.json', (f, _r, j) => {
      f.responses[j]!.body.jobs[0].conclusion = 'skipped';
    });
    const { record } = await inspect(fx, CLAIM);
    expect(runSucceeded(record).status).toBe('NOT_CHECKED');
    expect(runSucceeded(record).reason).toMatch(/skipped/);
  });

  it('a job that reports a different commit (derived: job head_sha changed)', async () => {
    const fx = derive('green-run.json', (f, _r, j) => {
      f.responses[j]!.body.jobs[0].head_sha = 'f'.repeat(40);
    });
    expect(runSucceeded((await inspect(fx, CLAIM)).record).status).toBe('NOT_CHECKED');
  });

  it('XC1 L4: a job with no head_sha cannot be tied to the commit either (derived: job head_sha removed)', async () => {
    const fx = derive('green-run.json', (f, _r, j) => {
      delete f.responses[j]!.body.jobs[0].head_sha;
    });
    expect(runSucceeded((await inspect(fx, CLAIM)).record).status).toBe('NOT_CHECKED');
  });

  it('a green run with a failed job: the record disagrees with itself (derived: job conclusion failure)', async () => {
    const fx = derive('green-run.json', (f, _r, j) => {
      f.responses[j]!.body.jobs[0].conclusion = 'failure';
    });
    const { record } = await inspect(fx, CLAIM + '\n\nAll checks pass on 5cd68edc782f.');
    expect(record.observation.check.verdict).toBe('INCONSISTENT');
    expect(runSucceeded(record).status).toBe('NOT_CHECKED');
    // A failed job is a failed check run: that does refute "all checks pass".
    expect(only(record, 'ci.all_checks_pass')[0]!.status).toBe('CONTRADICTED');
  });
});

describe('a failed run (recorded)', () => {
  it('contradicts "the check workflow passed" and "all checks pass", never "all tests pass"', async () => {
    const { record } = await inspect(load('failed-run.json'), 'The check workflow passed in run 39166529852.\n\nAll checks pass on b8a17cfba1d3.\n\nAll tests pass on b8a17cfba1d3.');
    expect(record.observation.conclusion).toBe('failure');
    expect(only(record, 'gha.run_succeeded')[0]!.status).toBe('CONTRADICTED');
    expect(only(record, 'ci.all_checks_pass')[0]!.status).toBe('CONTRADICTED');
    expect(only(record, 'ci.tests_pass')[0]!.status).toBe('NOT_CHECKED');
    expect(only(record, 'ci.tests_pass')[0]!.reason).toMatch(/does not establish that a test failed/);
    expect(claimsExitCode(record)).toBe(1);
  });

  it('"the workflow passed on <sha>" names no workflow, so a red run on that commit does not contradict it either', async () => {
    const { record } = await inspect(load('failed-run.json'), 'The workflow passed on b8a17cfba1d3.');
    expect(only(record, 'gha.run_succeeded')[0]!.status).toBe('NOT_CHECKED');
  });

  it('a cancelled run contradicts "the workflow passed" but not "all checks pass" (derived: run and job cancelled)', async () => {
    const fx = derive('failed-run.json', (f, r, j) => {
      f.responses[r]!.body.conclusion = 'cancelled';
      f.responses[j]!.body.jobs[0].conclusion = 'cancelled';
    });
    const { record } = await inspect(fx, 'The check workflow passed in run 39166529852.\n\nAll checks pass on b8a17cfba1d3.');
    expect(only(record, 'gha.run_succeeded')[0]!.status).toBe('CONTRADICTED');
    expect(only(record, 'ci.all_checks_pass')[0]!.status).toBe('NOT_CHECKED');
  });

  it('a cancelled run whose job FAILED does contradict "all checks pass" (derived: run cancelled, job left failed)', async () => {
    const fx = derive('failed-run.json', (f, r) => {
      f.responses[r]!.body.conclusion = 'cancelled';
    });
    expect(only((await inspect(fx, 'All checks pass on b8a17cfba1d3.')).record, 'ci.all_checks_pass')[0]!.status).toBe('CONTRADICTED');
  });

  it('a finished run with no conclusion decides nothing (derived: conclusion null, status completed)', async () => {
    const fx = derive('failed-run.json', (f, r, j) => {
      f.responses[r]!.body.conclusion = null;
      f.responses[j]!.body.jobs[0].conclusion = null;
    });
    const { record } = await inspect(fx, 'The check workflow passed in run 39166529852.\n\nAll checks pass on b8a17cfba1d3.');
    expect(only(record, 'gha.run_succeeded')[0]!.status).toBe('NOT_CHECKED');
    expect(only(record, 'ci.all_checks_pass')[0]!.status).toBe('NOT_CHECKED');
  });

  it('the run failing makes the exit 1 even when no claim is about the outcome', async () => {
    const { record } = await inspect(load('failed-run.json'), 'See run 39166529852.');
    expect(verdicts(record)).toEqual(['gha.run_id:NOT_CHECKED', 'unmapped:NOT_CHECKED']);
    expect(claimsExitCode(record)).toBe(1);
  });
});

describe('a PR description in Markdown', () => {
  let record: ActionEvidenceRecord;
  beforeAll(async () => {
    record = (await inspect(load('green-run.json'), claimsFile('overclaiming-pr.md'))).record;
  });

  it('is not certifiable: nothing SUPPORTED or CONTRADICTED, and exit 3', () => {
    expect(supported(record)).toEqual([]);
    expect(tallyClaims(record.claims).CONTRADICTED).toBe(0);
    expect(claimsExitCode(record)).toBe(3);
  });

  it('lists every non-blank line, the Markdown ones as written with their line numbers', () => {
    const markup = only(record, 'excluded.markup');
    expect(markup.map((c) => c.claim)).toContain('## Summary');
    expect(markup.map((c) => c.claim)).toContain('<!-- Describe your change. Delete this comment. -->');
    expect(markup.map((c) => c.claim)).toContain('- [ ] Docs updated');
    for (const c of markup) expect(c.reason).toMatch(/^Line \d+ is not certifiable/);
  });

  it('still names what each plain line claims, NOT_CHECKED', () => {
    for (const t of ['excluded.fix', 'excluded.no_bugs', 'excluded.readiness']) expect(only(record, t)[0]!.status).toBe('NOT_CHECKED');
  });
});

// ── the templates, directly ──────────────────────────────────────────────────────────────────────

let OBS: Observation;
let FAILED: Observation;
beforeAll(async () => {
  OBS = (await inspect(load('green-run.json'), 'x')).record.observation;
  FAILED = (await inspect(load('failed-run.json'), 'x')).record.observation;
});

const map1 = (text: string, o: Observation = OBS): ClaimEntry[] => mapClaims(text, o);
const has = (text: string, template: string, status: string, o: Observation = OBS) =>
  expect(verdicts(map1(text, o))).toContain(`${template}:${status}`);

describe('template: gha.run_succeeded (this workflow run, explicitly)', () => {
  it.each([
    'The workflow passed in run 39290226738.',
    'Workflow run 39290226738 passed.',
    'Run 39290226738 succeeded.',
    'The check workflow run 39290226738 passed.',
  ])('%p is SUPPORTED on the green run', (t) => has(t, 'gha.run_succeeded', 'SUPPORTED'));

  it.each(['The workflow passed on 5cd68edc782f.', 'The pipeline is green on 5cd68edc782f.', 'The check workflow passed on 5cd68edc782f.'])(
    '%p cites the commit but not the run, so it is not compared (XC1 F7, Z1: a display name can be shared)',
    (t) => has(t, 'gha.run_succeeded', 'NOT_CHECKED'),
  );

  it.each(['The deploy workflow passed on 5cd68edc782f.', 'The release workflow succeeded on 5cd68edc782f.', 'The CI workflow passed on 5cd68edc782f.'])(
    '%p names another workflow, so the check workflow is not evidence for it',
    (t) => {
      const [c] = only(map1(t), 'gha.run_succeeded');
      expect(c!.status).toBe('NOT_CHECKED');
      expect(c!.reason).toMatch(/names a workflow other than the inspected one/);
      expect(c!.reason).not.toMatch(/deploy|release|\bCI\b/);
    },
  );

  it('"the job passed" is about one job, not the run', () => {
    const c = map1('The job passed on 5cd68edc782f.');
    expect(only(c, 'gha.run_succeeded')).toEqual([]);
    expect(supported(c)).toEqual([]);
  });

  it('is CONTRADICTED by the failed run', () => has('The check workflow passed in run 39166529852.', 'gha.run_succeeded', 'CONTRADICTED', FAILED));

  it('"the tests run passed" is not read as this workflow run', () => {
    expect(only(map1('The tests run passed on 5cd68edc782f.'), 'gha.run_succeeded')).toEqual([]);
  });
});

describe('template: ci.all_checks_pass (every check: one run can refute, never establish)', () => {
  it.each(['All checks pass on 5cd68edc782f.', 'CI is green on 5cd68edc782f.', 'CI passed on 5cd68edc782f.', 'Everything is green on 5cd68edc782f.', 'Checks are green on 5cd68edc782f.', 'It passes all checks on 5cd68edc782f.'])(
    '%p is NOT_CHECKED on a green run, CONTRADICTED on a failed one',
    (t) => {
      has(t, 'ci.all_checks_pass', 'NOT_CHECKED');
      has(t.replace('5cd68edc782f', 'b8a17cfba1d3'), 'ci.all_checks_pass', 'CONTRADICTED', FAILED);
    },
  );

  it('"lint checks" or "my checks" are not all checks, so a red run decides nothing', () => {
    for (const t of ['The lint checks pass on b8a17cfba1d3.', 'My checks pass on b8a17cfba1d3.']) {
      expect(map1(t, FAILED).filter((e) => e.status !== 'NOT_CHECKED')).toEqual([]);
    }
  });

  it('"all required checks pass" is its own claim, never decided by one run (only --guided reads the required checks)', () => {
    const c = map1('All required checks pass on b8a17cfba1d3.', FAILED);
    expect(c.filter((e) => e.template.startsWith('ci.')).map((e) => `${e.template}:${e.status}`)).toEqual(['ci.required_checks_pass:NOT_CHECKED']);
  });
});

describe('template: ci.tests_pass (never decided by a run record)', () => {
  it.each(['All tests pass on 5cd68edc782f.', 'The unit tests are green on 5cd68edc782f.', 'It passes all tests on 5cd68edc782f.', 'Tests passed on 5cd68edc782f.'])(
    '%p is NOT_CHECKED on a green run and on a failed one',
    (t) => {
      has(t, 'ci.tests_pass', 'NOT_CHECKED');
      has(t.replace('5cd68edc782f', 'b8a17cfba1d3'), 'ci.tests_pass', 'NOT_CHECKED', FAILED);
    },
  );
});

describe('qualified, negated, local and unscoped pass claims', () => {
  it.each(['Most tests pass on 5cd68edc782f.', 'The check workflow passed on 5cd68edc782f but lint fails.', 'Some checks are green on 5cd68edc782f.'])('%p is NOT_CHECKED, with the reason named', (t) => {
    const outcome = map1(t).filter((c) => OUTCOMES.has(c.template));
    expect(outcome.length).toBeGreaterThan(0);
    for (const c of outcome) {
      expect(c.status).toBe('NOT_CHECKED');
      expect(c.reason).toMatch(/changes what the claim means|Not every line of this text/);
    }
  });

  it('a negated claim the templates do not read is still listed, and blocks the text', () => {
    expect(map1('CI is not green on 5cd68edc782f.').map((c) => [c.template, c.status, c.claim])).toEqual([
      ['git.head_sha', 'NOT_CHECKED', 'on 5cd68edc782f'],
      ['unmapped', 'NOT_CHECKED', 'CI is not green'],
    ]);
  });

  it('"tests pass locally" is about a run this record cannot see', () => {
    const c = map1('All tests pass locally on 5cd68edc782f.');
    expect(only(c, 'ci.tests_pass')).toEqual([]);
    expect(only(c, 'excluded.local_run')[0]!.status).toBe('NOT_CHECKED');
  });

  it('"the build passes" names no workflow, so it is compared with nothing', () => {
    has('The build is green on b8a17cfba1d3.', 'ci.build_unscoped', 'NOT_CHECKED', FAILED);
  });
});

describe('templates: citations (git.head_sha, gha.run_id, gha.run_attempt)', () => {
  it.each([
    'on commit 5cd68edc782f',
    'Fixed in 5cd68edc782f',
    'at 5cd68edc782fb2dd74e343e9335d3a8bcb04d5e5',
    'commit 5CD68EDC782F',
    'commit: 5cd68edc782f',
    'https://github.com/DealAppSeo/trustshell/commit/5cd68edc782f',
  ])('%p matches head_sha', (t) => has(t, 'git.head_sha', 'SUPPORTED'));

  it.each(['fixed in deadbeef', 'commit 1234567', 'on commit 5cd68edd'])('%p is CONTRADICTED', (t) => has(t, 'git.head_sha', 'CONTRADICTED'));

  it('a run id or a count is not read as a SHA', () => {
    expect(only(map1('see run on 39290226738'), 'git.head_sha')).toEqual([]);
    expect(only(map1('Done in 1234567 steps'), 'git.head_sha')).toEqual([]);
  });

  it.each(['run 39290226738', 'run id 39290226738', 'https://github.com/DealAppSeo/trustshell/actions/runs/39290226738'])('%p cites the run', (t) =>
    has(t, 'gha.run_id', 'SUPPORTED'),
  );

  it('another run id is CONTRADICTED', () => has('run 39166529852', 'gha.run_id', 'CONTRADICTED'));

  it('run and attempt get separate verdicts, also from a link', () => {
    expect(verdicts(map1('https://github.com/DealAppSeo/trustshell/actions/runs/39290226738/attempts/2'))).toEqual(['gha.run_id:SUPPORTED', 'gha.run_attempt:CONTRADICTED']);
    has('attempt 1', 'gha.run_attempt', 'SUPPORTED');
  });

  it('a run named by link and in prose is one citation', () => {
    expect(only(map1('run 39290226738: https://github.com/DealAppSeo/trustshell/actions/runs/39290226738'), 'gha.run_id')).toHaveLength(1);
  });

  it('a citation in a line with unread words is not decided (XC1 E)', () => {
    has('The bug was introduced in a1b2c3d4 and fixed later.', 'git.head_sha', 'NOT_CHECKED');
  });
});

describe('exclusions: named, NOT_CHECKED, never SUPPORTED', () => {
  it.each([
    ['It is fully secure.', 'excluded.security', 'fully secure'],
    ['No vulnerabilities remain.', 'excluded.security', 'vulnerabilities'],
    ['All bugs fixed.', 'excluded.no_bugs', 'All bugs'],
    ['The code is bug-free.', 'excluded.no_bugs', 'bug-free'],
    ['Production ready.', 'excluded.readiness', 'Production ready'],
    ['Safe to merge.', 'excluded.readiness', 'Safe to merge'],
    ['Resolves the race.', 'excluded.fix', 'Resolves'],
    ['Coverage is 98%.', 'excluded.coverage', 'Coverage is 98%'],
    ['Deployed to staging.', 'excluded.deployment', 'Deployed'],
    ['Latency is lower.', 'excluded.performance', 'Latency'],
    ['Reviewed and approved.', 'excluded.review', 'Reviewed'],
    ['Done.', 'excluded.completion', 'Done'],
    ['All 1,204 tests pass.', 'excluded.test_count', '1,204 tests'],
  ])('%p → %s on %p', (t, template, span) => {
    const c = map1(t);
    const x = only(c, template)[0]!;
    expect(x.status).toBe('NOT_CHECKED');
    expect(x.claim).toBe(span);
    expect(supported(c)).toEqual([]);
  });

  it('a line nothing reads is one unmapped NOT_CHECKED entry', () => {
    expect(map1('I refactored the parser.').map((c) => [c.template, c.status, c.claim])).toEqual([['unmapped', 'NOT_CHECKED', 'I refactored the parser.']]);
  });

  it('the part of a line no template matched is its own NOT_CHECKED claim, and blocks the text', () => {
    const c = map1('The check workflow passed on 5cd68edc782f after I rewrote the auth module.');
    expect(only(c, 'gha.run_succeeded')[0]!.status).toBe('NOT_CHECKED');
    expect(only(c, 'unmapped').map((e) => e.claim)).toEqual(['after I rewrote the auth module']);
  });

  it('empty text yields no claims and exits 3, not 0', () => {
    const r = buildRecord(OBS, '   ');
    expect(r.claims).toEqual([]);
    expect(claimsExitCode(r)).toBe(3);
  });
});

describe('invariants: what can ever be SUPPORTED', () => {
  const CORPUS = [
    claimsFile('overclaiming-pr.md'),
    claimsFile('misleading-green.txt'),
    claimsFile('wrong-sha.txt'),
    claimsFile('wrong-attempt.txt'),
    claimsFile('narrow-true.txt'),
    'All tests pass, all checks pass, CI is green and everything is green on 5cd68edc782f, run 39290226738.',
    'The build passes.\nThe tests pass.\nProduction ready.\nThe fix works on 5cd68edc782f.',
    'Tests passed in run 39290226738 attempt 1 and coverage is 100%.',
    'The workflow passed on 5cd68edc782f.\nIf the run passed in run 39290226738, ship it.',
  ];

  it.each(CORPUS.map((t, i) => [i, t]))('corpus %i', (_i, t) => {
    for (const o of [OBS, FAILED]) {
      const claims = map1(t as string, o);
      const lines = readClaims(t as string).lines;
      const allRead = lines.every((l) => l.problem === null) && !claims.some((e) => e.template === 'unmapped');
      for (const c of claims.filter((e) => e.status === 'SUPPORTED')) {
        // Only citations and "this run succeeded" are ever SUPPORTED, only in a fully read text …
        expect(['gha.run_succeeded', 'git.head_sha', 'gha.run_id', 'gha.run_attempt']).toContain(c.template);
        expect(allRead).toBe(true);
        if (c.template === 'gha.run_succeeded') {
          // … and "this run succeeded" only on a COMPLETE success run.
          expect(o.conclusion).toBe('success');
          expect(o.check.verdict).toBe('COMPLETE');
        }
      }
      expect(claims.some((c) => (c.template === 'ci.tests_pass' || c.template === 'ci.all_checks_pass') && c.status === 'SUPPORTED')).toBe(false);
    }
  });
});

describe('normalising for display, and limits', () => {
  it('strips control and invisible characters from what is shown', () => {
    expect(normalizeClaimText(`tests ${CH(27)}[31mpass${CH(0x202e)} now${CH(0x200b)}`)).toBe('tests [31mpass now');
    expect(cleanCodePoints(`a${CH(0xad)}b${CH(0xe0041)}c${CH(0xfe0f)}d`)).toBe('abcd');
  });

  it('turns an unpaired surrogate into U+FFFD instead of failing the record (XC1 L1)', async () => {
    expect(normalizeClaimText('x' + String.fromCharCode(0xd800) + 'y')).toBe('x' + CH(0xfffd) + 'y');
    const fx = derive('green-run.json', (f, r) => {
      f.responses[r]!.body.name = 'check' + String.fromCharCode(0xd800);
    });
    const { record, digest } = await inspect(fx, 'x' + String.fromCharCode(0xdc00));
    expect(record.observation.workflow.name).toBe('check' + CH(0xfffd));
    expect(digest.value).toMatch(/^[0-9a-f]{64}$/);
  });

  it('a long line is not certifiable, and is shown cut', () => {
    const c = map1('All ' + 'x'.repeat(400) + ' tests pass on 5cd68edc782f.');
    expect(c).toHaveLength(1);
    expect(c[0]!.template).toBe('excluded.markup');
    expect(c[0]!.claim.length).toBe(MAX_CLAIM_TEXT);
  });

  it('says how many lines past the limit were not read, and decides nothing', () => {
    const many = Array.from({ length: MAX_CLAIMS + 5 }, () => 'The check workflow passed in run 39290226738.').join('\n');
    const c = map1(many);
    const last = c[c.length - 1]!;
    expect(last.template).toBe('truncated');
    expect(last.reason).toContain('5 lines');
    expect(supported(c)).toEqual([]);
  });

  it('is deterministic', () => {
    const t = claimsFile('overclaiming-pr.md');
    expect(map1(t)).toEqual(map1(t));
  });
});

// ── ReDoS: CodeQL js/polynomial-redos, and its siblings ────────────────────────────────────────────

describe('linear time on hostile claim text', () => {
  // Measured before the fixes: "commit" + 20,000 spaces took 4.4 s, "<!--" x 16,000 took 1.7 s, and
  // "1," x 25,000 took 0.9 s (XC1 S3); each doubling took 4x or more. Each input below is 50,000+
  // characters, where quadratic code takes seconds to minutes, so a generous bound separates them.
  const UNITS = ['commit', 'sha', 'run', 'run id', 'attempt', 'workflow', 'the', 'CI', 'all', 'checks', 'tests', 'in', 'on', 'build', 'coverage', 'fully', 'https://github.com/a/b/actions/runs/1', 'github.com/', '<!--', '`', FENCE, '>', '1', '1,', '1,111,', '1.', '.', '-', '(', '?', 'a1', '](', 'a ', 'Has '];
  const N = 50000;

  it.each(UNITS)('%p followed by, or repeated over, 50,000 characters', (kw) => {
    for (const s of [kw + ' '.repeat(N), kw + '\t'.repeat(N), (kw + ' ').repeat(Math.ceil(N / (kw.length + 1))), kw.repeat(Math.ceil(N / kw.length)), (kw + '\n').repeat(Math.ceil(N / (kw.length + 1)))]) {
      const t = Date.now();
      mapClaims(s, OBS);
      expect(Date.now() - t).toBeLessThan(2000);
    }
  });

  it('the templates on one long plain line (no line cap involved) stay linear', () => {
    // plainLineProblem refuses long lines, so time the scanner directly through a line just under the cap repeated.
    const line = 'The check workflow passed on 5cd68edc782f and all checks pass in run 39290226738.';
    const t = Date.now();
    mapClaims(Array.from({ length: MAX_CLAIMS }, () => line).join('\n'), OBS);
    expect(Date.now() - t).toBeLessThan(2000);
  });
});

// ── the hash ──────────────────────────────────────────────────────────────────────────────────────

describe('record digest (RFC 8785 + SHA-256)', () => {
  it('is the JCS SHA-256 of the record', async () => {
    const { record, digest } = await inspect(load('green-run.json'), claimsFile('narrow-true.txt'));
    expect(digest).toEqual({ algorithm: 'sha-256', canonicalization: 'RFC 8785', value: jcsSha256(record) });
  });

  it('is pinned for the green fixture: any change to the record format changes it, on purpose', async () => {
    // Recomputed outside this code: Python 3 json.dumps(record, sort_keys=True, separators=(',',':'),
    // ensure_ascii=False) | sha256 gives the same value (every key here is ASCII, where Python's
    // code-point sort and RFC 8785's UTF-16 sort agree). If this moves, the schema moved.
    const { digest } = await inspect(load('green-run.json'), claimsFile('narrow-true.txt'));
    expect(digest.value).toBe(GOLDEN_GREEN_NARROW);
  });

  it('changes when a claim status changes, and survives a JSON round trip', async () => {
    const { record } = await inspect(load('green-run.json'), claimsFile('narrow-true.txt'));
    const copy = JSON.parse(JSON.stringify(record)) as ActionEvidenceRecord;
    expect(digestRecord(copy).value).toBe(digestRecord(record).value);
    copy.claims[0]!.status = 'CONTRADICTED';
    expect(digestRecord(copy).value).not.toBe(digestRecord(record).value);
  });
});

// Moved 2026-10-23, on purpose: the run check's commit label said "The commit exists on the remote", but no lookup
// is done; it now says "GitHub reports the commit this run ran on". The label is in the record, so the digest moved.
// Recomputed independently with Python's json.dumps(sort_keys=True) | sha256 on the same record: same value.
const GOLDEN_GREEN_NARROW = '9b7c9646ccec6cf5dff69bd066ed41f13ed6b1e769347323e4431c5faceb9d97';

// ── the card ──────────────────────────────────────────────────────────────────────────────────────

describe('the card', () => {
  const CARD_TEXT = [
    'All tests pass and CI is green on commit 5cd68edc782f.',
    'This PR fixes all bugs and is production ready.',
    'It is fully secure.',
    'Coverage is 100%.',
    'Done.',
    '## Summary',
  ].join('\n');
  let record: ActionEvidenceRecord;
  beforeAll(async () => {
    record = (await inspect(load('green-run.json'), CARD_TEXT)).record;
  });

  it('shows every NOT_CHECKED claim, in Markdown and HTML', () => {
    const md = renderCardMarkdown(record);
    const html = renderCardHtml(record);
    for (const label of [
      'Tests passing: not checked.',
      'All checks on the commit passing: not checked.',
      'Broader security: not checked.',
      'Absence of bugs: not checked.',
      'Production readiness: not checked.',
      'Whether the change fixes the problem: not checked.',
      'Coverage: not checked.',
      'Task completion: not checked.',
      'Markup or non-ASCII text: not checked.',
      'Cryptographic integrity: not checked.',
    ]) {
      expect(md).toContain(label);
      expect(html).toContain(label);
    }
    const nc = record.claims.filter((c) => c.status === 'NOT_CHECKED').length;
    expect((md.match(/: not checked\.\*\*/g) ?? []).length).toBe(nc + 1);
  });

  it('XC1 L2: the not-checked heading counts what its list holds', () => {
    const nc = record.claims.filter((c) => c.status === 'NOT_CHECKED').length;
    expect(renderCardMarkdown(record)).toContain(`### Not checked: ${nc} claims, and cryptographic integrity (none of these is a pass)`);
  });

  it('shows each atomic claim with the line it came from', () => {
    const md = renderCardMarkdown(record);
    const tests = only(record, 'ci.tests_pass')[0]!;
    expect(md).toContain(`${mdCode(tests.claim)} ${tests.reason.slice(0, 20)}`);
    expect(md).toContain(`In: ${mdCode(tests.sentence)}`);
  });

  it('carries the record digest and the evidence class', () => {
    const md = renderCardMarkdown(record);
    expect(md).toContain(digestRecord(record).value);
    expect(md).toContain('PLATFORM_REPORTED');
    expect(md).toContain('not an independent grade');
    for (const line of record.does_not_prove) expect(md).toContain(line.slice(0, 40));
  });

  it('is drawn from the record alone: same record data, same card', () => {
    const copy = JSON.parse(JSON.stringify(record)) as ActionEvidenceRecord;
    expect(renderCardMarkdown(copy)).toBe(renderCardMarkdown(record));
    expect(renderCardHtml(copy)).toBe(renderCardHtml(record));
    copy.claims[0]!.claim = 'a claim that only the record holds';
    expect(renderCardMarkdown(copy)).toContain('a claim that only the record holds');
  });

  it('labels a demo only when asked', () => {
    expect(renderCardMarkdown(record)).not.toContain(DEMO_BANNER);
    expect(renderCardMarkdown(record, { demo: true })).toContain(DEMO_BANNER);
    expect(renderCardHtml(record, { demo: true })).toContain('DEMO');
  });

  it('keeps hostile claim text inert in both formats', async () => {
    const hostile = 'I fixed it <script>alert(1)</script> [click](https://evil.example) ![x](https://evil.example/x.png) ``tick``';
    const { record: r } = await inspect(load('green-run.json'), hostile);
    const html = renderCardHtml(r);
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('href=');
    expect(html).toContain(`content="default-src 'none'; style-src 'unsafe-inline'"`);
    const md = renderCardMarkdown(r);
    let outside = md;
    for (const c of r.claims) for (const s of [c.claim, c.sentence]) outside = outside.split(mdCode(s)).join('');
    expect(outside).not.toContain('evil.example');
    expect(outside).not.toContain('<script');
  });

  it("a workflow or job name from someone else's repo is inert too", () => {
    const copy = JSON.parse(JSON.stringify(record)) as ActionEvidenceRecord;
    copy.observation.workflow.name = '[pwn](https://evil.example)';
    copy.observation.jobs.items[0]!.conclusion = 'failure';
    copy.observation.jobs.items[0]!.name = '<img src=x onerror=alert(1)>';
    expect(renderCardHtml(copy)).not.toContain('<img');
    const md = renderCardMarkdown(copy);
    expect(md).toContain(mdCode('[pwn](https://evil.example)'));
    expect(md).toContain(mdCode('<img src=x onerror=alert(1)>'));
  });

  it('XC1 S1: no control character from a foreign name reaches either card', () => {
    const copy = JSON.parse(JSON.stringify(record)) as ActionEvidenceRecord;
    copy.observation.workflow.name = 'check' + CH(27) + ']52;c;cHduZWQ=' + CH(7) + CH(27) + '[2J';
    copy.observation.jobs.items[0]!.conclusion = 'failure';
    copy.observation.jobs.items[0]!.name = 'job' + CH(27) + '[8m' + CH(0x9b) + 'x';
    for (const card of [renderCardMarkdown(copy), renderCardHtml(copy)]) {
      for (const ch of card) {
        const cp = ch.codePointAt(0) as number;
        if (cp === 10) continue;
        expect(cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)).toBe(false);
      }
    }
  });

  it('mdCode holds any backtick run', () => {
    expect(mdCode('a`b')).toBe('``a`b``');
    expect(mdCode('`x`')).toBe('`` `x` ``');
    expect(mdCode('plain')).toBe('`plain`');
  });
});
