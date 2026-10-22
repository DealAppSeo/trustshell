/**
 * Pre-action forecast + independently graded outcome (src/learn/precommit.ts), SHADOW ONLY, and the
 * dry-run learn backfill (src/learn/precommit-backfill.ts). Times are fixed; the real home folder is
 * never opened. Each describe block is one of the rules a forecast needs to mean anything.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jcsSha256 } from '../src/lib/jcs';
import {
  BRIER_MIN,
  PrecommitError,
  PrecommitLedger,
  brierScore,
  formatBrier,
  gradeOutcome,
  sealPreAction,
  verifyOutcome,
  verifyPreAction,
  type LedgerEntry,
  type OutcomeInput,
  type OutcomeRecord,
  type PreActionInput,
  type PreActionRecord,
} from '../src/learn/precommit';
import { backfillEpisodes, readLearnEpisodes, runBackfill } from '../src/learn/precommit-backfill';
import { addCheck, addJob, recordEpisode, runCheck, type Exec } from '../src/learn/store';

const T0 = new Date('2026-10-22T10:00:00.000Z');
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);
const AGENT = { provider: 'anthropic', model: 'claude-opus-5-5', version: '2026-10' };
const nonceOf = (i: number) => i.toString(16).padStart(32, '0');
const EVIDENCE_DIGEST = 'a'.repeat(64);

/** A sealed forecast, i seconds * 10 after T0, with a unique nonce. */
function forecast(i: number, over: Partial<PreActionInput> = {}): PreActionRecord {
  return sealPreAction(
    {
      task_id: `task-${i}`,
      proposition: { text: `Run ${100000 + i} of the check workflow concluded success`, direction: 'TRUE' },
      success_criterion: 'the deploy job exits 0',
      p_truth: 0.8,
      p_success: 0.7,
      expected_cost: { amount: 0.02, unit: 'usd' },
      confidence_method: 'self_reported',
      agent: AGENT,
      ...over,
    },
    { now: at(i * 10), nonce: nonceOf(i) },
  );
}

const sealedMs = (pre: PreActionRecord) => Date.parse(pre.sealed_at);

/** Grade a forecast: the action starts 5 s after sealing, the grade lands 1 s after that. */
function grade(pre: PreActionRecord, over: Partial<OutcomeInput> = {}, gradedAt?: Date): OutcomeRecord {
  return gradeOutcome(
    pre,
    {
      action_started_at: new Date(sealedMs(pre) + 5000).toISOString(),
      grader: { kind: 'platform_record', id: 'trustshell-check', method: 'gha.run_succeeded' },
      result: 'SUPPORTED',
      execution: 'SUCCEEDED',
      evidence: { schema: 'dev.trustshell.action-evidence', digest: EVIDENCE_DIGEST, ref: null },
      ...over,
    },
    { now: gradedAt ?? new Date(sealedMs(pre) + 6000) },
  );
}

/** A plain copy (structuredClone returns another realm's objects under jest, which RFC 8785 refuses). */
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Edit a record and keep its old hash: what a tamperer does who cannot recompute it, or does not bother. */
function edited<T extends object>(r: T, patch: Record<string, unknown>): T {
  return { ...clone(r), ...patch } as T;
}

/** Edit a record AND recompute its hash: the stronger tamperer. */
function rehashed(pre: PreActionRecord, patch: Record<string, unknown>): PreActionRecord {
  const next = { ...clone(pre), ...patch } as Record<string, unknown>;
  delete next.sealed_hash;
  return { ...next, sealed_hash: { algorithm: 'sha-256', canonicalization: 'RFC 8785', value: jcsSha256(next) } } as unknown as PreActionRecord;
}

function rehashedOutcome(o: OutcomeRecord, patch: Record<string, unknown>): OutcomeRecord {
  const next = { ...clone(o), ...patch } as Record<string, unknown>;
  delete next.outcome_hash;
  return { ...next, outcome_hash: { algorithm: 'sha-256', canonicalization: 'RFC 8785', value: jcsSha256(next) } } as unknown as OutcomeRecord;
}

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof PrecommitError) return e.code;
    throw e;
  }
  return 'ACCEPTED';
}

