/**
 * Teach-back before the work (src/learn/teach-back.ts), SHADOW ONLY. Times are fixed. Each describe
 * block is one rule that keeps a teach-back from being an echo, plus the bridge into precommit.ts and
 * the report. Every refusal is asserted by its code.
 */
import { jcsSha256 } from '../src/lib/jcs';
import { PrecommitError, gradeOutcome, sealPreAction, verifyPreAction, type LedgerEntry, type OutcomeInput } from '../src/learn/precommit';
import {
  TeachBackError,
  addRound,
  askSha256,
  sealFromTeachBack,
  startTeachBack,
  successCriterion,
  teachBackReport,
  verifyTeachBack,
  wordOverlap,
  type Agent,
  type RoundInput,
  type TeachBackCase,
  type TeachBackRecord,
} from '../src/learn/teach-back';

const T0 = new Date('2026-10-22T10:00:00.000Z');
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);
const AGENT: Agent = { provider: 'anthropic', model: 'claude-opus-5-5', version: '2026-10' };
const SEAN = { kind: 'person' as const, id: 'sean' };

const ASK = 'Add a --json flag to the status command so scripts can read the output';
/** The agent's own words: shares only "status" and "json" with the ask. */
const OWN: RoundInput = {
  restatement: 'When someone runs status with --json, print machine readable JSON instead of the table',
  expected_output: 'status --json prints one JSON object',
  example: 'trustshell status --json prints {"ok":true}',
  verdict: 'accepted',
  re_explanation: null,
};
const PARROT = 'Add a json flag to the status command so scripts can read its output';
const RE = {
  text: 'Give the status command a json switch whose output a script can parse',
  example: 'status --json | jq .ok',
  desired_output: 'a single JSON object on stdout',
};

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function codeOf(f: () => unknown): string {
  try {
    f();
  } catch (e) {
    if (e instanceof TeachBackError || e instanceof PrecommitError) return e.code;
    throw e;
  }
  return 'NO_ERROR';
}

function open(over: { understands?: boolean; p?: number; task_id?: string; agent?: Agent } = {}): TeachBackRecord {
  return startTeachBack(
    {
      task_id: over.task_id ?? 'task-1',
      agent: over.agent ?? AGENT,
      ask: ASK,
      self_report: { understands: over.understands ?? true, p: over.p ?? 0.8 },
    },
    { now: T0 },
  );
}

/** Rejected `rejections` times, then accepted by Sean. Round i is written i+1 seconds after T0. */
function accepted(rejections = 0, base = open()): TeachBackRecord {
  let tb = base;
  for (let i = 0; i < rejections; i++) tb = addRound(tb, ASK, { ...OWN, verdict: 'rejected', re_explanation: RE }, { now: at(i + 1) });
  return addRound(tb, ASK, OWN, { now: at(rejections + 1), confirmed_by: SEAN });
}

describe('the self-report comes first, and is never evidence', () => {
  it('is taken when the teach-back opens, before any restatement exists', () => {
    const tb = open({ understands: true, p: 0.9 });
    expect(tb.rounds).toEqual([]);
    expect(tb.self_report).toEqual({ understands: true, p: 0.9, at: T0.toISOString() });
    expect(tb.ask_sha256).toBe(askSha256(ASK));
  });

  it('refuses a self-report written after round 1, or at the same instant (SELF_REPORT_LATE)', () => {
    const tb = accepted();
    const late = clone(tb);
    late.self_report.at = at(2).toISOString();
    expect(codeOf(() => verifyTeachBack(late, ASK))).toBe('SELF_REPORT_LATE');
    expect(codeOf(() => addRound(open(), ASK, OWN, { now: T0, confirmed_by: SEAN }))).toBe('SELF_REPORT_LATE');
  });

  it('later rounds must be later (ROUNDS_OUT_OF_ORDER)', () => {
    const tb = addRound(open(), ASK, { ...OWN, verdict: 'rejected', re_explanation: RE }, { now: at(5) });
    expect(codeOf(() => addRound(tb, ASK, OWN, { now: at(5), confirmed_by: SEAN }))).toBe('ROUNDS_OUT_OF_ORDER');
  });
});

