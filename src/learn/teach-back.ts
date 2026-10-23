/**
 * Teach-back before the work. SHADOW ONLY: nothing here is wired into a command, a ruler, RepID, a
 * reputation, a stake or a database. It defines one record, the rules that make it a teach-back
 * rather than an echo, the bridge into precommit.ts, and a report.
 * ------------------------------------------------------------------
 * THE METHOD (Sean, 2026-10-22; clinicians call it teach-back). "Do you understand?" is a poor check,
 * so its answer is recorded FIRST and never used as evidence: it is what gets calibrated. Then the
 * agent restates the ask in its own words, with the output it expects and one example of its own. A
 * person (or a deterministic check) accepts or rejects. A rejection carries the person's next try:
 * different words, a new example, the desired output. Rounds go up until one is accepted.
 *
 * WHERE IT GOES. The accepted restatement and expected output become the `success_criterion` of
 * precommit.ts's pre-action record, sealed there by sealPreAction, strictly before the work. The
 * outcome is graded against THAT by a non-model grader. A fluent paraphrase is not understanding;
 * the graded outcome is the test, and the teach-back is the cheap filter in front of it.
 *
 * WHAT IS REFUSED, each with its own code: a model or the agent as the one who accepts
 * (MODEL_CONFIRMER, SELF_CONFIRMED); a self-report not written before round 1 (SELF_REPORT_LATE); a
 * restatement that mostly copies the ask or the person's re-explanation (PARROTED); a rejection with
 * no re-explanation (NO_RE_EXPLANATION); any change once a round is accepted (EDIT_AFTER_ACCEPTANCE).
 *
 * DECLARED, NOT PROVEN. Times and the confirmer are stated, not signed, as in precommit.ts. The
 * acceptance hash catches an edit that does not recompute it. What fixes the criterion for good is
 * the pre-action seal, and the report links an outcome only when that seal carries THIS criterion.
 *
 * PURE: no I/O, no network, no env. Times are passed in.
 */
import { createHash } from 'node:crypto';
import { jcsSha256 } from '../lib/jcs';
import type { RecordDigest } from '../lib/action-evidence';
import {
  BRIER_MIN,
  canonicalTime,
  sealPreAction,
  verifyOutcome,
  verifyPreAction,
  type LedgerEntry,
  type PreActionBody,
  type PreActionInput,
  type PreActionRecord,
} from './precommit';
import { BUCKET_RULE, DEFAULT_WEIGHT, PROPER_RULE, stakeOf, type BucketRule, type ProperRule } from './confidence-stake';

export const TEACH_BACK_SCHEMA = 'dev.trustshell.teach-back/0.1-draft' as const;

export type Verdict = 'accepted' | 'rejected';
export type Agent = PreActionBody['agent'];

export interface ReExplanation {
  text: string;
  example: string;
  desired_output: string;
}

export interface Round {
  restatement: string;
  expected_output: string;
  /** One example of the agent's own. */
  example: string;
  /** When the agent wrote this restatement. */
  at: string;
  verdict: Verdict;
  /** The person's next try. Required on a rejection; null on the acceptance. */
  re_explanation: ReExplanation | null;
}

export interface TeachBackBody {
  schema: typeof TEACH_BACK_SCHEMA;
  task_id: string;
  agent: Agent;
  /** Lowercase hex SHA-256 of the ask's UTF-8 bytes. The ask itself is not stored. */
  ask_sha256: string;
  /** The answer to "do you understand?", written before any restatement. Never evidence. */
  self_report: { understands: boolean; p: number; at: string };
  rounds: Round[];
  /** Who accepted. Null until a round is accepted. */
  confirmed_by: { kind: 'person' | 'check'; id: string } | null;
}

export interface TeachBackRecord extends TeachBackBody {
  /** RFC 8785 SHA-256 of the body, set when a round is accepted. Null while the teach-back is open. */
  accepted_hash: RecordDigest | null;
}

