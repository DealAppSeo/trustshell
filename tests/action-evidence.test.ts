/**
 * `trustshell check <run-url> --claims` — claim-to-evidence mapping, against RECORDED GitHub responses.
 *
 * Fixtures (tests/fixtures/action-evidence/) are real api.github.com answers for trustshell's own
 * `check` workflow, recorded anonymously on 2026-10-19 and replayed here with no network:
 *   green-run.json   run 39290226738, push to main, conclusion success, 1 job      (unmodified)
 *   failed-run.json  run 39166529852, pull_request, conclusion failure, 1 job     (unmodified)
 *   no-jobs.json     green-run with the jobs list emptied                         (DERIVED, says so)
 * Further failure shapes (404 jobs, truncated list, in-progress, cancelled) are derived inline from
 * green-run, each one named where it is made.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ACTION_EVIDENCE_SCHEMA,
  MAX_CLAIMS,
  MAX_CLAIM_TEXT,
  buildRecord,
  claimsExitCode,
  digestRecord,
  inspectRunClaims,
  mapClaims,
  normalizeClaimText,
  splitClaims,
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

/** A deep copy of a fixture with one response altered — for the derived failure shapes. */
function derive(name: string, alter: (fx: Fixture, runPath: string, jobsPath: string) => void): Fixture {
  const fx = load(name);
  const [runPath, jobsPath] = Object.keys(fx.responses) as [string, string];
  alter(fx, runPath, jobsPath);
  return fx;
}

async function inspect(fx: Fixture, claims: string, url = fx.run_url) {
  const calls = replay(fx);
  const out = await inspectRunClaims(url, claims, { env: {}, now: NOW });
  return { ...out, calls };
}

const only = (r: ActionEvidenceRecord, template: string) => r.claims.filter((c) => c.template === template);
const statuses = (r: ActionEvidenceRecord) => r.claims.map((c) => `${c.template}:${c.status}`);

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
    expect(o.check.results.length).toBeGreaterThan(0);
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
  });

  it('calls a GitHub answer PLATFORM_REPORTED and leaves cryptographic integrity NOT_CHECKED', async () => {
    const { record } = await inspect(load('green-run.json'), claimsFile('narrow-true.txt'));
    expect(record.assurance).toEqual({ cryptographic_integrity: 'NOT_CHECKED', observation: 'PLATFORM_REPORTED' });
  });

  it('supports each narrow true claim and exits 0', async () => {
    const { record } = await inspect(load('green-run.json'), claimsFile('narrow-true.txt'));
    expect(statuses(record)).toEqual(['ci.run_passed:SUPPORTED', 'git.head_sha:SUPPORTED', 'gha.run_id:SUPPORTED']);
    for (const c of record.claims) {
      expect(c.evidence_fields.length).toBeGreaterThan(0);
      for (const f of c.evidence_fields) expect(f).toMatch(/^\/observation\//);
      expect(c.scope).not.toBe('');
    }
    expect(claimsExitCode(record)).toBe(0);
  });

  it('dials api.github.com and nothing else: the two requests `check` makes', async () => {
    const { calls } = await inspect(load('green-run.json'), 'All tests pass.');
    expect(calls).toEqual([
      'https://api.github.com/repos/DealAppSeo/trustshell/actions/runs/39290226738',
      'https://api.github.com/repos/DealAppSeo/trustshell/actions/runs/39290226738/jobs?per_page=100',
    ]);
  });
});

describe('a claim naming the wrong SHA', () => {
  it('is CONTRADICTED, names both values, and exits 1', async () => {
    const { record } = await inspect(load('green-run.json'), claimsFile('wrong-sha.txt'));
    const [sha] = only(record, 'git.head_sha');
    expect(sha!.status).toBe('CONTRADICTED');
    expect(sha!.reason).toContain('a1b2c3d4');
    expect(sha!.reason).toContain('5cd68edc782f');
    // The other sentence is still judged on its own: CI really was green.
    expect(only(record, 'ci.run_passed')[0]!.status).toBe('SUPPORTED');
    // "Fixed" is not something a run shows.
    expect(only(record, 'excluded.fix')[0]!.status).toBe('NOT_CHECKED');
    expect(claimsExitCode(record)).toBe(1);
  });
});