describe('the restatement is in the agent\'s own words', () => {
  it('wordOverlap: the own-words restatement copies 20%, the parrot 100%; function words do not count', () => {
    expect(wordOverlap(OWN.restatement, ASK)).toBeCloseTo(0.2, 12);
    expect(wordOverlap(PARROT, ASK)).toBe(1);
    expect(wordOverlap('the a to of', 'nothing shared')).toBe(1);
    expect(wordOverlap('render the table', 'the a to of')).toBe(0);
  });

  it('refuses a restatement that mostly copies the ask (PARROTED)', () => {
    expect(codeOf(() => addRound(open(), ASK, { ...OWN, restatement: PARROT }, { now: at(1), confirmed_by: SEAN }))).toBe('PARROTED');
  });

  it('refuses a restatement that copies the person\'s re-explanation instead of the ask', () => {
    const tb = addRound(open(), ASK, { ...OWN, verdict: 'rejected', re_explanation: RE }, { now: at(1) });
    const copiedRe = 'give the status command a json switch whose output a script can parse';
    expect(wordOverlap(copiedRe, ASK)).toBeLessThan(0.6); // passes against the ask alone
    expect(codeOf(() => addRound(tb, ASK, { ...OWN, restatement: copiedRe }, { now: at(2), confirmed_by: SEAN }))).toBe('PARROTED');
  });

  it('the threshold is a parameter, and a stored record is re-checked against it', () => {
    expect(codeOf(() => addRound(open(), ASK, OWN, { now: at(1), confirmed_by: SEAN, maxOverlap: 0.1 }))).toBe('PARROTED');
    expect(codeOf(() => verifyTeachBack(accepted(), ASK, { maxOverlap: 0.1 }))).toBe('PARROTED');
  });
});

describe('a rejection carries the person\'s re-explanation, and the round count goes up', () => {
  it('refuses a rejected round with no re-explanation, null or left out (NO_RE_EXPLANATION)', () => {
    expect(codeOf(() => addRound(open(), ASK, { ...OWN, verdict: 'rejected', re_explanation: null }, { now: at(1) }))).toBe('NO_RE_EXPLANATION');
    const { re_explanation: _gone, ...noKey } = { ...OWN, verdict: 'rejected' as const };
    expect(codeOf(() => addRound(open(), ASK, noKey as RoundInput, { now: at(1) }))).toBe('NO_RE_EXPLANATION');
  });

  it('counts rounds until one is accepted', () => {
    const tb = accepted(2);
    expect(tb.rounds.map((r) => r.verdict)).toEqual(['rejected', 'rejected', 'accepted']);
    expect(tb.rounds[0].re_explanation).toEqual(RE);
  });

  it('an accepted round has nothing to re-explain', () => {
    expect(codeOf(() => addRound(open(), ASK, { ...OWN, re_explanation: RE }, { now: at(1), confirmed_by: SEAN }))).toBe('INVALID_FIELD');
  });
});

describe('who accepts: a person or a deterministic check, never a model or the agent', () => {
  it('refuses a model as confirmer (MODEL_CONFIRMER)', () => {
    for (const kind of ['model', 'agent']) {
      const confirmed_by = { kind, id: 'grok-4' } as unknown as typeof SEAN;
      expect(codeOf(() => addRound(open(), ASK, OWN, { now: at(1), confirmed_by }))).toBe('MODEL_CONFIRMER');
    }
  });

  it('refuses the agent itself as confirmer, whatever kind it claims (SELF_CONFIRMED)', () => {
    for (const id of ['claude-opus-5-5', 'anthropic/claude-opus-5-5', 'Anthropic:Claude-Opus-5-5']) {
      expect(codeOf(() => addRound(open(), ASK, OWN, { now: at(1), confirmed_by: { kind: 'person', id } }))).toBe('SELF_CONFIRMED');
    }
  });

  it('an acceptance must name who accepted; a deterministic check may', () => {
    expect(codeOf(() => addRound(open(), ASK, OWN, { now: at(1) }))).toBe('INVALID_FIELD');
    expect(addRound(open(), ASK, OWN, { now: at(1), confirmed_by: { kind: 'check', id: 'schema-check' } }).confirmed_by).toEqual({ kind: 'check', id: 'schema-check' });
  });
});