describe('the pre-action record', () => {
  it('is sealed with the RFC 8785 SHA-256 of its body (src/lib/jcs.ts), and verifies', () => {
    const pre = forecast(1);
    const { sealed_hash, ...body } = pre;
    expect(sealed_hash).toEqual({ algorithm: 'sha-256', canonicalization: 'RFC 8785', value: jcsSha256(body) });
    expect(verifyPreAction(pre)).toEqual(pre);
    expect(pre.schema).toBe('dev.trustshell.pre-action/0.1-draft');
  });

  it('takes one atomic proposition per record', () => {
    for (const text of ['All tests pass and CI is green', 'The build passed. The deploy finished', 'Tests pass; lint passes', 'Did the run pass?', 'X or Y holds']) {
      expect(code(() => forecast(1, { proposition: { text, direction: 'TRUE' } }))).toBe('NOT_ATOMIC');
    }
    expect(code(() => forecast(1, { proposition: { text: 'Android build 1.2 shipped to the store', direction: 'TRUE' } }))).toBe('ACCEPTED');
  });

  it('refuses a forecast with nothing to grade it against', () => {
    expect(code(() => forecast(1, { p_truth: null, p_success: null }))).toBe('NO_FORECAST');
    expect(code(() => forecast(1, { proposition: null }))).toBe('NO_PROPOSITION');
    expect(code(() => forecast(1, { success_criterion: null }))).toBe('NO_SUCCESS_CRITERION');
    expect(code(() => forecast(1, { proposition: null, p_truth: null }))).toBe('ACCEPTED');
    expect(code(() => forecast(1, { success_criterion: null, p_success: null }))).toBe('ACCEPTED');
  });

  it('refuses asserting a side it gives less than even odds', () => {
    expect(code(() => forecast(1, { p_truth: 0.1 }))).toBe('INCOHERENT_DIRECTION');
    expect(code(() => forecast(1, { proposition: { text: 'The run failed', direction: 'FALSE' }, p_truth: 0.9 }))).toBe('INCOHERENT_DIRECTION');
    expect(code(() => forecast(1, { proposition: { text: 'The run failed', direction: 'FALSE' }, p_truth: 0.2 }))).toBe('ACCEPTED');
  });

  it('keeps one byte form of every timestamp, so the hash has one meaning', () => {
    const pre = forecast(1);
    expect(code(() => verifyPreAction(rehashed(pre, { sealed_at: '2026-10-22T10:00:10Z' })))).toBe('NON_CANONICAL_TIME');
    expect(code(() => verifyPreAction(rehashed(pre, { sealed_at: 'yesterday' })))).toBe('NON_CANONICAL_TIME');
  });
});

describe('time ordering: a forecast is sealed strictly before the action', () => {
  it('accepts an outcome whose action started after the forecast was sealed', () => {
    const pre = forecast(1);
    const o = grade(pre);
    expect(verifyOutcome(pre, o).outcome).toEqual(o);
  });

  it('refuses an action that started before the forecast was sealed', () => {
    const pre = forecast(1);
    expect(code(() => grade(pre, { action_started_at: new Date(sealedMs(pre) - 1).toISOString() }))).toBe('NOT_SEALED_BEFORE_ACTION');
  });

  it('refuses a forecast sealed at the same instant the action started', () => {
    const pre = forecast(1);
    expect(code(() => grade(pre, { action_started_at: pre.sealed_at }))).toBe('NOT_SEALED_BEFORE_ACTION');
  });

  it('refuses a grade dated before the action it grades', () => {
    const pre = forecast(1);
    expect(code(() => grade(pre, {}, new Date(sealedMs(pre) + 4000)))).toBe('GRADED_BEFORE_ACTION');
  });

  it('still refuses when the tamperer recomputes the outcome hash: the rule is checked, not just the hash', () => {
    const pre = forecast(1);
    const backdated = rehashedOutcome(grade(pre), { action_started_at: new Date(sealedMs(pre) - 60_000).toISOString() });
    expect(code(() => verifyOutcome(pre, backdated))).toBe('NOT_SEALED_BEFORE_ACTION');
    // Re-sealing the forecast earlier to fit changes its hash, so the outcome no longer names it.
    const moved = rehashed(pre, { sealed_at: new Date(sealedMs(pre) - 120_000).toISOString() });
    expect(code(() => verifyOutcome(moved, backdated))).toBe('PRE_ACTION_MISMATCH');
  });
});