describe('a claim naming the wrong run attempt', () => {
  it('is CONTRADICTED and exits 1', async () => {
    const { record } = await inspect(load('green-run.json'), claimsFile('wrong-attempt.txt'));
    const [run] = only(record, 'gha.run_id');
    expect(run!.status).toBe('CONTRADICTED');
    expect(run!.reason).toMatch(/attempt 2.*attempt 1/);
    expect(claimsExitCode(record)).toBe(1);
  });

  it('a URL naming an attempt GitHub did not answer for records nothing', async () => {
    // The run endpoint answers for the LATEST attempt. A record built from it would describe
    // attempt 1 while the URL asked about attempt 2.
    const fx = load('green-run.json');
    replay(fx);
    await expect(inspectRunClaims(fx.run_url + '/attempts/2', 'All tests pass.', { env: {}, now: NOW })).rejects.toBeInstanceOf(CheckError);
  });

  it('a URL naming the attempt GitHub did answer for is accepted', async () => {
    const fx = load('green-run.json');
    const { record } = await inspect(fx, 'All tests pass.', fx.run_url + '/attempts/1');
    expect(record.observation.run_attempt).toBe(1);
  });

  it('reads the attempt from a URL', () => {
    expect(urlAttempt('https://github.com/o/r/actions/runs/123/attempts/2')).toBe(2);
    expect(urlAttempt('https://github.com/o/r/actions/runs/123/attempts/2/job/9')).toBe(2);
    expect(urlAttempt('https://github.com/o/r/actions/runs/123')).toBeNull();
  });
});

describe('missing check runs are NOT_CHECKED, never success', () => {
  const PASS = 'All tests pass.';

  it('no jobs at all (derived fixture)', async () => {
    const { record } = await inspect(load('no-jobs.json'), PASS);
    expect(record.observation.check.verdict).toBe('INCONCLUSIVE');
    const [c] = only(record, 'ci.run_passed');
    expect(c!.status).toBe('NOT_CHECKED');
    expect(c!.reason).toMatch(/no jobs/);
    expect(claimsExitCode(record)).toBe(3);
  });

  it('the jobs endpoint answers 404 (derived: jobs response replaced)', async () => {
    const fx = derive('green-run.json', (f, _r, j) => {
      f.responses[j] = { status: 404, body: { message: 'Not Found' } };
    });
    const { record } = await inspect(fx, PASS);
    const [c] = only(record, 'ci.run_passed');
    expect(c!.status).toBe('NOT_CHECKED');
    expect(c!.reason).toMatch(/HTTP 404/);
    expect(claimsExitCode(record)).toBe(3);
  });

  it('GitHub reports more jobs than it returned (derived: total_count raised)', async () => {
    const fx = derive('green-run.json', (f, _r, j) => {
      f.responses[j]!.body.total_count = 45;
    });
    const { record } = await inspect(fx, PASS);
    const [c] = only(record, 'ci.run_passed');
    expect(c!.status).toBe('NOT_CHECKED');
    expect(c!.reason).toMatch(/45 jobs and returned 1/);
  });

  it('the run has not finished (derived: status in_progress, conclusion null)', async () => {
    const fx = derive('green-run.json', (f, r) => {
      f.responses[r]!.body.status = 'in_progress';
      f.responses[r]!.body.conclusion = null;
    });
    const { record } = await inspect(fx, PASS);
    expect(only(record, 'ci.run_passed')[0]!.status).toBe('NOT_CHECKED');
    expect(claimsExitCode(record)).toBe(3);
  });

  it('every job was skipped (derived: job conclusion skipped)', async () => {
    const fx = derive('green-run.json', (f, _r, j) => {
      f.responses[j]!.body.jobs[0].conclusion = 'skipped';
    });
    const { record } = await inspect(fx, PASS);
    const [c] = only(record, 'ci.run_passed');
    expect(c!.status).toBe('NOT_CHECKED');
    expect(c!.reason).toMatch(/skipped/);
  });

  it('a job that reports a different commit (derived: job head_sha changed)', async () => {
    const fx = derive('green-run.json', (f, _r, j) => {
      f.responses[j]!.body.jobs[0].head_sha = 'f'.repeat(40);
    });
    const { record } = await inspect(fx, PASS);
    expect(only(record, 'ci.run_passed')[0]!.status).toBe('NOT_CHECKED');
  });
});