export type TeachBackFault =
  | 'INVALID_FIELD'
  | 'UNKNOWN_FIELD'
  | 'NON_CANONICAL_TIME'
  | 'ASK_MISMATCH'
  | 'MODEL_CONFIRMER'
  | 'SELF_CONFIRMED'
  | 'SELF_REPORT_LATE'
  | 'ROUNDS_OUT_OF_ORDER'
  | 'PARROTED'
  | 'NO_RE_EXPLANATION'
  | 'EDIT_AFTER_ACCEPTANCE'
  | 'NOT_ACCEPTED'
  | 'AMBIGUOUS_LINK';

/** A refused teach-back. Nothing was accepted. */
export class TeachBackError extends Error {
  constructor(
    readonly code: TeachBackFault,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'TeachBackError';
  }
}

function fail(code: TeachBackFault, message: string): never {
  throw new TeachBackError(code, message);
}

// ── field rules (precommit.ts keeps its helpers private, so the few needed are repeated here) ──

const KEYS = ['schema', 'task_id', 'agent', 'ask_sha256', 'self_report', 'rounds', 'confirmed_by', 'accepted_hash'] as const;
const ROUND_KEYS = ['restatement', 'expected_output', 'example', 'at', 'verdict', 're_explanation'] as const;
/** The same plain charset precommit.ts uses for ids. */
const LABEL = /^[A-Za-z0-9._:/@+-]{1,120}$/;
const MAX_TEXT = 2000;

/** A plain object with exactly these keys: an extra one is refused, not ignored, because it would be hashed. */
function fields(v: unknown, at: string, keys: readonly string[]): Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) fail('INVALID_FIELD', `${at} must be an object`);
  const o = v as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!keys.includes(k)) fail('UNKNOWN_FIELD', `${at} has a field this schema does not define`);
  for (const k of keys) if (!(k in o)) fail('INVALID_FIELD', `${at}.${k} is missing (use null for "not stated")`);
  return o;
}

function label(v: unknown, at: string): void {
  if (typeof v !== 'string' || !LABEL.test(v)) fail('INVALID_FIELD', `${at} must be 1-120 characters of letters, digits and . _ : / @ + -`);
}

function text(v: unknown, at: string): string {
  if (typeof v !== 'string' || v.trim() === '' || v.length > MAX_TEXT) fail('INVALID_FIELD', `${at} must be a non-empty string of at most ${MAX_TEXT} characters`);
  return v;
}

function time(v: unknown, at: string): number {
  try {
    return canonicalTime(v, at);
  } catch {
    return fail('NON_CANONICAL_TIME', `${at} must be an ISO-8601 UTC instant as toISOString writes it`);
  }
}

/** Whether an id names the agent, as precommit.ts decides SELF_GRADED. */
function namesAgent(id: string, agent: Agent): boolean {
  const g = id.toLowerCase();
  const m = agent.model.toLowerCase();
  const p = agent.provider.toLowerCase();
  return g === m || g === `${p}/${m}` || g === `${p}:${m}`;
}

export function askSha256(ask: string): string {
  return createHash('sha256').update(ask, 'utf8').digest('hex');
}

// ── the overlap guard ───────────────────────────────────────────────────────────────────────────

/** Function words: a paraphrase shares "the" and "to" with anything, which is not copying. */
const STOP = new Set(
  'a an the to of in on at by for from with as is are be it its this that these those so i you we will can should must'.split(' '),
);

function words(s: string): Set<string> {
  return new Set((s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => !STOP.has(w)));
}

/**
 * The share of the restatement's distinct words that also appear in `source`: 1 means every word was
 * copied. A restatement with no words of its own scores 1.
 * ponytail: naive word overlap. No stemming ("script" and "scripts" differ), no synonyms, no order:
 * a reordered copy scores 1, and a copy with a few words swapped for synonyms passes. It stops
 * parroting and says nothing about correctness. Upgrade path: tune DEFAULT_MAX_OVERLAP on real
 * rounds, then a stemmer or bigram overlap if copies get through. Never a model: a model judging
 * the paraphrase would be the model grader precommit.ts refuses.
 */
export function wordOverlap(restatement: string, source: string): number {
  const mine = words(restatement);
  if (mine.size === 0) return 1;
  const theirs = words(source);
  let shared = 0;
  for (const w of mine) if (theirs.has(w)) shared += 1;
  return shared / mine.size;
}