describe('a tampered pre-action hash', () => {
  it('an edit after sealing does not verify, is not sealed, and is not graded', () => {
    const pre = forecast(1);
    const raised = edited(pre, { p_truth: 0.99 });
    expect(code(() => verifyPreAction(raised))).toBe('HASH_MISMATCH');
    expect(code(() => new PrecommitLedger().seal(raised))).toBe('HASH_MISMATCH');
    expect(code(() => grade(raised))).toBe('HASH_MISMATCH');
    expect(code(() => verifyOutcome(raised, grade(pre)))).toBe('HASH_MISMATCH');
  });

  it('an edit that recomputes the hash is a different record: the existing outcome does not name it', () => {
    const pre = forecast(1);
    const o = grade(pre);
    expect(code(() => verifyOutcome(rehashed(pre, { p_truth: 0.99 }), o))).toBe('PRE_ACTION_MISMATCH');
  });

  it('an edited outcome does not verify either', () => {
    const pre = forecast(1);
    expect(code(() => verifyOutcome(pre, edited(grade(pre), { result: 'CONTRADICTED' })))).toBe('OUTCOME_HASH_MISMATCH');
  });

  it('the ledger keeps a frozen copy: changing your own object after sealing changes nothing there', () => {
    const ledger = new PrecommitLedger();
    const mine = forecast(1);
    ledger.seal(mine);
    (mine as { p_truth: number | null }).p_truth = 0.99;
    const [kept] = ledger.entries();
    expect(kept?.pre.p_truth).toBe(0.8);
    expect(() => {
      (kept?.pre as { p_truth: number | null }).p_truth = 0.99;
    }).toThrow(TypeError);
  });
});

describe('nonce reuse', () => {
  it('a nonce is single-use in a ledger, for a different record and for the same one', () => {
    const ledger = new PrecommitLedger();
    ledger.seal(forecast(1));
    const other = sealPreAction({ ...inputOf(forecast(2)) }, { now: at(20), nonce: nonceOf(1) });
    expect(other.sealed_hash.value).not.toBe(forecast(1).sealed_hash.value);
    expect(code(() => ledger.seal(other))).toBe('NONCE_REUSED');
    expect(code(() => ledger.seal(forecast(1)))).toBe('NONCE_REUSED');
  });

  it('an amendment needs a fresh nonce too', () => {
    const ledger = new PrecommitLedger();
    const pre = ledger.seal(forecast(1));
    const again = sealPreAction({ ...inputOf(pre), p_truth: 0.9 }, { now: at(30), nonce: nonceOf(1) });
    expect(code(() => ledger.amend(pre.sealed_hash.value, again))).toBe('NONCE_REUSED');
  });

  it('a set of records with a shared nonce is refused before it is scored', () => {
    const a = forecast(1);
    const b = sealPreAction({ ...inputOf(forecast(2)) }, { now: at(20), nonce: nonceOf(1) });
    expect(code(() => brierScore([{ pre: a, outcome: null }, { pre: b, outcome: null }], 'p_truth'))).toBe('NONCE_REUSED');
  });
});