describe('a failed run', () => {
  it('contradicts "tests pass" (recorded failure)', async () => {
    const { record } = await inspect(load('failed-run.json'), 'All tests pass and CI is green.');
    expect(record.observation.conclusion).toBe('failure');
    const [c] = only(record, 'ci.run_passed');
    expect(c!.status).toBe('CONTRADICTED');
    expect(c!.reason).toContain('"failure"');
    expect(claimsExitCode(record)).toBe(1);
  });

  it('a cancelled run is NOT_CHECKED, not CONTRADICTED (derived: conclusion cancelled)', async () => {
    // A cancelled run never showed the tests failing. It showed them not finishing.
    const fx = derive('failed-run.json', (f, r) => {
      f.responses[r]!.body.conclusion = 'cancelled';
    });
    const { record } = await inspect(fx, 'Tests pass.');
    expect(only(record, 'ci.run_passed')[0]!.status).toBe('NOT_CHECKED');
  });

  it('the run failing makes the exit 1 even when no claim is about tests', async () => {
    const { record } = await inspect(load('failed-run.json'), 'See run 39166529852.');
    expect(statuses(record)).toEqual(['gha.run_id:SUPPORTED']);
    expect(claimsExitCode(record)).toBe(1);
  });
});

describe('an overclaiming PR description', () => {
  let record: ActionEvidenceRecord;
  beforeAll(async () => {
    record = (await inspect(load('green-run.json'), claimsFile('overclaiming-pr.md'))).record;
  });
  afterAll(() => {
    delete (globalThis as any).fetch;
  });

  it('is SUPPORTED only for the narrow claims', () => {
    const supported = record.claims.filter((c) => c.status === 'SUPPORTED').map((c) => c.template).sort();
    expect(supported).toEqual(['ci.run_passed', 'gha.run_id', 'git.head_sha']);
  });

  it('marks every broad claim NOT_CHECKED with an explicit reason', () => {
    const nc = record.claims.filter((c) => c.status === 'NOT_CHECKED');
    expect(nc.map((c) => c.template).sort()).toEqual(
      ['excluded.completion', 'excluded.coverage', 'excluded.fix', 'excluded.no_bugs', 'excluded.readiness', 'excluded.security'].sort(),
    );
    for (const c of nc) expect(c.reason.length).toBeGreaterThan(10);
  });

  it('contradicts nothing, because nothing it says conflicts with the run', () => {
    expect(tallyClaims(record.claims).CONTRADICTED).toBe(0);
  });

  it('skips what is not a claim: the comment, the heading, fenced code, an unticked box', () => {
    const texts = record.claims.map((c) => c.text).join('\n');
    expect(texts).not.toMatch(/Describe your change/);
    expect(texts).not.toMatch(/^Summary$/m);
    expect(texts).not.toMatch(/npm test/);
    expect(texts).not.toMatch(/Docs updated/);
  });

  it('exits 3: anything NOT_CHECKED is never a pass', () => {
    expect(claimsExitCode(record)).toBe(3);
  });
});

// ── the templates, directly ──────────────────────────────────────────────────────────────────────

let OBS: Observation;
beforeAll(async () => {
  const fx = load('green-run.json');
  replay(fx);
  OBS = (await inspectRunClaims(fx.run_url, '', { env: {}, now: NOW })).record.observation;
  delete (globalThis as any).fetch;
});

