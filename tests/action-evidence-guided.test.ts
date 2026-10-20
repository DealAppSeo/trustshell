/**
 * `trustshell check <run-url> --claims … --guided` (EXPERIMENTAL): binding plus every check on the
 * commit, against RECORDED GitHub responses.
 *
 * The logic is the one evaluated as CLAIMS-v1 "binding + checks" (experiments on branch
 * exp/cc1-2026-10-19-claims-v1; XC1 stage-2 adversarial round, findings R1-R4, C1-C7, B1-B6).
 *
 * Fixtures (tests/fixtures/action-evidence/guided-*): real api.github.com answers for public commits
 * of this repository, recorded read-only. The `*-checks.json` files are trimmed to the fields read
 * (DERIVED, says so in `_provenance`); no value is changed.
 *   pr583  PR #583's approved head 55a1e720: every check passed, including the required Strix review
 *   green  5cd68edc, a push to main (no PR of its own): the PR-only required check never ran there
 *   failed b8a17cfb, a PR head whose `check` failed
 *   pr560  a check that failed on attempt 1 and passed when re-run
 *   pr359  a PR head on which the required Strix check never reported
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GUIDED_DOES_NOT_PROVE,
  RECORD_DOES_NOT_PROVE,
  buildRecord,
  claimsExitCode,
  digestRecord,
  inspectRunClaims,
  mapClaims,
  type ActionEvidenceRecord,
  type ClaimEntry,
  type Observation,
} from '../src/lib/action-evidence';
import { renderCardMarkdown } from '../src/lib/evidence-card';
import type { CommitChecks } from '../src/lib/commit-checks';

const FX = join(__dirname, 'fixtures', 'action-evidence');
const NOW = () => new Date('2026-10-20T06:00:00.000Z');
const OUTCOMES = new Set(['gha.run_succeeded', 'ci.all_checks_pass', 'ci.tests_pass', 'ci.build_unscoped']);
const PARA = (a: string, b: string) => a + String.fromCharCode(10, 10) + b;

interface Fixture {
  _provenance: { modified: false | string };
  run_url: string;
  responses: Record<string, { status: number; body: any }>;
}
const load = (name: string): Fixture => JSON.parse(readFileSync(join(FX, name), 'utf8')) as Fixture;

/** A run fixture plus its commit's checks, optionally altered (each alteration is named where made). */
function evidence(run: string, checks: string, alter?: (r: Fixture['responses']) => void): Fixture {
  const r = load(run);
  const c = load(checks);
  const fx: Fixture = { ...r, responses: { ...r.responses, ...c.responses } };
  alter?.(fx.responses);
  return fx;
}
const PR583 = () => evidence('guided-pr583-run.json', 'guided-pr583-checks.json');
const GREEN = () => evidence('green-run.json', 'guided-green-checks.json');
const RED = () => evidence('failed-run.json', 'guided-failed-checks.json');
const PR560 = () => evidence('guided-pr560-run.json', 'guided-pr560-checks.json');
const PR359 = () => evidence('guided-pr359-run.json', 'guided-pr359-checks.json');

async function inspect(fx: Fixture, claims: string, guided = true) {
  const calls: string[] = [];
  (globalThis as any).fetch = async (url: string) => {
    calls.push(url);
    const u = new URL(url);
    if (u.host !== 'api.github.com') throw new Error(`egress to ${u.host}`);
    const r = fx.responses[u.pathname + u.search];
    if (!r) throw new Error(`unrecorded request: ${url}`);
    return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => JSON.stringify(r.body) };
  };
  try {
    return { ...(await inspectRunClaims(fx.run_url, claims, { env: {}, now: NOW, guided })), calls };
  } finally {
    delete (globalThis as any).fetch;
  }
}
const only = (r: { claims: ClaimEntry[] } | ClaimEntry[], template: string) => (Array.isArray(r) ? r : r.claims).filter((c) => c.template === template);
const allChecks = (r: ActionEvidenceRecord) => only(r, 'ci.all_checks_pass')[0]!;