/** Above this share of copied words, a restatement is PARROTED. A starting point, to be tuned. */
export const DEFAULT_MAX_OVERLAP = 0.6;

// ── the record ──────────────────────────────────────────────────────────────────────────────────

/** Every rule on a body. The ask is needed to check its hash and to check the restatements against it. */
function checkBody(o: Record<string, unknown>, ask: string, maxOverlap: number): TeachBackBody {
  if (o.schema !== TEACH_BACK_SCHEMA) fail('INVALID_FIELD', `schema must be ${TEACH_BACK_SCHEMA}`);
  label(o.task_id, 'task_id');
  const agent = fields(o.agent, 'agent', ['provider', 'model', 'version']);
  for (const k of ['provider', 'model', 'version']) label(agent[k], `agent.${k}`);
  if (typeof ask !== 'string' || ask.trim() === '') fail('INVALID_FIELD', 'the ask must be a non-empty string');
  if (o.ask_sha256 !== askSha256(ask)) fail('ASK_MISMATCH', 'ask_sha256 is not the SHA-256 of this ask');

  const self = fields(o.self_report, 'self_report', ['understands', 'p', 'at']);
  if (typeof self.understands !== 'boolean') fail('INVALID_FIELD', 'self_report.understands must be true or false');
  if (typeof self.p !== 'number' || !(self.p >= 0 && self.p <= 1)) fail('INVALID_FIELD', 'self_report.p must be a probability from 0 to 1');
  let previous = time(self.at, 'self_report.at');

  const rounds: unknown = o.rounds;
  if (!Array.isArray(rounds)) fail('INVALID_FIELD', 'rounds must be an array');
  const sources = [ask];
  let accepted = false;
  rounds.forEach((value: unknown, i: number) => {
    const at = `rounds[${i}]`;
    if (accepted) fail('EDIT_AFTER_ACCEPTANCE', `${at} comes after an accepted round: the teach-back closed there`);
    // Before the key check, so a rejection that simply leaves the key out gets this code, not "missing".
    if (value !== null && typeof value === 'object' && (value as Round).verdict === 'rejected' && ((value as Round).re_explanation ?? null) === null) {
      fail('NO_RE_EXPLANATION', `${at} is rejected with no re-explanation: the next round needs different words, a new example and the desired output`);
    }
    const r = fields(value, at, ROUND_KEYS);
    const restatement = text(r.restatement, `${at}.restatement`);
    text(r.expected_output, `${at}.expected_output`);
    text(r.example, `${at}.example`);

    const t = time(r.at, `${at}.at`);
    // Strictly after: an equal time cannot say which came first, as in precommit.ts.
    if (!(t > previous)) {
      if (i === 0) fail('SELF_REPORT_LATE', 'the self-report must be written strictly before round 1: an answer given after the first restatement is not a self-report');
      fail('ROUNDS_OUT_OF_ORDER', `${at} is not later than the round before it`);
    }
    previous = t;

    const copied = Math.max(...sources.map((s) => wordOverlap(restatement, s)));
    if (copied > maxOverlap) {
      fail('PARROTED', `${at}.restatement repeats ${Math.round(copied * 100)}% of the words it was given (limit ${Math.round(maxOverlap * 100)}%): restate it in your own words`);
    }

    if (r.verdict === 'rejected') {
      const re = fields(r.re_explanation, `${at}.re_explanation`, ['text', 'example', 'desired_output']);
      sources.push(text(re.text, `${at}.re_explanation.text`));
      text(re.example, `${at}.re_explanation.example`);
      text(re.desired_output, `${at}.re_explanation.desired_output`);
    } else if (r.verdict === 'accepted') {
      if (r.re_explanation !== null) fail('INVALID_FIELD', `${at} is accepted, so it has nothing to re-explain (use null)`);
      accepted = true;
    } else {
      fail('INVALID_FIELD', `${at}.verdict must be accepted or rejected`);
    }
  });

  if (!accepted) {
    if (o.confirmed_by !== null) fail('INVALID_FIELD', 'confirmed_by names who accepted, and no round is accepted');
  } else {
    if (o.confirmed_by === null) fail('INVALID_FIELD', 'an accepted round must name who accepted it (confirmed_by)');
    const c = fields(o.confirmed_by, 'confirmed_by', ['kind', 'id']);
    if (c.kind === 'model' || c.kind === 'agent') {
      fail('MODEL_CONFIRMER', 'a model is not the one who decides the agent understood: a person or a deterministic check accepts');
    }
    if (c.kind !== 'person' && c.kind !== 'check') fail('INVALID_FIELD', 'confirmed_by.kind must be person or check');
    label(c.id, 'confirmed_by.id');
    if (namesAgent(c.id as string, agent as unknown as Agent)) fail('SELF_CONFIRMED', 'the agent cannot accept its own restatement');
  }
  return o as unknown as TeachBackBody;
}