const map1 = (text: string): ClaimEntry[] => mapClaims(text, OBS);
const has = (text: string, template: string, status: string) =>
  expect(map1(text).map((c) => `${c.template}:${c.status}`)).toContain(`${template}:${status}`);

describe('template: ci.run_passed', () => {
  it.each(['tests pass', 'All tests passed.', 'Tests are passing', 'CI green', 'CI is green', 'all checks pass', 'Checks are green.', 'The build passes', 'It passes all tests', 'green CI'])(
    '%p maps to the run result',
    (t) => has(t, 'ci.run_passed', 'SUPPORTED'),
  );

  it.each(['most tests pass', 'tests pass except the flaky one', 'some checks are green', 'CI passes but lint fails'])(
    '%p is NOT_CHECKED — a partial or qualified pass claim is never read as a pass',
    (t) => {
      const c = map1(t).filter((x) => x.template === 'ci.run_passed');
      expect(c).toHaveLength(1);
      expect(c[0]!.status).toBe('NOT_CHECKED');
      expect(c[0]!.reason).toMatch(/changes what a pass claim means/);
    },
  );

  it.each(["tests don't pass", 'tests do not pass yet'])('%p is not read as a pass claim at all', (t) => {
    // The pass phrasing never matches, so the sentence is unmapped: NOT_CHECKED, never SUPPORTED.
    const c = map1(t);
    expect(c.some((x) => x.status === 'SUPPORTED')).toBe(false);
    expect(c.map((x) => x.status)).toEqual(['NOT_CHECKED']);
  });

  it('"tests pass locally" is about a run this record cannot see', () => {
    const c = map1('All tests pass locally.');
    expect(c.find((x) => x.template === 'ci.run_passed')).toBeUndefined();
    expect(c.find((x) => x.template === 'excluded.local_run')!.status).toBe('NOT_CHECKED');
  });

  it('a test COUNT is not checked even when the pass is', () => {
    has('All 214 tests pass.', 'ci.run_passed', 'SUPPORTED');
    has('All 214 tests pass.', 'excluded.test_count', 'NOT_CHECKED');
  });
});

describe('template: git.head_sha', () => {
  it.each([
    'on commit 5cd68edc',
    'Fixed in 5cd68edc782f',
    'at 5cd68edc782fb2dd74e343e9335d3a8bcb04d5e5',
    'commit 5CD68EDC',
    'see `5cd68edc78`',
    'https://github.com/DealAppSeo/trustshell/commit/5cd68edc782f',
  ])('%p matches head_sha', (t) => has(t, 'git.head_sha', 'SUPPORTED'));

  it.each(['fixed in deadbeef', 'commit 1234567', 'on commit 5cd68edd'])('%p is CONTRADICTED', (t) => has(t, 'git.head_sha', 'CONTRADICTED'));

  it('a run id or a count is not read as a SHA', () => {
    expect(map1('CI passed on 39290226738').find((c) => c.template === 'git.head_sha')).toBeUndefined();
    expect(map1('Done in 1234567 steps').find((c) => c.template === 'git.head_sha')).toBeUndefined();
  });
});

describe('templates: gha.run_id and gha.run_attempt', () => {
  it.each(['run 39290226738', 'Run #39290226738', 'run id 39290226738 attempt 1', 'https://github.com/DealAppSeo/trustshell/actions/runs/39290226738/attempts/1'])(
    '%p is SUPPORTED',
    (t) => has(t, 'gha.run_id', 'SUPPORTED'),
  );

  it('another run id is CONTRADICTED', () => has('run 39166529852', 'gha.run_id', 'CONTRADICTED'));

  it('the same run id in another repository is CONTRADICTED', () =>
    has('https://github.com/someone/else/actions/runs/39290226738', 'gha.run_id', 'CONTRADICTED'));

  it('an attempt alone is compared too', () => {
    has('passed on attempt 1', 'gha.run_attempt', 'SUPPORTED');
    has('passed on attempt 3', 'gha.run_attempt', 'CONTRADICTED');
  });

  it('a run named by link and in prose is one entry', () => {
    const c = map1('run 39290226738: https://github.com/DealAppSeo/trustshell/actions/runs/39290226738').filter((x) => x.template === 'gha.run_id');
    expect(c).toHaveLength(1);
  });
});