afterEach(() => {
  delete (globalThis as any).fetch;
});

describe('fixtures', () => {
  it('the run fixtures are unmodified; the trimmed checks fixtures say they are derived', () => {
    for (const f of ['guided-pr583-run.json', 'guided-pr560-run.json', 'guided-pr359-run.json']) expect(load(f)._provenance.modified).toBe(false);
    for (const f of ['pr583', 'green', 'failed', 'pr560', 'pr359']) expect(load(`guided-${f}-checks.json`)._provenance.modified).toMatch(/^DERIVED/);
  });
});

describe('guided mode decides "All checks pass." against every check on the commit', () => {
  it('SUPPORTED when every check, including every required one, passed (PR #583, exit 0)', async () => {
    const { record } = await inspect(PR583(), 'All checks pass.');
    const c = allChecks(record);
    expect(c.status).toBe('SUPPORTED');
    expect(c.reason).toMatch(/including every required check/);
    expect(c.reason).toMatch(/cites nothing; in guided mode/);
    expect(c.evidence_fields).toEqual(['/observation/commit_checks']);
    expect(claimsExitCode(record)).toBe(0);
  });

  it('CONTRADICTED when a check on the commit failed (exit 1)', async () => {
    const { record } = await inspect(RED(), 'All checks pass.');
    expect(allChecks(record).status).toBe('CONTRADICTED');
    expect(claimsExitCode(record)).toBe(1);
  });

  it('NOT_CHECKED when a required check never reported (PR #359; and a push to main, where it runs only on PRs)', async () => {
    for (const fx of [PR359(), GREEN()]) {
      const c = allChecks((await inspect(fx, 'All checks pass.')).record);
      expect(c.status).toBe('NOT_CHECKED');
      expect(c.reason).toMatch(/requires never reported/);
    }
  });

  it('NOT_CHECKED when a check passed only on a re-run (PR #560)', async () => {
    const c = allChecks((await inspect(PR560(), 'All checks pass.')).record);
    expect(c.status).toBe('NOT_CHECKED');
    expect(c.reason).toMatch(/failed on an earlier attempt and passed when re-run/);
  });

  it('stage 3: a run that passed only when re-run is not read as passed (PR #560, attempt 2 after a failed attempt 1)', async () => {
    const c = only((await inspect(PR560(), 'The check workflow passed.')).record, 'gha.run_succeeded')[0]!;
    expect(c.status).toBe('NOT_CHECKED');
    expect(c.reason).toMatch(/is a re-run, and 1 check on this commit failed on an earlier attempt/);
  });

  it('a re-run with no failed earlier attempt still passes (derived: PR #583 run and jobs set to attempt 2)', async () => {
    const fx = evidence('guided-pr583-run.json', 'guided-pr583-checks.json', (r) => {
      for (const [k, v] of Object.entries(r)) {
        if (/\/actions\/runs\/\d+$/.test(k)) v.body.run_attempt = 2;
        if (/\/actions\/runs\/\d+\/jobs/.test(k)) for (const j of v.body.jobs) j.run_attempt = 2;
      }
    });
    expect(only((await inspect(fx, 'The check workflow passed.')).record, 'gha.run_succeeded')[0]!.status).toBe('SUPPORTED');
  });

  it('the run claim is still about the one run: "The check workflow passed." is SUPPORTED on green, CONTRADICTED on red', async () => {
    expect(only((await inspect(GREEN(), 'The check workflow passed.')).record, 'gha.run_succeeded')[0]!.status).toBe('SUPPORTED');
    expect(only((await inspect(RED(), 'The check workflow passed.')).record, 'gha.run_succeeded')[0]!.status).toBe('CONTRADICTED');
  });

  it.each([
    ['the rulesets endpoint answers 404 (derived)', (r: Fixture['responses']) => { for (const k of Object.keys(r)) if (k.includes('/rules/')) r[k] = { status: 404, body: { message: 'Not Found' } }; }],
    ['the suites endpoint answers 500 (derived)', (r: Fixture['responses']) => { for (const k of Object.keys(r)) if (k.includes('/check-suites')) r[k] = { status: 500, body: { message: 'x' } }; }],
    ['earlier attempts (filter=all) cannot be read (derived)', (r: Fixture['responses']) => { for (const k of Object.keys(r)) if (k.includes('filter=all')) r[k] = { status: 403, body: { message: 'rate limited' } }; }],
    ['GitHub reports more check runs than it returned (derived)', (r: Fixture['responses']) => { for (const k of Object.keys(r)) if (k.includes('filter=latest')) r[k]!.body.total_count += 1; }],
  ])('evidence that is not fully read decides nothing: %s', async (_label, alter) => {
    const fx = evidence('guided-pr583-run.json', 'guided-pr583-checks.json', alter);
    const { record } = await inspect(fx, 'All checks pass.');
    expect(allChecks(record).status).toBe('NOT_CHECKED');
    expect(claimsExitCode(record)).toBe(3);
  });
  it('PR files that cannot be read leave the claim SUPPORTED, with the workflow edit named as not checked (derived)', async () => {
    const fx = evidence('guided-pr583-run.json', 'guided-pr583-checks.json', (r) => {
      for (const k of Object.keys(r)) if (k.includes('/files?')) r[k] = { status: 500, body: { message: 'x' } };
    });
    const c = allChecks((await inspect(fx, 'All checks pass.')).record);
    expect(c.status).toBe('SUPPORTED');
    expect(c.scope).toMatch(/Whether the change edited its own workflows was not checked/);
  });

  it('a change that edits its own workflows is NOT_CHECKED (derived: a workflow file added to the PR files)', async () => {
    const fx = evidence('guided-pr583-run.json', 'guided-pr583-checks.json', (r) => {
      for (const k of Object.keys(r)) if (k.includes('/files?')) r[k]!.body = [...r[k]!.body, { filename: '.github/workflows/check.yml' }];
    });
    const c = allChecks((await inspect(fx, 'All checks pass.')).record);
    expect(c.status).toBe('NOT_CHECKED');
    expect(c.reason).toMatch(/edits its own workflows/);
  });
});