describe('nothing changes after acceptance', () => {
  it('refuses another round after the accepted one (EDIT_AFTER_ACCEPTANCE)', () => {
    const tb = accepted();
    expect(tb.accepted_hash?.value).toMatch(/^[0-9a-f]{64}$/);
    expect(codeOf(() => addRound(tb, ASK, { ...OWN, verdict: 'rejected', re_explanation: RE }, { now: at(9) }))).toBe('EDIT_AFTER_ACCEPTANCE');
  });

  it('refuses an accepted record edited at rest: restatement, expected output, self-report or confirmer', () => {
    const tb = accepted(1);
    const edits: ((r: TeachBackRecord) => void)[] = [
      (r) => (r.rounds[1].restatement = 'Print the status table as CSV for the reporting script'),
      (r) => (r.rounds[1].expected_output = 'status --json prints whatever was produced'),
      (r) => (r.self_report.understands = false),
      (r) => (r.confirmed_by = { kind: 'person', id: 'someone-else' }),
    ];
    for (const edit of edits) {
      const e = clone(tb);
      edit(e);
      expect(codeOf(() => verifyTeachBack(e, ASK))).toBe('EDIT_AFTER_ACCEPTANCE');
    }
  });

  it('refuses an acceptance flipped to a rejection after the fact', () => {
    const e = clone(accepted());
    e.rounds[0].verdict = 'rejected';
    e.rounds[0].re_explanation = RE;
    e.confirmed_by = null;
    expect(codeOf(() => verifyTeachBack(e, ASK))).toBe('EDIT_AFTER_ACCEPTANCE');
  });

  it('a record is checked against the ask it was made for (ASK_MISMATCH)', () => {
    expect(codeOf(() => verifyTeachBack(accepted(), `${ASK}!`))).toBe('ASK_MISMATCH');
  });

  it('the caller changing its own objects afterwards changes nothing in the record', () => {
    const round = clone(OWN);
    const tb = addRound(open(), ASK, round, { now: at(1), confirmed_by: SEAN });
    round.restatement = 'something else entirely';
    expect(verifyTeachBack(tb, ASK).rounds[0].restatement).toBe(OWN.restatement);
  });
});

describe('the accepted restatement becomes #614\'s success criterion', () => {
  const FORECAST = { proposition: null, p_truth: null, p_success: 0.9, expected_cost: null, confidence_method: 'self_reported' };

  it('seals a pre-action record through precommit.ts, which verifies and grades as usual', () => {
    const tb = accepted(1);
    const criterion = successCriterion(tb, ASK);
    expect(criterion).toBe(`${OWN.restatement} -- expected output: ${OWN.expected_output}`);
    const pre = sealFromTeachBack(tb, ASK, FORECAST, { now: at(10), nonce: 'f'.repeat(32) });
    expect(verifyPreAction(pre).success_criterion).toBe(criterion);
    expect([pre.task_id, pre.agent]).toEqual([tb.task_id, tb.agent]);
    const { sealed_hash, ...body } = pre;
    expect(sealed_hash.value).toBe(jcsSha256(body));
    const outcome = gradeOutcome(
      pre,
      {
        action_started_at: at(20).toISOString(),
        grader: { kind: 'person', id: 'sean', method: 'compared-to-sealed-expected-output' },
        result: 'UNKNOWN',
        execution: 'SUCCEEDED',
        evidence: { schema: 'dev.trustshell.action-evidence', digest: null, ref: 'pr comment' },
      },
      { now: at(30) },
    );
    expect(outcome.pre_action_hash).toBe(sealed_hash.value);
  });

  it('an open teach-back has no criterion yet (NOT_ACCEPTED)', () => {
    const tb = addRound(open(), ASK, { ...OWN, verdict: 'rejected', re_explanation: RE }, { now: at(1) });
    expect(codeOf(() => successCriterion(tb, ASK))).toBe('NOT_ACCEPTED');
  });

  it('precommit.ts still rules: a restatement of two things is refused NOT_ATOMIC when sealed', () => {
    const two = { ...OWN, restatement: 'Print machine readable JSON for status runs and keep the table for people' };
    const tb = addRound(open(), ASK, two, { now: at(1), confirmed_by: SEAN });
    expect(codeOf(() => sealFromTeachBack(tb, ASK, FORECAST, { now: at(10) }))).toBe('NOT_ATOMIC');
  });
});