describe('the pre-action record cannot be edited after an outcome exists', () => {
  it('amending before any grade replaces it; the old one can no longer be graded', () => {
    const ledger = new PrecommitLedger();
    const pre = ledger.seal(forecast(1));
    const next = ledger.amend(pre.sealed_hash.value, sealPreAction({ ...inputOf(pre), p_truth: 0.9 }, { now: at(15), nonce: nonceOf(99) }));
    expect(ledger.entries().map((e) => e.pre.sealed_hash.value)).toEqual([next.sealed_hash.value]);
    expect(code(() => ledger.grade(grade(pre)))).toBe('SUPERSEDED');
    expect(code(() => ledger.grade(grade(next)))).toBe('ACCEPTED');
  });

  it('after an outcome exists, amending is refused, and so is a second outcome', () => {
    const ledger = new PrecommitLedger();
    const pre = ledger.seal(forecast(1));
    ledger.grade(grade(pre));
    const next = sealPreAction({ ...inputOf(pre), p_truth: 0.9 }, { now: at(15), nonce: nonceOf(99) });
    expect(code(() => ledger.amend(pre.sealed_hash.value, next))).toBe('EDIT_AFTER_OUTCOME');
    expect(code(() => ledger.grade(grade(pre, { result: 'CONTRADICTED' })))).toBe('ALREADY_GRADED');
  });

  it('an amendment must be later, and about the same task', () => {
    const ledger = new PrecommitLedger();
    const pre = ledger.seal(forecast(1));
    expect(code(() => ledger.amend(pre.sealed_hash.value, sealPreAction({ ...inputOf(pre) }, { now: at(5), nonce: nonceOf(98) })))).toBe('NOT_LATER');
    expect(code(() => ledger.amend(pre.sealed_hash.value, sealPreAction({ ...inputOf(pre), task_id: 'other' }, { now: at(15), nonce: nonceOf(97) })))).toBe('TASK_MISMATCH');
  });
});

describe('the grader is independent of the agent, and shows its evidence', () => {
  it('refuses a model as grader: model agreement is not an outcome', () => {
    const pre = forecast(1);
    expect(code(() => grade(pre, { grader: { kind: 'model' as never, id: 'gpt-judge', method: 'llm' } }))).toBe('MODEL_GRADER');
  });

  it('refuses the agent grading its own forecast', () => {
    const pre = forecast(1);
    for (const id of ['claude-opus-5-5', 'anthropic/claude-opus-5-5', 'Anthropic:Claude-Opus-5-5']) {
      expect(code(() => grade(pre, { grader: { kind: 'person', id, method: 'review' } }))).toBe('SELF_GRADED');
    }
  });

  it('a resolved grade with no evidence is refused; UNKNOWN needs none', () => {
    const pre = forecast(1);
    const none = { schema: 'none', digest: null, ref: null };
    expect(code(() => grade(pre, { evidence: none }))).toBe('NO_EVIDENCE');
    expect(code(() => grade(pre, { evidence: none, result: 'UNKNOWN', execution: 'UNKNOWN' }))).toBe('ACCEPTED');
  });

  it('nothing is graded that was not forecast', () => {
    const successOnly = forecast(1, { proposition: null, p_truth: null });
    expect(code(() => grade(successOnly, { result: 'SUPPORTED' }))).toBe('NOTHING_TO_GRADE');
    expect(code(() => grade(successOnly, { result: 'UNKNOWN' }))).toBe('ACCEPTED');
  });
});

/** The input a record was sealed from, to make a variant of it. */
function inputOf(pre: PreActionRecord): PreActionInput {
  const { schema: _s, sealed_at: _a, nonce: _n, sealed_hash: _h, ...input } = pre;
  return input;
}

/** n forecasts with the given p and resolution on both axes. Indexes start at `from`. */
function graded(n: number, from: number, p: number, result: OutcomeInput['result'], execution: OutcomeInput['execution'] = 'UNKNOWN'): LedgerEntry[] {
  return Array.from({ length: n }, (_, k) => {
    const pre = forecast(from + k, { p_truth: p, p_success: p });
    return { pre, outcome: grade(pre, { result, execution }) };
  });
}