function bodyOf(o: Record<string, unknown>): Record<string, unknown> {
  const { accepted_hash: _hash, ...body } = o;
  return body;
}

function digestOf(value: unknown): RecordDigest {
  return { algorithm: 'sha-256', canonicalization: 'RFC 8785', value: jcsSha256(value) };
}

const isAccepted = (rounds: readonly Round[]) => rounds.some((r) => r.verdict === 'accepted');

/** Check a teach-back from anywhere against its ask: every rule and, once accepted, that nothing changed since. */
export function verifyTeachBack(record: unknown, ask: string, opts: { maxOverlap?: number } = {}): TeachBackRecord {
  const o = fields(record, 'teach-back', KEYS);
  const body = checkBody(bodyOf(o), ask, opts.maxOverlap ?? DEFAULT_MAX_OVERLAP);
  if (isAccepted(body.rounds)) {
    if (o.accepted_hash === null || jcsSha256(o.accepted_hash) !== jcsSha256(digestOf(body))) {
      fail('EDIT_AFTER_ACCEPTANCE', 'the teach-back does not hash to its accepted_hash: it was changed after it was accepted');
    }
  } else if (o.accepted_hash !== null) {
    fail('EDIT_AFTER_ACCEPTANCE', 'the teach-back carries an acceptance hash and no accepted round: the accepted round was changed after');
  }
  return o as unknown as TeachBackRecord;
}

/** A copy that shares nothing with the caller's objects (JSON, as precommit.ts copyOf explains). */
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export interface StartInput {
  task_id: string;
  agent: Agent;
  ask: string;
  self_report: { understands: boolean; p: number };
}

/** Open a teach-back. The self-report is taken here, so it exists before any restatement does. */
export function startTeachBack(input: StartInput, opts: { now?: Date } = {}): TeachBackRecord {
  const record: TeachBackRecord = {
    schema: TEACH_BACK_SCHEMA,
    task_id: input.task_id,
    agent: copy(input.agent),
    ask_sha256: askSha256(input.ask),
    self_report: { understands: input.self_report.understands, p: input.self_report.p, at: (opts.now ?? new Date()).toISOString() },
    rounds: [],
    confirmed_by: null,
    accepted_hash: null,
  };
  return verifyTeachBack(record, input.ask);
}

export type RoundInput = Omit<Round, 'at'>;

/**
 * The next round. An acceptance names who accepted (`confirmed_by`) and closes the record: it is
 * hashed, and any later round or edit is EDIT_AFTER_ACCEPTANCE.
 */
export function addRound(
  record: TeachBackRecord,
  ask: string,
  round: RoundInput,
  opts: { now?: Date; confirmed_by?: TeachBackBody['confirmed_by']; maxOverlap?: number } = {},
): TeachBackRecord {
  const prior = verifyTeachBack(record, ask, opts);
  const body = bodyOf(copy(prior) as unknown as Record<string, unknown>) as unknown as TeachBackBody;
  body.rounds.push({ ...copy(round), at: (opts.now ?? new Date()).toISOString() });
  if (round.verdict === 'accepted') body.confirmed_by = copy(opts.confirmed_by ?? null);
  checkBody(body as unknown as Record<string, unknown>, ask, opts.maxOverlap ?? DEFAULT_MAX_OVERLAP);
  return { ...body, accepted_hash: isAccepted(body.rounds) ? digestOf(body) : null };
}