describe('XC1 stage-2 re-check shapes, each derived from the PR #583 fixture (all green as recorded)', () => {
  type R = Fixture['responses'];
  const each = (r: R, part: string, fn: (v: { status: number; body: any }) => void) => {
    for (const [k, v] of Object.entries(r)) if (k.includes(part)) fn(v);
  };
  const STRIX = 2749804;
  const dropStrix = (r: R) => each(r, '/check-runs', (v) => {
    v.body.check_runs = v.body.check_runs.filter((c: any) => c.name !== 'Strix Security Review');
    v.body.total_count = v.body.check_runs.length;
  });
  const addStatus = (r: R, context: string, states: string[]) => {
    each(r, '/status?', (v) => {
      v.body.statuses.push({ context, state: states[states.length - 1] });
      v.body.total_count += 1;
    });
    // The history is newest first.
    each(r, '/statuses?', (v) => {
      v.body = [...states.slice().reverse().map((state) => ({ context, state })), ...v.body];
    });
  };
  const status = async (alter: (r: R) => void) => allChecks((await inspect(evidence('guided-pr583-run.json', 'guided-pr583-checks.json', alter), 'All checks pass.')).record);

  it('the recorded required check is pinned to the Strix app', () => {
    const rules = Object.entries(load('guided-pr583-checks.json').responses).find(([k]) => k.includes('/rules/'))![1].body;
    expect(rules.find((x: any) => x.type === 'required_status_checks').parameters.required_status_checks).toEqual([{ context: 'Strix Security Review', integration_id: STRIX }]);
  });

  it('Q1: a commit status cannot stand in for a required check pinned to an app', async () => {
    const c = await status((r) => {
      dropStrix(r);
      addStatus(r, 'Strix Security Review', ['success']);
    });
    expect(c.status).toBe('NOT_CHECKED');
    expect(c.reason).toMatch(/from the app it requires/);
  });

  it('Q2: another app’s run with the required name does not meet it', async () => {
    const c = await status((r) => each(r, '/check-runs', (v) => {
      for (const x of v.body.check_runs) if (x.name === 'Strix Security Review') x.app = { id: 15368, slug: 'github-actions' };
    }));
    expect(c.status).toBe('NOT_CHECKED');
  });

  it('P1: a suite that failed to start contradicts; an Actions suite cancelled before running is NOT_CHECKED', async () => {
    const suite = (conclusion: string) => (r: R) => each(r, '/check-suites', (v) => {
      v.body.check_suites.push({ app: { slug: 'github-actions' }, status: 'completed', conclusion, latest_check_runs_count: 0 });
      v.body.total_count += 1;
    });
    expect((await status(suite('startup_failure'))).status).toBe('CONTRADICTED');
    expect((await status(suite('cancelled'))).status).toBe('NOT_CHECKED');
  });

  it('C7a: with the inspected run’s jobs unread, nothing is SUPPORTED', async () => {
    const c = await status((r) => each(r, '/jobs?', (v) => {
      v.status = 500;
      v.body = { message: 'x' };
    }));
    expect(c.status).toBe('NOT_CHECKED');
  });

  it('S2: a status that failed and was later set to success is NOT_CHECKED, like a re-run', async () => {
    const c = await status((r) => addStatus(r, 'ci/external', ['failure', 'success']));
    expect(c.status).toBe('NOT_CHECKED');
    expect(c.reason).toMatch(/failed on an earlier attempt/);
  });

  it('a ruleset rule this does not read (required workflows) makes the claim NOT_CHECKED', async () => {
    const c = await status((r) => each(r, '/rules/', (v) => v.body.push({ type: 'workflows', parameters: { workflows: [] } })));
    expect(c.status).toBe('NOT_CHECKED');
    expect(c.reason).toMatch(/rules this does not read \(workflows\)/);
  });

  it('classic branch protection adds its required checks', async () => {
    const c = await status((r) => each(r, '/branches/', (v) => {
      v.body.protected = true;
      v.body.protection = { enabled: true, required_status_checks: { enforcement_level: 'everyone', contexts: ['ci/legacy'], checks: [{ context: 'ci/legacy', app_id: null }] } };
    }));
    expect(c.status).toBe('NOT_CHECKED');
    expect(c.reason).toMatch(/requires never reported/);
  });

  it('W1: renaming a file out of .github/workflows, or editing .github/actions, counts as editing the workflows', async () => {
    for (const file of [{ filename: 'scripts/old.yml', previous_filename: '.github/workflows/old.yml' }, { filename: '.github/actions/setup/action.yml' }]) {
      const c = await status((r) => each(r, '/files?', (v) => v.body.push(file)));
      expect(c.status).toBe('NOT_CHECKED');
      expect(c.reason).toMatch(/edits its own workflows/);
    }
  });
});