describe('exclusions: named, NOT_CHECKED, never SUPPORTED', () => {
  it.each([
    ['It is fully secure.', 'excluded.security'],
    ['No vulnerabilities remain.', 'excluded.security'],
    ['All bugs fixed.', 'excluded.no_bugs'],
    ['The code is bug-free.', 'excluded.no_bugs'],
    ['Production ready.', 'excluded.readiness'],
    ['Safe to merge.', 'excluded.readiness'],
    ['Resolves the race.', 'excluded.fix'],
    ['Coverage is 98%.', 'excluded.coverage'],
    ['Deployed to staging.', 'excluded.deployment'],
    ['Latency is lower.', 'excluded.performance'],
    ['Reviewed and approved.', 'excluded.review'],
    ['Done.', 'excluded.completion'],
  ])('%p → %s', (t, template) => {
    const c = map1(t);
    expect(c.find((x) => x.template === template)!.status).toBe('NOT_CHECKED');
    expect(c.some((x) => x.status === 'SUPPORTED')).toBe(false);
  });

  it('a sentence nothing reads is one unmapped NOT_CHECKED entry', () => {
    expect(map1('I refactored the parser.').map((c) => `${c.template}:${c.status}`)).toEqual(['unmapped:NOT_CHECKED']);
  });

  it('empty text yields no claims and exits 3, not 0', async () => {
    const r = buildRecord(OBS, '   ');
    expect(r.claims).toEqual([]);
    expect(claimsExitCode(r)).toBe(3);
  });
});

describe('splitting and normalising claim text', () => {
  it('splits sentences and list items, keeps ticked boxes, drops unticked ones', () => {
    expect(splitClaims('- [x] Tests pass.\n- [ ] Docs updated\n* CI is green; done!').clauses).toEqual(['Tests pass.', 'CI is green;', 'done!']);
  });

  it('strips control and bidi-override characters so text cannot act on the reader', () => {
    const ESC = String.fromCharCode(27);
    const RLO = String.fromCharCode(0x202e);
    const ZWSP = String.fromCharCode(0x200b);
    expect(normalizeClaimText(`tests ${ESC}[31mpass${RLO} now${ZWSP}`)).toBe('tests [31mpass now');
  });

  it('caps a very long sentence, but templates still read all of it', () => {
    const long = 'x'.repeat(400) + ' tests pass';
    const c = map1(long);
    expect(c[0]!.text.length).toBe(MAX_CLAIM_TEXT);
    expect(c[0]!.text.endsWith(String.fromCharCode(0x2026))).toBe(true);
    expect(c[0]!.template).toBe('ci.run_passed');
  });

  it('says how many sentences past the limit were not read', () => {
    const many = Array.from({ length: MAX_CLAIMS + 5 }, (_, i) => `Sentence ${i}.`).join(' ');
    const c = map1(many);
    const last = c[c.length - 1]!;
    expect(last.template).toBe('truncated');
    expect(last.status).toBe('NOT_CHECKED');
    expect(last.reason).toContain('5 sentences');
  });

  it('is deterministic', () => {
    const t = claimsFile('overclaiming-pr.md');
    expect(map1(t)).toEqual(map1(t));
  });
});

// ── the hash ──────────────────────────────────────────────────────────────────────────────────────