describe('UNKNOWN is never scored', () => {
  it('adding UNKNOWN outcomes leaves the score exactly as it was, and they are counted beside it', () => {
    const resolved = [...graded(10, 0, 0.8, 'SUPPORTED'), ...graded(10, 10, 0.8, 'CONTRADICTED')];
    const unknown = graded(7, 20, 0.8, 'UNKNOWN');
    const alone = brierScore(resolved, 'p_truth');
    const withUnknown = brierScore([...resolved, ...unknown], 'p_truth');
    expect(withUnknown.brier).toBe(alone.brier);
    expect(alone.brier).toBeCloseTo((10 * 0.2 ** 2 + 10 * 0.8 ** 2) / 20, 12);
    expect(withUnknown).toMatchObject({ resolved: 20, unknown: 7, stated: 27, ungraded: 0 });
    // Scored as 0 or as 1 it would have moved: the test can see the difference.
    expect((20 * alone.brier! + 7 * 0.8 ** 2) / 27).not.toBeCloseTo(alone.brier!, 3);
    expect((20 * alone.brier! + 7 * 0.2 ** 2) / 27).not.toBeCloseTo(alone.brier!, 3);
    expect(formatBrier(withUnknown)).toMatch(/Brier 0\.340 · method self_reported · 20 resolved of 27 stated \(selection 74%\) · 7 UNKNOWN/);
  });

  it('only UNKNOWN, or too few resolved, is "not measured", never a number', () => {
    const allUnknown = brierScore(graded(25, 0, 0.9, 'UNKNOWN'), 'p_truth');
    expect(allUnknown).toMatchObject({ brier: null, resolved: 0, unknown: 25, not_measured: 'no resolved outcome on this axis' });
    const few = brierScore(graded(BRIER_MIN - 1, 0, 0.9, 'SUPPORTED'), 'p_truth');
    expect(few.brier).toBeNull();
    expect(few.not_measured).toBe(`needs ${BRIER_MIN} resolved outcomes on this axis (has ${BRIER_MIN - 1})`);
    expect(formatBrier(few)).toMatch(/^p_truth: not measured/);
  });

  it('never pools two confidence methods into one number', () => {
    const a = graded(20, 0, 0.8, 'SUPPORTED');
    const b = Array.from({ length: 20 }, (_, k) => {
      const pre = forecast(100 + k, { confidence_method: 'sampled_frequency' });
      return { pre, outcome: grade(pre) };
    });
    const r = brierScore([...a, ...b], 'p_truth');
    expect(r.brier).toBeNull();
    expect(r.not_measured).toMatch(/mixed confidence methods \(sampled_frequency, self_reported\)/);
  });
});

describe('p_truth and p_success are never merged', () => {
  it('the same records score differently on each axis, each against its own resolution', () => {
    // 20 forecasts: the claim is true every time (p_truth 0.9), the action succeeds half the time (p_success 0.6).
    const entries = Array.from({ length: 20 }, (_, k) => {
      const pre = forecast(k, { p_truth: 0.9, p_success: 0.6 });
      return { pre, outcome: grade(pre, { result: 'SUPPORTED', execution: k % 2 ? 'SUCCEEDED' : 'FAILED' }) };
    });
    const truth = brierScore(entries, 'p_truth');
    const success = brierScore(entries, 'p_success');
    expect(truth.brier).toBeCloseTo(0.1 ** 2, 12);
    expect(success.brier).toBeCloseTo((10 * 0.4 ** 2 + 10 * 0.6 ** 2) / 20, 12);
    expect(truth.brier).not.toBeCloseTo(success.brier!, 3);
  });

  it('a record that forecasts one axis is "not stated" on the other, never borrowed from it', () => {
    const successOnly = Array.from({ length: 20 }, (_, k) => {
      const pre = forecast(k, { proposition: null, p_truth: null, p_success: 0.7 });
      return { pre, outcome: grade(pre, { result: 'UNKNOWN', execution: 'SUCCEEDED' }) };
    });
    expect(brierScore(successOnly, 'p_truth')).toMatchObject({ brier: null, stated: 0, not_stated: 20 });
    expect(brierScore(successOnly, 'p_success')).toMatchObject({ stated: 20, resolved: 20 });
    expect(brierScore(successOnly, 'p_success').brier).toBeCloseTo(0.3 ** 2, 12);
  });

  it('a resolved truth with an UNKNOWN execution scores truth and is censored on success', () => {
    const entries = graded(20, 0, 0.8, 'SUPPORTED', 'UNKNOWN');
    expect(brierScore(entries, 'p_truth')).toMatchObject({ resolved: 20, unknown: 0 });
    expect(brierScore(entries, 'p_success')).toMatchObject({ brier: null, resolved: 0, unknown: 20 });
  });

  it('a single merged "confidence" field cannot ride along on a record', () => {
    const pre = forecast(1);
    const merged = rehashed(pre, { confidence: 0.75 });
    expect(code(() => verifyPreAction(merged))).toBe('UNKNOWN_FIELD');
  });
});