describe('XC1 review of #586: base branch, pagination, any-source checks, refusal (derived from PR #583)', () => {
  type R = Fixture['responses'];
  const SHA = '55a1e72033f9ad4ff7c0280500c82bacb2e93dcf';
  const key = (part: string, r: R) => Object.keys(r).find((k) => k.includes(part))!;
  const run = (alter: (r: R) => void, text = 'All checks pass.') => inspect(evidence('guided-pr583-run.json', 'guided-pr583-checks.json', alter), text);
  const headQuery = (r: R) => {
    const runBody = r[key('/actions/runs/39357728240', r)]!.body;
    const head = encodeURIComponent(`${runBody.head_repository.owner.login}:${runBody.head_branch}`);
    return `/repos/DealAppSeo/trustshell/pulls?head=${head}&state=all&per_page=100&page=1`;
  };

  it('F1: a pull-request run GitHub associates with no PR (a fork) is resolved by its head branch', async () => {
    const { record } = await run((r) => {
      r[key(`/commits/${SHA}/pulls`, r)]!.body = [];
      r[headQuery(r)] = { status: 200, body: [{ number: 583, head: { sha: SHA }, base: { ref: 'main' } }] };
    });
    expect(record.observation.commit_checks?.base).toEqual({ how: 'head', branches: ['main'] });
    expect(allChecks(record).status).toBe('SUPPORTED');
  });

  it('F1: when that PR cannot be found, required checks are unknown and nothing is SUPPORTED', async () => {
    const { record } = await run((r) => {
      r[key(`/commits/${SHA}/pulls`, r)]!.body = [];
      r[headQuery(r)] = { status: 200, body: [] };
    });
    expect(record.observation.commit_checks?.base.how).toBe('unresolved');
    expect(allChecks(record).status).toBe('NOT_CHECKED');
  });

  it('F2: an associated PR whose head has moved on is still read, with its whole diff', async () => {
    const { record } = await run((r) => {
      r[key(`/commits/${SHA}/pulls`, r)]!.body = [{ number: 583, head: { sha: 'f'.repeat(40) }, base: { ref: 'main' } }];
      r[key('/pulls/583/files', r)]!.body.push({ filename: '.github/workflows/check.yml' });
    });
    expect(record.observation.commit_checks?.base.how).toBe('associated');
    expect(allChecks(record).reason).toMatch(/edits its own workflows/);
  });

  it('F3: a check run repeated across pages is counted once, so a list that never reached total_count stays incomplete', async () => {
    const { record } = await run((r) => {
      for (const part of ['filter=latest', 'filter=all']) {
        const v = r[key(part, r)]!;
        const filler = Array.from({ length: 100 - v.body.check_runs.length }, (_, i) => ({ id: 900000 + i, name: `filler-${i}`, status: 'completed', conclusion: 'success', app: { id: 15368, slug: 'github-actions' } }));
        v.body.check_runs = [...v.body.check_runs, ...filler];
        v.body.total_count = 100;
      }
      const latest = key('filter=latest', r);
      r[latest]!.body.total_count = 101;
      r[latest.replace(/&page=1$/, '&page=2')] = { status: 200, body: { total_count: 101, check_runs: [r[latest]!.body.check_runs[0]] } };
    });
    const c = allChecks(record);
    expect(c.status).toBe('NOT_CHECKED');
    expect(c.reason).toMatch(/more checks .* than it returned/);
  });

  it('F4: classic protection’s app_id -1 means any source, so a passing status of that name meets it', async () => {
    const { record } = await run((r) => {
      const b = r[Object.keys(r).find((k) => k.endsWith('/branches/main'))!]!.body;
      b.protected = true;
      b.protection = { enabled: true, required_status_checks: { enforcement_level: 'everyone', contexts: ['Vercel'], checks: [{ context: 'Vercel', app_id: -1 }] } };
    });
    expect(record.observation.commit_checks?.required).toContainEqual({ context: 'Vercel', app_id: null });
    expect(allChecks(record).status).toBe('SUPPORTED');
  });

  it('F6: --guided on a run with no full commit SHA is refused, not silently unguided', async () => {
    const fx = evidence('guided-pr583-run.json', 'guided-pr583-checks.json', (r) => {
      r[key('/actions/runs/39357728240', r)]!.body.head_sha = 'abc123';
    });
    await expect(inspect(fx, 'All checks pass.')).rejects.toThrow(/--guided needs the run's full commit SHA/);
  });
});

describe('the record and the card in guided mode', () => {
  it('holds the checks in the observation, swaps the "only this one run" caveat, and re-derives from itself', async () => {
    const { record, digest } = await inspect(PR583(), 'All checks pass.');
    expect(record.observation.commit_checks?.head_sha).toBe(record.observation.head_sha);
    expect(record.does_not_prove).toEqual(GUIDED_DOES_NOT_PROVE);
    expect(record.does_not_prove.some((l) => l.startsWith('Only this one workflow run was read.'))).toBe(false);
    expect(digest.value).toBe(digestRecord(JSON.parse(JSON.stringify(record))).value);
    // buildRecord from the observation alone gives the same claims: a record is self-describing.
    expect(buildRecord(record.observation, 'All checks pass.').claims).toEqual(record.claims);
  });

  it('is repeatable: the same evidence gives the same digest', async () => {
    const a = await inspect(PR583(), 'All checks pass.');
    const b = await inspect(PR583(), 'All checks pass.');
    expect(a.digest.value).toBe(b.digest.value);
  });

  it('the card says guided mode and counts the checks, without printing check names', async () => {
    const { record } = await inspect(PR583(), 'All checks pass.');
    const md = renderCardMarkdown(record);
    expect(md).toContain('Guided mode (experimental).');
    expect(md).toMatch(/required checks: 1 of 1 reported/);
    expect(md).not.toContain('Strix');
  });

  it('dials api.github.com only', async () => {
    const { calls } = await inspect(PR583(), 'All checks pass.');
    for (const c of calls) expect(new URL(c).host).toBe('api.github.com');
    expect(calls.length).toBeGreaterThan(2);
  });
});

describe('without --guided nothing changes', () => {
  it('no checks are fetched, the old caveats stand, and "All checks pass." is NOT_CHECKED', async () => {
    const { record, calls } = await inspect(PR583(), 'All checks pass.', false);
    expect(calls).toHaveLength(2);
    expect(record.observation.commit_checks).toBeUndefined();
    expect(record.does_not_prove).toEqual(RECORD_DOES_NOT_PROVE);
    expect(allChecks(record).status).toBe('NOT_CHECKED');
  });
});

describe('binding only when nothing in the text points elsewhere (XC1 B1-B6)', () => {
  it.each([
    PARA('On commit deadbeefcafe1234.', 'All checks pass.'),
    PARA('In run 39290226739.', 'All checks pass.'),
    PARA('On attempt 2.', 'The workflow passed.'),
    PARA('Locally', 'All checks pass.'),
    PARA('In production', 'CI is green.'),
    PARA('It is production ready.', 'All checks pass.'),
  ])('%p binds nothing', async (text) => {
    const { record } = await inspect(PR583(), text);
    expect(record.claims.filter((e) => e.status === 'SUPPORTED' && OUTCOMES.has(e.template))).toEqual([]);
  });

  it('a text whose every citation matches still binds', async () => {
    const { record } = await inspect(PR583(), PARA('Run 39357728240 passed.', 'All checks pass.'));
    expect(allChecks(record).status).toBe('SUPPORTED');
  });
});

describe('adversarial corpora under guided mode: no SUPPORTED outcome, no exit 0', () => {
  const { CORPUS } = require('./fixtures/action-evidence/xc1-corpus.cjs') as { CORPUS: [string, string][] };
  const { STAGE2 } = require('./fixtures/action-evidence/xc1-stage2.cjs') as { STAGE2: [string, string, string][] };
  let green: Observation;
  let red: Observation;
  beforeAll(async () => {
    green = (await inspect(PR583(), 'x')).record.observation;
    red = (await inspect(RED(), 'x')).record.observation;
  });
  const guided = (text: string, o: Observation) => mapClaims(text, o, { bindToRun: true, commitChecks: o.commit_checks as CommitChecks });

  it.each(CORPUS)('XC1 corpus: %s', (_label, text) => {
    for (const o of [green, red]) {
      const c = guided(text, o);
      expect(c.filter((e) => e.status === 'SUPPORTED' && OUTCOMES.has(e.template))).toEqual([]);
      expect(claimsExitCode(buildRecord(o, text))).not.toBe(0);
    }
  });

  it.each(STAGE2)('XC1 stage 2: %s', (_label, text, run) => {
    const o = run === 'green' ? green : red;
    const c = guided(text, o);
    expect(c.filter((e) => e.status === 'SUPPORTED' && OUTCOMES.has(e.template))).toEqual([]);
  });
});