describe('record digest (RFC 8785 + SHA-256)', () => {
  it('is the JCS SHA-256 of the record', async () => {
    const { record, digest } = await inspect(load('green-run.json'), claimsFile('narrow-true.txt'));
    expect(digest).toEqual({ algorithm: 'sha-256', canonicalization: 'RFC 8785', value: jcsSha256(record) });
    expect(digest.value).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is pinned for the green fixture: any change to the record format changes it, on purpose', async () => {
    // Recomputed outside this code: Python 3 json.dumps(record, sort_keys=True, separators=(',',':'),
    // ensure_ascii=False) | sha256sum gives the same value (every key here is ASCII, where Python's
    // code-point sort and RFC 8785's UTF-16 sort agree). If this moves, the schema moved: bump it.
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

const GOLDEN_GREEN_NARROW = '0b4ec9032784e3499636d9b806deff716023f6ea665f05e865b65c44fef7b787';

// ── the card ──────────────────────────────────────────────────────────────────────────────────────

describe('the card', () => {
  let record: ActionEvidenceRecord;
  beforeAll(async () => {
    record = (await inspect(load('green-run.json'), claimsFile('overclaiming-pr.md'))).record;
  });
  afterAll(() => {
    delete (globalThis as any).fetch;
  });

  it('shows every NOT_CHECKED item, in Markdown and HTML', () => {
    const md = renderCardMarkdown(record);
    const html = renderCardHtml(record);
    for (const label of [
      'Broader security: not checked.',
      'Absence of bugs: not checked.',
      'Production readiness: not checked.',
      'Whether the change fixes the problem: not checked.',
      'Coverage: not checked.',
      'Task completion: not checked.',
      'Cryptographic integrity: not checked.',
    ]) {
      expect(md).toContain(label);
      expect(html).toContain(label);
    }
    const nc = record.claims.filter((c) => c.status === 'NOT_CHECKED').length;
    expect((md.match(/: not checked\.\*\*/g) ?? []).length).toBe(nc + 1);
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
    copy.claims[0]!.text = 'a sentence that only the record holds';
    expect(renderCardMarkdown(copy)).toContain('a sentence that only the record holds');
  });

  it('labels a demo only when asked', () => {
    expect(renderCardMarkdown(record)).not.toContain(DEMO_BANNER);
    expect(renderCardMarkdown(record, { demo: true })).toContain(DEMO_BANNER);
    expect(renderCardHtml(record, { demo: true })).toContain('DEMO');
  });

  it('keeps hostile claim text inert in both formats', async () => {
    const hostile = 'CI is green <script>alert(1)</script> [click](https://evil.example) ![x](https://evil.example/x.png) ``tick``';
    const { record: r } = await inspect(load('green-run.json'), hostile);
    const html = renderCardHtml(r);
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('href=');
    expect(html).toContain(`content="default-src 'none'; style-src 'unsafe-inline'"`);
    const md = renderCardMarkdown(r);
    // Every occurrence of the claim sits inside a code span long enough to hold its backticks.
    const span = mdCode(r.claims[0]!.text);
    expect(span.startsWith('```')).toBe(true);
    const outside = md.split(span).join('');
    expect(outside).not.toContain('evil.example');
    expect(outside).not.toContain('<script');
  });

  it('a workflow or job name from someone else\'s repo is inert too', () => {
    const copy = JSON.parse(JSON.stringify(record)) as ActionEvidenceRecord;
    copy.observation.workflow.name = '[pwn](https://evil.example)';
    copy.observation.jobs.items[0]!.conclusion = 'failure';
    copy.observation.jobs.items[0]!.name = '<img src=x onerror=alert(1)>';
    const html = renderCardHtml(copy);
    expect(html).not.toContain('<img');
    const md = renderCardMarkdown(copy);
    expect(md).toContain(mdCode('[pwn](https://evil.example)'));
    expect(md).toContain(mdCode('<img src=x onerror=alert(1)>'));
  });

  it('mdCode holds any backtick run', () => {
    expect(mdCode('a`b')).toBe('``a`b``');
    expect(mdCode('`x`')).toBe('`` `x` ``');
    expect(mdCode('plain')).toBe('`plain`');
  });
});