describe('the report, per agent', () => {
  const OTHER: Agent = { provider: 'xai', model: 'grok-4', version: '2026-09' };
  let nonce = 0;

  /** n teach-backs; `rejections(i)` rounds rejected before acceptance; a forecast and a graded outcome for each. */
  function run(
    n: number,
    o: {
      agent?: Agent;
      rejections?: (i: number) => number;
      understands?: (i: number) => boolean;
      p?: (i: number) => number;
      execution?: (i: number) => OutcomeInput['execution'] | null;
      p_success?: number;
      prefix?: string;
    } = {},
  ): { cases: TeachBackCase[]; entries: LedgerEntry[] } {
    const cases: TeachBackCase[] = [];
    const entries: LedgerEntry[] = [];
    for (let i = 0; i < n; i++) {
      const base = startTeachBack(
        { task_id: `${o.prefix ?? 't'}-${i}`, agent: o.agent ?? AGENT, ask: ASK, self_report: { understands: o.understands?.(i) ?? true, p: o.p?.(i) ?? 0.8 } },
        { now: T0 },
      );
      const record = accepted(o.rejections?.(i) ?? 0, base);
      cases.push({ record, ask: ASK });
      const pre = sealFromTeachBack(record, ASK, { proposition: null, p_truth: null, p_success: o.p_success ?? 0.95, expected_cost: null, confidence_method: 'self_reported' }, { now: at(10), nonce: (nonce++).toString(16).padStart(32, '0') });
      const execution = o.execution ? o.execution(i) : 'SUCCEEDED';
      entries.push({
        pre,
        outcome:
          execution === null
            ? null
            : gradeOutcome(
                pre,
                {
                  action_started_at: at(20).toISOString(),
                  grader: { kind: 'person', id: 'sean', method: 'compared-to-sealed-expected-output' },
                  result: 'UNKNOWN',
                  execution,
                  evidence: { schema: 'dev.trustshell.action-evidence', digest: null, ref: 'pr comment' },
                },
                { now: at(30) },
              ),
      });
    }
    return { cases, entries };
  }

  it('below 20 every rate is "not measured", and the counts are still shown', () => {
    const { cases, entries } = run(5, { rejections: (i) => i % 2 });
    const [r] = teachBackReport(cases, entries);
    expect(r).toMatchObject({ agent: 'anthropic/claude-opus-5-5@2026-10', teach_backs: 5, accepted: 5, open: 0, linked: 5, accepted_at_round: { 1: 3, 2: 2 } });
    for (const m of [r.mean_rounds_to_accept, r.overclaim, r.self_report_brier, r.pass_when_round1.rate, r.pass_when_later.rate, r.would_be_multiplier.bucket, r.would_be_multiplier.proper]) {
      expect(m.value).toBeNull();
      expect(m.not_measured).toMatch(/^needs 20, has \d+$/);
    }
  });

  it('overclaim: said "I understand" and round 1 was rejected; self_report.p is calibrated against round 1, not staked', () => {
    // 40 teach-backs, all said yes at p 0.8; every 4th took a second round.
    const { cases, entries } = run(40, { rejections: (i) => (i % 4 === 0 ? 1 : 0) });
    const [r] = teachBackReport(cases, entries);
    expect(r.overclaim).toEqual({ value: 0.25, n: 40, not_measured: null });
    expect(r.self_report_brier.value).toBeCloseTo((30 * 0.2 ** 2 + 10 * 0.8 ** 2) / 40, 12);
    expect(r.mean_rounds_to_accept.value).toBeCloseTo(1.25, 12);
  });

  it('pass rate when round 1 was accepted against when it took more rounds; UNKNOWN is censored and counted', () => {
    // 50: rounds 1 for i < 30, 2 rounds after. Round-1 group passes 24 of 30; later group 10 of 20, 2 of them UNKNOWN.
    const { cases, entries } = run(50, {
      rejections: (i) => (i < 30 ? 0 : 1),
      execution: (i) => (i < 30 ? (i < 24 ? 'SUCCEEDED' : 'FAILED') : i < 40 ? 'SUCCEEDED' : i < 48 ? 'FAILED' : 'UNKNOWN'),
    });
    const [r] = teachBackReport(cases, entries);
    expect(r.pass_when_round1).toEqual({ graded: 30, passed: 24, unknown: 0, ungraded: 0, rate: { value: 0.8, n: 30, not_measured: null } });
    expect(r.pass_when_later).toMatchObject({ graded: 18, passed: 10, unknown: 2, ungraded: 0, rate: { value: null, n: 18, not_measured: 'needs 20, has 18' } });
  });

  it('the would-be multiplier under each rule, on p_success, with UNKNOWN and ungraded never staked', () => {
    // 24 at p_success 0.95: 21 SUCCEEDED, 1 FAILED, 1 UNKNOWN, 1 ungraded -> 22 staked.
    const { cases, entries } = run(24, { execution: (i) => (i < 21 ? 'SUCCEEDED' : i === 21 ? 'FAILED' : i === 22 ? 'UNKNOWN' : null) });
    const [r] = teachBackReport(cases, entries, { weight: 0.05 });
    expect(r.would_be_multiplier.bucket.n).toBe(22);
    expect(r.would_be_multiplier.bucket.value).toBeCloseTo((3 ** 21 * (1 / 3)) ** 0.05, 9);
    expect(r.would_be_multiplier.proper.value).toBeCloseTo((3 ** 21 * 0.019425685545288805) ** 0.05, 9);
  });

  it('links an outcome only through a forecast that sealed THIS criterion', () => {
    const { cases, entries } = run(3);
    // Task t-0's forecast swapped for one by the same agent for the same task, sealed against something else.
    const different = sealPreAction(
      { task_id: 't-0', agent: AGENT, proposition: null, p_truth: null, success_criterion: 'the deploy job exits 0', p_success: 0.95, expected_cost: null, confidence_method: 'self_reported' },
      { now: at(10), nonce: 'd'.repeat(32) },
    );
    expect(teachBackReport(cases, entries)[0].linked).toBe(3);
    expect(teachBackReport(cases, [{ pre: different, outcome: null }, entries[1], entries[2]])[0].linked).toBe(2);
  });

  it('two forecasts for one teach-back, or two teach-backs for one task, are AMBIGUOUS_LINK, never a pick', () => {
    const { cases, entries } = run(1);
    const again = sealFromTeachBack(cases[0].record, ASK, { proposition: null, p_truth: null, p_success: 0.5, expected_cost: null, confidence_method: 'self_reported' }, { now: at(11), nonce: 'e'.repeat(32) });
    expect(codeOf(() => teachBackReport(cases, [...entries, { pre: again, outcome: null }]))).toBe('AMBIGUOUS_LINK');
    expect(codeOf(() => teachBackReport([...cases, ...cases], entries))).toBe('AMBIGUOUS_LINK');
  });

  it('two agents are never pooled', () => {
    const a = run(20, { prefix: 'a' });
    const b = run(20, { prefix: 'b', agent: OTHER, execution: () => 'FAILED' });
    const report = teachBackReport([...a.cases, ...b.cases], [...a.entries, ...b.entries]);
    expect(report.map((r) => [r.agent, r.pass_when_round1.rate.value])).toEqual([
      ['anthropic/claude-opus-5-5@2026-10', 1],
      ['xai/grok-4@2026-09', 0],
    ]);
  });
});