// ── into precommit.ts ───────────────────────────────────────────────────────────────────────────

/**
 * The accepted restatement and expected output as ONE success criterion. A trailing period is
 * dropped from each part, so the joined line does not read as two sentences; nothing else changes.
 * precommit.ts's rules still apply when it is sealed (printable ASCII, at most 300 characters, one
 * atomic statement). A restatement they refuse is not yet one checkable criterion, and the fix is
 * another round, not a looser rule here.
 */
export function successCriterion(record: unknown, ask: string): string {
  const accepted = verifyTeachBack(record, ask).rounds.find((r) => r.verdict === 'accepted');
  if (!accepted) fail('NOT_ACCEPTED', 'no round is accepted yet, so there is no success criterion to seal');
  const bare = (s: string) => s.trim().replace(/\.$/, '');
  return `${bare(accepted.restatement)} -- expected output: ${bare(accepted.expected_output)}`;
}

/** Seal precommit.ts's pre-action record with the accepted teach-back as its success criterion. */
export function sealFromTeachBack(
  record: unknown,
  ask: string,
  input: Omit<PreActionInput, 'task_id' | 'agent' | 'success_criterion'>,
  opts: { now?: Date; nonce?: string } = {},
): PreActionRecord {
  const tb = verifyTeachBack(record, ask);
  return sealPreAction({ ...input, task_id: tb.task_id, agent: tb.agent, success_criterion: successCriterion(tb, ask) }, opts);
}

// ── report ──────────────────────────────────────────────────────────────────────────────────────

export interface TeachBackCase {
  record: TeachBackRecord;
  ask: string;
}

/** A ratio with its count, or "not measured" below the bar. */
export interface Measured {
  value: number | null;
  n: number;
  not_measured: string | null;
}

export interface PassRate {
  /** Graded SUCCEEDED or FAILED: the only outcomes the rate is over. */
  graded: number;
  passed: number;
  /** Graded UNKNOWN: censored, counted, never a pass or a fail. */
  unknown: number;
  /** Linked to a sealed forecast with no outcome yet. */
  ungraded: number;
  rate: Measured;
}

export interface AgentTeachBackReport {
  agent: string;
  teach_backs: number;
  accepted: number;
  /** Never accepted: abandoned, or still going. */
  open: number;
  /** Accepted teach-backs by the round that was accepted: { "1": n, "2": n, ... }. */
  accepted_at_round: Record<string, number>;
  mean_rounds_to_accept: Measured;
  /** Said "I understand" and round 1 was rejected, over those that said it and had a round 1. */
  overclaim: Measured;
  /** Brier score of self_report.p against "round 1 was accepted". Logged and calibrated, never staked. */
  self_report_brier: Measured;
  /** Accepted teach-backs whose sealed forecast carries their criterion. Only these reach an outcome. */
  linked: number;
  pass_when_round1: PassRate;
  pass_when_later: PassRate;
  /** RepID *= M^w over the linked, graded forecasts, on p_success: what each rule WOULD have done. */
  would_be_multiplier: { bucket: Measured; proper: Measured };
}

const measured = (value: () => number, n: number, min: number): Measured =>
  n >= min ? { value: value(), n, not_measured: null } : { value: null, n, not_measured: `needs ${min}, has ${n}` };

const agentKey = (a: Agent) => `${a.provider}/${a.model}@${a.version}`;

/**
 * Per agent: rounds to accept, the overclaim rate, the self-report's calibration, the pass rate when
 * round 1 was accepted against when it took more rounds, and what each stake rule would have done.
 * Every record is re-verified. Below `min` (20, as brierScore) a number is "not measured", never shown.
 *
 * An outcome is linked to a teach-back only through a forecast for the same task and agent whose
 * sealed success_criterion IS the accepted restatement: a forecast sealed against something else was
 * not graded against what the person accepted. Two forecasts for one teach-back is AMBIGUOUS_LINK,
 * not a pick.
 */