describe('selection is visible', () => {
  it('confidence laundering: grading only the easy forecasts shows up as a selection rate, not just a better score', () => {
    // 20 easy forecasts (0.95, all true) and 20 hard ones (0.6, half true).
    const easy = graded(20, 0, 0.95, 'SUPPORTED');
    const hard = [...graded(10, 20, 0.6, 'SUPPORTED'), ...graded(10, 30, 0.6, 'CONTRADICTED')];
    const honest = brierScore([...easy, ...hard], 'p_truth');
    expect(honest.selection_rate).toBe(1);

    // Laundered: the hard ones are sealed but never graded.
    const ungradedHard = hard.map((e) => ({ pre: e.pre, outcome: null }));
    const laundered = brierScore([...easy, ...ungradedHard], 'p_truth');
    expect(laundered.brier!).toBeLessThan(honest.brier!);
    expect(laundered).toMatchObject({ resolved: 20, stated: 40, ungraded: 20, selection_rate: 0.5 });
    expect(laundered.mean_p_resolved).toBeCloseTo(0.95, 12);
    expect(laundered.mean_p_unresolved).toBeCloseTo(0.6, 12);
    expect(formatBrier(laundered)).toContain('20 resolved of 40 stated (selection 50%)');

    // Laundered another way: the hard ones are graded UNKNOWN. Same rate, and it says UNKNOWN.
    const unknownHard = hard.map((e) => ({ pre: e.pre, outcome: grade(e.pre, { result: 'UNKNOWN' }) }));
    expect(brierScore([...easy, ...unknownHard], 'p_truth')).toMatchObject({ selection_rate: 0.5, unknown: 20, ungraded: 0 });

    // Laundered at the source: forecasts sealed only for the easy tasks. Visible against the task list.
    const tasks = Array.from({ length: 40 }, (_, k) => `task-${k}`);
    expect(brierScore(easy, 'p_truth', { tasks }).task_coverage).toEqual({ tasks: 40, with_forecast: 20, rate: 0.5 });
  });
});

// ── backfill ─────────────────────────────────────────────────────────────────────────────────

const JTBD = 'When I ship a change, I want the tests green, so I can merge without fear.';
const passes: Exec = () => 0;
const fails: Exec = () => 1;
const loadSqlite = createRequire(__filename);
const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const ROOT = join(__dirname, '..');

describe('backfill invents no outcomes (fixtures)', () => {
  let dir = '';
  let db = '';
  let env = {} as NodeJS.ProcessEnv;
  const ep: Record<string, number> = {};

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ts-precommit-'));
    db = join(dir, 'memory.sqlite');
    env = { TRUSTSHELL_MEMORY: db } as unknown as NodeJS.ProcessEnv;
    const t = (m: number) => new Date(T0.getTime() + m * 60_000);
    addJob('ship', 'delegate', JTBD, env, t(0));
    addCheck('ship', 'ship-tests', 'npm test', env, t(0));
    // passed: confidence 0.8 first, then the check passes
    ep.passed = recordEpisode({ job: 'ship', turn: 'p', check: 'ship-tests', family: 'claude', model: 'claude-opus-5-5', confidence: 0.8 }, env, t(1)).episode;
    runCheck('ship-tests', { episode: ep.passed }, env, t(2), passes);
    // failed: confidence 0.3 first, then the check fails
    ep.failed = recordEpisode({ job: 'ship', turn: 'f', check: 'ship-tests', family: 'claude', confidence: 0.3 }, env, t(3)).episode;
    runCheck('ship-tests', { episode: ep.failed }, env, t(4), fails);
    // unchecked: confidence stated, the check never ran
    ep.unchecked = recordEpisode({ job: 'ship', turn: 'u', check: 'ship-tests', confidence: 0.6 }, env, t(5)).episode;
    // noConfidence: checked, but no confidence was ever stated
    ep.noConfidence = recordEpisode({ job: 'ship', turn: 'n', check: 'ship-tests' }, env, t(6)).episode;
    runCheck('ship-tests', { episode: ep.noConfidence }, env, t(7), passes);
    // sameInstant and after: confidence moved onto / past the check (by hand: the API refuses it)
    ep.sameInstant = recordEpisode({ job: 'ship', turn: 's', check: 'ship-tests', confidence: 0.9 }, env, t(8)).episode;
    runCheck('ship-tests', { episode: ep.sameInstant }, env, t(9), passes);
    ep.after = recordEpisode({ job: 'ship', turn: 'a', check: 'ship-tests', confidence: 0.9 }, env, t(10)).episode;
    runCheck('ship-tests', { episode: ep.after }, env, t(11), passes);
    // noCheck: confidence but no check frozen; ghost: a job slug the person never created
    ep.noCheck = recordEpisode({ job: 'ship', turn: 'c', confidence: 0.5 }, env, t(12)).episode;
    ep.ghost = recordEpisode({ job: 'ghost', turn: 'g', confidence: 0.5 }, env, t(13)).episode;
    const { DatabaseSync } = loadSqlite('node:sqlite') as { DatabaseSync: new (p: string) => { prepare(s: string): { run(...a: unknown[]): unknown }; close(): void } };
    const raw = new DatabaseSync(db);
    raw.prepare('UPDATE learn_episode SET confidence_at = check_at WHERE id = ?').run(ep.sameInstant);
    raw.prepare('UPDATE learn_episode SET confidence_at = ? WHERE id = ?').run(t(12).toISOString(), ep.after);
    raw.close();
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('maps only episodes with a confidence recorded strictly before the check, and grades only what the check decided', () => {
    const before = sha(db);
    const { rows, jobs } = readLearnEpisodes(db);
    const r = backfillEpisodes(rows, jobs, { min: 1 });
    expect(sha(db)).toBe(before); // nothing was written to the memory file

    expect(r.lines.map((l) => l.source.learn_episode)).toEqual([ep.passed, ep.failed, ep.unchecked]);
    expect(Object.fromEntries(r.skipped.map((s) => [s.episode, s.reason]))).toEqual({
      [ep.noConfidence]: 'no confidence recorded',
      [ep.sameInstant]: 'confidence not recorded strictly before the check',
      [ep.after]: 'confidence not recorded strictly before the check',
      [ep.noCheck]: 'no check frozen on the episode',
      [ep.ghost]: 'job not created by the person',
    });

    const byEpisode = new Map(r.lines.map((l) => [l.source.learn_episode, l]));
    const checkOutcome = new Map(rows.map((row) => [row.id, row.check_outcome]));
    for (const l of r.lines) {
      // p_success is the stored number, unchanged; p_truth is not borrowed from it.
      expect(l.pre_action.p_success).toBe(rows.find((row) => row.id === l.source.learn_episode)?.confidence);
      expect(l.pre_action.p_truth).toBeNull();
      expect(l.pre_action.proposition).toBeNull();
      verifyPreAction(l.pre_action);
      // An outcome exists exactly when the person's check wrote one, and says only what it said.
      const co = checkOutcome.get(l.source.learn_episode);
      if (co === null) expect(l.outcome).toBeNull();
      else {
        expect(l.outcome?.execution).toBe(co === 'pass' ? 'SUCCEEDED' : 'FAILED');
        expect(l.outcome?.result).toBe('UNKNOWN');
        expect(l.outcome?.grader.kind).toBe('deterministic_check');
        verifyOutcome(l.pre_action, l.outcome);
      }
    }
    expect(byEpisode.get(ep.unchecked)?.outcome).toBeNull();
    expect(r.summary).toMatchObject({ episodes: 8, eligible: 3, graded: 2, succeeded: 1, failed: 1, ungraded: 1, truth_unknown: 2 });
    expect(r.summary.p_success).toMatchObject({ stated: 3, resolved: 2, ungraded: 1, unknown: 0 });
    expect(r.summary.p_success.brier).toBeCloseTo(((0.8 - 1) ** 2 + (0.3 - 0) ** 2) / 2, 12);
  });

  it('is deterministic: the same file gives the same records', () => {
    const a = readLearnEpisodes(db);
    expect(JSON.stringify(backfillEpisodes(a.rows, a.jobs).lines)).toBe(JSON.stringify(backfillEpisodes(a.rows, a.jobs).lines));
  });

  it('with no episodes it maps nothing and makes nothing up', () => {
    expect(backfillEpisodes([], new Set(['ship'])).summary).toMatchObject({ episodes: 0, eligible: 0, graded: 0 });
  });

  it('runs the way its doc says, as a script, and writes no database', () => {
    const before = sha(db);
    const script = join(ROOT, 'scripts', 'precommit-backfill.cjs');
    const run = (...args: string[]) => spawnSync(process.execPath, [script, ...args], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 });

    const ok = run('--memory', db);
    expect(ok.status).toBe(0);
    const out = ok.stdout.trim().split('\n').map((s) => JSON.parse(s));
    expect(out.map((l: { source: { learn_episode: number } }) => l.source.learn_episode)).toEqual([ep.passed, ep.failed, ep.unchecked]);
    expect(ok.stderr).toContain('8 episodes read, 3 eligible');
    expect(ok.stderr).toContain('p_success: not measured (needs 20 resolved outcomes on this axis (has 2))');

    const file = join(dir, 'out.jsonl');
    expect(run('--memory', db, '--out', file).status).toBe(0);
    expect(readFileSync(file, 'utf8').trim().split('\n')).toHaveLength(3);
    expect(run('--memory', db, '--out', file).status).toBe(2); // exists: never overwritten
    expect(run('--memory', db, '--out', join(dir, 'copy.sqlite')).status).toBe(2);
    expect(existsSync(join(dir, 'copy.sqlite'))).toBe(false);
    expect(run('--memory', db, '--out', db).status).toBe(2);
    expect(sha(db)).toBe(before);

    const missing = join(dir, 'nope.sqlite');
    const nc = run('--memory', missing);
    expect(nc.status).toBe(2);
    expect(nc.stderr).toContain('NOT_CHECKED');
    expect(existsSync(missing)).toBe(false);
    expect(run().status).toBe(2);
  }, 60_000);

  it('a file with no learn tables is NOT_CHECKED, not an empty success', () => {
    const plain = join(dir, 'plain.sqlite');
    const { DatabaseSync } = loadSqlite('node:sqlite') as { DatabaseSync: new (p: string) => { exec(s: string): void; close(): void } };
    const d = new DatabaseSync(plain);
    d.exec('CREATE TABLE other (x)');
    d.close();
    const lines: string[] = [];
    expect(runBackfill(['--memory', plain], { out: (s) => lines.push(s), err: (s) => lines.push(s) })).toBe(2);
    expect(lines.join('\n')).toContain('NOT_CHECKED');
    const junk = join(dir, 'not-a-db.sqlite');
    writeFileSync(junk, 'hello, this is not a database file');
    const before = sha(junk);
    const errs: string[] = [];
    expect(runBackfill(['--memory', junk], { out: () => undefined, err: (s) => errs.push(s) })).toBe(2);
    expect(errs.join('\n')).toContain('NOT_CHECKED');
    expect(sha(junk)).toBe(before);
  });
});