export function teachBackReport(
  cases: readonly TeachBackCase[],
  entries: readonly LedgerEntry[],
  opts: { min?: number; weight?: number; bucket?: BucketRule; proper?: ProperRule } = {},
): AgentTeachBackReport[] {
  const min = opts.min ?? BRIER_MIN;
  const w = opts.weight ?? DEFAULT_WEIGHT;
  const verified = entries.map((e) => (e.outcome ? { pre: verifyOutcome(e.pre, e.outcome).pre, outcome: e.outcome } : { pre: verifyPreAction(e.pre), outcome: null }));

  const byAgent = new Map<string, TeachBackCase[]>();
  const seen = new Set<string>();
  for (const c of cases) {
    const tb = verifyTeachBack(c.record, c.ask);
    const key = agentKey(tb.agent);
    if (seen.has(`${key} ${tb.task_id}`)) fail('AMBIGUOUS_LINK', `two teach-backs for task ${tb.task_id} by one agent`);
    seen.add(`${key} ${tb.task_id}`);
    byAgent.set(key, [...(byAgent.get(key) ?? []), c]);
  }

  return [...byAgent.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([agent, list]) => {
    const withRound = list.filter((c) => c.record.rounds.length > 0);
    const acceptedAt = (c: TeachBackCase) => c.record.rounds.findIndex((r) => r.verdict === 'accepted') + 1;
    const accepted = list.filter((c) => acceptedAt(c) > 0);
    const byRound: Record<string, number> = {};
    for (const c of accepted) byRound[acceptedAt(c)] = (byRound[acceptedAt(c)] ?? 0) + 1;
    const said = withRound.filter((c) => c.record.self_report.understands);
    const round1 = (c: TeachBackCase) => (c.record.rounds[0].verdict === 'accepted' ? 1 : 0);

    const linked = accepted.flatMap((c) => {
      const criterion = successCriterion(c.record, c.ask);
      const hits = verified.filter((e) => e.pre.task_id === c.record.task_id && agentKey(e.pre.agent) === agent && e.pre.success_criterion === criterion);
      if (hits.length > 1) fail('AMBIGUOUS_LINK', `${hits.length} sealed forecasts carry the criterion of task ${c.record.task_id}`);
      return hits.map((entry) => ({ round1: acceptedAt(c) === 1, entry }));
    });
    const pass = (group: LedgerEntry[]): PassRate => {
      const ex = group.map((e) => e.outcome?.execution);
      const graded = ex.filter((x) => x === 'SUCCEEDED' || x === 'FAILED').length;
      const passed = ex.filter((x) => x === 'SUCCEEDED').length;
      return { graded, passed, unknown: ex.filter((x) => x === 'UNKNOWN').length, ungraded: ex.filter((x) => x === undefined).length, rate: measured(() => passed / graded, graded, min) };
    };
    const product = (rule: BucketRule | ProperRule): Measured => {
      const stakes = linked.map((l) => stakeOf(l.entry, rule, w)).filter((m): m is number => m !== null);
      return measured(() => stakes.reduce((x, m) => x * m, 1), stakes.length, min);
    };

    return {
      agent,
      teach_backs: list.length,
      accepted: accepted.length,
      open: list.length - accepted.length,
      accepted_at_round: byRound,
      mean_rounds_to_accept: measured(() => accepted.reduce((s, c) => s + acceptedAt(c), 0) / accepted.length, accepted.length, min),
      overclaim: measured(() => said.filter((c) => round1(c) === 0).length / said.length, said.length, min),
      self_report_brier: measured(() => withRound.reduce((s, c) => s + (c.record.self_report.p - round1(c)) ** 2, 0) / withRound.length, withRound.length, min),
      linked: linked.length,
      pass_when_round1: pass(linked.filter((l) => l.round1).map((l) => l.entry)),
      pass_when_later: pass(linked.filter((l) => !l.round1).map((l) => l.entry)),
      would_be_multiplier: { bucket: product(opts.bucket ?? BUCKET_RULE), proper: product(opts.proper ?? PROPER_RULE) },
    };
  });
}
