/**
 * Pre-action forecast and independently graded outcome. SHADOW ONLY: nothing here is wired into a
 * command, a ruler, RepID, a reputation, a stake or a database. It defines two records, the rules
 * that make the first one a forecast rather than a description, and a Brier score over the pairs.
 * ------------------------------------------------------------------
 * WHY TWO PROBABILITIES. `learn record --confidence` (store.ts) and repid-engine's Commitment
 * (src/orchestration/context-frame.ts) each carry ONE number. One number cannot say which of two
 * different things it forecasts: that a claim is TRUE ("all tests pass on abc123"), or that an
 * action SUCCEEDS ("the deploy completes"). A claim can be true while the action fails, and the
 * other way round. So the pre-action record has p_truth and p_success as separate fields, each
 * graded by its own resolution on the outcome (`result` and `execution`), and nothing here ever
 * averages them, picks one, or falls back from one to the other.
 *
 * WHAT MAKES IT A FORECAST. A prediction sealed after the action is a description. So:
 *   - the record is sealed with an RFC 8785 hash (src/lib/jcs.ts) and a single-use nonce;
 *   - an outcome is accepted only if the record it names still hashes to that value, and was
 *     sealed STRICTLY before the action started (an equal timestamp is refused, as in
 *     context-frame.ts commitmentOrderFault: it is indistinguishable from the same code path);
 *   - "success" is defined by a criterion sealed WITH the forecast, so it cannot be redefined after;
 *   - once an outcome exists the record cannot be amended (PrecommitLedger.amend).
 *
 * WHO GRADES. An outcome names its grader: a deterministic check, a person, or a platform record
 * (GitHub reporting on its own run). A model is refused as a grader: the learning loop's metric is
 * independently verified outcomes, and model agreement is not one. An outcome graded by the agent
 * itself is refused. Neither is proven, only declared: nothing here is signed.
 *
 * UNKNOWN IS CENSORED. An UNKNOWN resolution is never scored as 0 or 1; it is counted next to the
 * score, with the forecasts nobody graded, so that grading only the easy ones shows up as a low
 * selection rate instead of a better score ("confidence laundering").
 *
 * PURE: no I/O, no network, no env. Times are passed in.
 */
import { randomBytes } from 'node:crypto';
import { jcsSha256 } from '../lib/jcs';
import type { RecordDigest } from '../lib/action-evidence';

export const PRE_ACTION_SCHEMA = 'dev.trustshell.pre-action/0.1-draft' as const;
export const OUTCOME_SCHEMA = 'dev.trustshell.outcome/0.1-draft' as const;

/** Which side of the proposition the agent asserts. p_truth is always P(the proposition is TRUE). */
export type Direction = 'TRUE' | 'FALSE';
/** The proposition's truth, as the grader found it. Grades p_truth. */
export type TruthResult = 'SUPPORTED' | 'CONTRADICTED' | 'UNKNOWN';
/** Whether the action met its sealed success criterion. Grades p_success. */
export type ExecutionResult = 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';
export type GraderKind = 'deterministic_check' | 'person' | 'platform_record';
export type CostUnit = 'usd' | 'tokens' | 'ms' | 'calls';
export type Axis = 'p_truth' | 'p_success';

export interface PreActionBody {
  schema: typeof PRE_ACTION_SCHEMA;
  task_id: string;
  /** The one atomic claim p_truth is about. Null only when the record forecasts success alone. */
  proposition: { text: string; direction: Direction } | null;
  /** What counts as success, sealed with the forecast. Null only when the record forecasts truth alone. */
  success_criterion: string | null;
  /** P(the proposition is TRUE). Null: not forecast. */
  p_truth: number | null;
  /** P(the action meets its success criterion). Null: not forecast. */
  p_success: number | null;
  expected_cost: { amount: number; unit: CostUnit } | null;
  /** How the numbers were produced (self_reported, sampled, …). Scores never pool two methods. */
  confidence_method: string;
  agent: { provider: string; model: string; version: string };
  sealed_at: string;
  nonce: string;
}

export interface PreActionRecord extends PreActionBody {
  sealed_hash: RecordDigest;
}

export interface OutcomeBody {
  schema: typeof OUTCOME_SCHEMA;
  /** sealed_hash.value of the pre-action record this grades. */
  pre_action_hash: string;
  task_id: string;
  grader: { kind: GraderKind; id: string; method: string };
  result: TruthResult;
  execution: ExecutionResult;
  /** What the grade rests on, e.g. an action-evidence record and its RFC 8785 digest. */
  evidence: { schema: string; digest: string | null; ref: string | null };
  /** When the action the forecast is about began. The forecast must be sealed strictly before. */
  action_started_at: string;
  graded_at: string;
}

export interface OutcomeRecord extends OutcomeBody {
  outcome_hash: RecordDigest;
}

export type FaultCode =
  | 'INVALID_FIELD'
  | 'UNKNOWN_FIELD'
  | 'NOT_ATOMIC'
  | 'NO_FORECAST'
  | 'NO_PROPOSITION'
  | 'NO_SUCCESS_CRITERION'
  | 'INCOHERENT_DIRECTION'
  | 'NON_CANONICAL_TIME'
  | 'HASH_MISMATCH'
  | 'OUTCOME_HASH_MISMATCH'
  | 'PRE_ACTION_MISMATCH'
  | 'PRE_ACTION_NOT_FOUND'
  | 'TASK_MISMATCH'
  | 'NOT_SEALED_BEFORE_ACTION'
  | 'GRADED_BEFORE_ACTION'
  | 'NONCE_REUSED'
  | 'EDIT_AFTER_OUTCOME'
  | 'NOT_LATER'
  | 'SUPERSEDED'
  | 'ALREADY_GRADED'
  | 'MODEL_GRADER'
  | 'SELF_GRADED'
  | 'NOTHING_TO_GRADE'
  | 'NO_EVIDENCE';

/** A refused record or outcome. Nothing was accepted. */
export class PrecommitError extends Error {
  constructor(
    readonly code: FaultCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'PrecommitError';
  }
}

// ── field rules ─────────────────────────────────────────────────────────────────────────────────

/** Ids, model names, methods: printed in reports, so the same plain charset learn uses for labels. */
const LABEL = /^[A-Za-z0-9._:/@+-]{1,120}$/;
const HEX64 = /^[0-9a-f]{64}$/;
/** 128 to 256 bits, lowercase hex. */
const NONCE = /^[0-9a-f]{32,64}$/;
const MAX_TEXT = 300;
/**
 * One claim per record. A conjunction, a second sentence, a semicolon, a question or a line break
 * means more than one thing is forecast under one number. Deny by default, as action-evidence does:
 * "the tests pass and CI is green" is two records.
 */
const NOT_ATOMIC = /\b(?:and|or|but)\b|[;?]|\.\s+\S/i;

const PRE_KEYS = [
  'schema', 'task_id', 'proposition', 'success_criterion', 'p_truth', 'p_success', 'expected_cost',
  'confidence_method', 'agent', 'sealed_at', 'nonce', 'sealed_hash',
] as const;
const OUTCOME_KEYS = [
  'schema', 'pre_action_hash', 'task_id', 'grader', 'result', 'execution', 'evidence',
  'action_started_at', 'graded_at', 'outcome_hash',
] as const;

/** A value from outside, safe to put in an error message, or a placeholder. Never splices control characters. */
function shown(v: unknown): string {
  return typeof v === 'string' && /^[\x20-\x7e]{0,60}$/.test(v) ? JSON.stringify(v) : typeof v === 'number' ? String(v) : '(value not shown)';
}

function plainObject(v: unknown, at: string): Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new PrecommitError('INVALID_FIELD', `${at} must be an object`);
  return v as Record<string, unknown>;
}

/**
 * Exactly these keys. An extra key is refused, not ignored: a record that also carries a single
 * `confidence` would be a merged forecast riding along, and an ignored key is still hashed.
 */
function exactKeys(o: Record<string, unknown>, keys: readonly string[], at: string): void {
  for (const k of Object.keys(o)) {
    if (!keys.includes(k)) throw new PrecommitError('UNKNOWN_FIELD', `${at} has a field this schema does not define: ${shown(k)}`);
  }
  for (const k of keys) {
    if (!(k in o)) throw new PrecommitError('INVALID_FIELD', `${at}.${k} is missing (use null for "not stated")`);
  }
}

function label(v: unknown, at: string): string {
  if (typeof v !== 'string' || !LABEL.test(v)) throw new PrecommitError('INVALID_FIELD', `${at} must be 1-120 characters of letters, digits and . _ : / @ + - (got ${shown(v)})`);
  return v;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], at: string): T {
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
    throw new PrecommitError('INVALID_FIELD', `${at} must be one of ${allowed.join(', ')} (got ${shown(v)})`);
  }
  return v as T;
}

/** Printable ASCII, one atomic statement, at most MAX_TEXT characters. */
function atomicText(v: unknown, at: string): string {
  if (typeof v !== 'string' || v.trim() === '') throw new PrecommitError('INVALID_FIELD', `${at} must be a non-empty string`);
  if (v.length > MAX_TEXT) throw new PrecommitError('INVALID_FIELD', `${at} is longer than ${MAX_TEXT} characters`);
  if (!/^[\x20-\x7e]+$/.test(v)) throw new PrecommitError('INVALID_FIELD', `${at} must be printable ASCII on one line`);
  if (NOT_ATOMIC.test(v)) throw new PrecommitError('NOT_ATOMIC', `${at} states more than one thing (a conjunction, a second sentence, a semicolon or a question); split it, one forecast per record`);
  return v;
}

function probability(v: unknown, at: string): number | null {
  if (v === null) return null;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) throw new PrecommitError('INVALID_FIELD', `${at} must be a probability from 0 to 1, or null (got ${shown(v)})`);
  return v;
}

/** An ISO-8601 UTC instant exactly as Date.prototype.toISOString writes it, so the hashed bytes have one form. */
export function canonicalTime(v: unknown, at: string): number {
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  if (!Number.isFinite(t) || new Date(t).toISOString() !== v) {
    throw new PrecommitError('NON_CANONICAL_TIME', `${at} must be an ISO-8601 UTC instant as toISOString writes it, e.g. 2026-10-22T10:00:00.000Z (got ${shown(v)})`);
  }
  return t;
}

function digestOf(value: unknown): RecordDigest {
  return { algorithm: 'sha-256', canonicalization: 'RFC 8785', value: jcsSha256(value) };
}

function digestShape(v: unknown, at: string): RecordDigest {
  const d = plainObject(v, at);
  exactKeys(d, ['algorithm', 'canonicalization', 'value'], at);
  if (d.algorithm !== 'sha-256' || d.canonicalization !== 'RFC 8785' || typeof d.value !== 'string' || !HEX64.test(d.value)) {
    throw new PrecommitError('INVALID_FIELD', `${at} must be { algorithm: "sha-256", canonicalization: "RFC 8785", value: <64 lowercase hex> }`);
  }
  return d as unknown as RecordDigest;
}

/** Every rule on a pre-action body. Returns the body typed; throws PrecommitError on the first fault. */
function checkPreBody(o: Record<string, unknown>): PreActionBody {
  if (o.schema !== PRE_ACTION_SCHEMA) throw new PrecommitError('INVALID_FIELD', `schema must be ${PRE_ACTION_SCHEMA}`);
  label(o.task_id, 'task_id');
  const pTruth = probability(o.p_truth, 'p_truth');
  const pSuccess = probability(o.p_success, 'p_success');
  if (pTruth === null && pSuccess === null) throw new PrecommitError('NO_FORECAST', 'p_truth and p_success are both null: nothing is forecast');

  if (o.proposition !== null) {
    const p = plainObject(o.proposition, 'proposition');
    exactKeys(p, ['text', 'direction'], 'proposition');
    atomicText(p.text, 'proposition.text');
    const direction = oneOf(p.direction, ['TRUE', 'FALSE'] as const, 'proposition.direction');
    // Asserting a side you think less likely is incoherent: "X is true" at p_truth 0.1 would score
    // well on the Brier rule exactly when the assertion was wrong.
    if (pTruth !== null && ((direction === 'TRUE' && pTruth < 0.5) || (direction === 'FALSE' && pTruth > 0.5))) {
      throw new PrecommitError('INCOHERENT_DIRECTION', `the record asserts ${direction} but forecasts p_truth ${pTruth}`);
    }
  } else if (pTruth !== null) {
    throw new PrecommitError('NO_PROPOSITION', 'p_truth is stated with no proposition: a probability of truth needs the claim it is about');
  }

  if (o.success_criterion !== null) atomicText(o.success_criterion, 'success_criterion');
  else if (pSuccess !== null) {
    throw new PrecommitError('NO_SUCCESS_CRITERION', 'p_success is stated with no success_criterion: "success" must be sealed with the forecast, or it can be redefined after');
  }

  if (o.expected_cost !== null) {
    const c = plainObject(o.expected_cost, 'expected_cost');
    exactKeys(c, ['amount', 'unit'], 'expected_cost');
    if (typeof c.amount !== 'number' || !Number.isFinite(c.amount) || c.amount < 0) throw new PrecommitError('INVALID_FIELD', 'expected_cost.amount must be a finite number, 0 or more');
    oneOf(c.unit, ['usd', 'tokens', 'ms', 'calls'] as const, 'expected_cost.unit');
  }
  label(o.confidence_method, 'confidence_method');
  const a = plainObject(o.agent, 'agent');
  exactKeys(a, ['provider', 'model', 'version'], 'agent');
  label(a.provider, 'agent.provider');
  label(a.model, 'agent.model');
  label(a.version, 'agent.version');
  canonicalTime(o.sealed_at, 'sealed_at');
  if (typeof o.nonce !== 'string' || !NONCE.test(o.nonce)) throw new PrecommitError('INVALID_FIELD', 'nonce must be 32-64 lowercase hex characters (128-256 bits)');
  return o as unknown as PreActionBody;
}

function withoutKey<T extends object>(o: T, key: string): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...(o as Record<string, unknown>) };
  delete copy[key];
  return copy;
}

// ── pre-action ──────────────────────────────────────────────────────────────────────────────────

export type PreActionInput = Omit<PreActionBody, 'schema' | 'sealed_at' | 'nonce'>;

/** A fresh 128-bit nonce. */
export function newNonce(): string {
  return randomBytes(16).toString('hex');
}

/** Seal a forecast: stamp it, give it a nonce, hash it. Throws PrecommitError on any rule. */
export function sealPreAction(input: PreActionInput, opts: { now?: Date; nonce?: string } = {}): PreActionRecord {
  const body: PreActionBody = {
    schema: PRE_ACTION_SCHEMA,
    task_id: input.task_id,
    proposition: input.proposition,
    success_criterion: input.success_criterion,
    p_truth: input.p_truth,
    p_success: input.p_success,
    expected_cost: input.expected_cost,
    confidence_method: input.confidence_method,
    agent: input.agent,
    sealed_at: (opts.now ?? new Date()).toISOString(),
    nonce: opts.nonce ?? newNonce(),
  };
  exactKeys(body as unknown as Record<string, unknown>, PRE_KEYS.filter((k) => k !== 'sealed_hash'), 'pre-action');
  checkPreBody(body as unknown as Record<string, unknown>);
  return { ...body, sealed_hash: digestOf(body) };
}

/**
 * Check a pre-action record from anywhere (a file, another process): every field rule, and that it
 * still hashes to its sealed_hash. An edit of any field after sealing is HASH_MISMATCH.
 */
export function verifyPreAction(record: unknown): PreActionRecord {
  const o = plainObject(record, 'pre-action');
  exactKeys(o, PRE_KEYS, 'pre-action');
  const sealed = digestShape(o.sealed_hash, 'sealed_hash');
  const body = withoutKey(o, 'sealed_hash');
  checkPreBody(body);
  if (jcsSha256(body) !== sealed.value) {
    throw new PrecommitError('HASH_MISMATCH', 'the pre-action record does not hash to its sealed_hash: it was edited after it was sealed');
  }
  return o as unknown as PreActionRecord;
}

// ── outcome ─────────────────────────────────────────────────────────────────────────────────────

/** Whether a grader id names the agent that made the forecast. */
function namesAgent(graderId: string, agent: PreActionBody['agent']): boolean {
  const g = graderId.toLowerCase();
  const m = agent.model.toLowerCase();
  const p = agent.provider.toLowerCase();
  return g === m || g === `${p}/${m}` || g === `${p}:${m}`;
}

function checkOutcomeBody(pre: PreActionRecord, o: Record<string, unknown>): OutcomeBody {
  if (o.schema !== OUTCOME_SCHEMA) throw new PrecommitError('INVALID_FIELD', `schema must be ${OUTCOME_SCHEMA}`);
  if (typeof o.pre_action_hash !== 'string' || !HEX64.test(o.pre_action_hash)) throw new PrecommitError('INVALID_FIELD', 'pre_action_hash must be 64 lowercase hex characters');
  if (o.pre_action_hash !== pre.sealed_hash.value) {
    throw new PrecommitError('PRE_ACTION_MISMATCH', 'this outcome names a different pre-action record (or that record was re-sealed after it was graded)');
  }
  if (o.task_id !== pre.task_id) throw new PrecommitError('TASK_MISMATCH', 'the outcome and its pre-action record name different tasks');

  const g = plainObject(o.grader, 'grader');
  exactKeys(g, ['kind', 'id', 'method'], 'grader');
  if (g.kind === 'model') {
    throw new PrecommitError('MODEL_GRADER', 'a model is not an independent grader: the score counts verified outcomes, never model agreement');
  }
  oneOf(g.kind, ['deterministic_check', 'person', 'platform_record'] as const, 'grader.kind');
  const graderId = label(g.id, 'grader.id');
  label(g.method, 'grader.method');
  if (namesAgent(graderId, pre.agent)) throw new PrecommitError('SELF_GRADED', 'the grader is the agent that made the forecast');

  const result = oneOf(o.result, ['SUPPORTED', 'CONTRADICTED', 'UNKNOWN'] as const, 'result');
  const execution = oneOf(o.execution, ['SUCCEEDED', 'FAILED', 'UNKNOWN'] as const, 'execution');
  if (result !== 'UNKNOWN' && pre.proposition === null) throw new PrecommitError('NOTHING_TO_GRADE', 'result grades a proposition, and the pre-action record states none');
  if (execution !== 'UNKNOWN' && pre.success_criterion === null) throw new PrecommitError('NOTHING_TO_GRADE', 'execution grades a success criterion, and the pre-action record states none');

  const e = plainObject(o.evidence, 'evidence');
  exactKeys(e, ['schema', 'digest', 'ref'], 'evidence');
  label(e.schema, 'evidence.schema');
  if (e.digest !== null && (typeof e.digest !== 'string' || !HEX64.test(e.digest))) throw new PrecommitError('INVALID_FIELD', 'evidence.digest must be 64 lowercase hex characters, or null');
  if (e.ref !== null && (typeof e.ref !== 'string' || !/^[\x20-\x7e]{1,300}$/.test(e.ref))) throw new PrecommitError('INVALID_FIELD', 'evidence.ref must be 1-300 printable ASCII characters, or null');
  if ((result !== 'UNKNOWN' || execution !== 'UNKNOWN') && e.digest === null && e.ref === null) {
    throw new PrecommitError('NO_EVIDENCE', 'a resolved grade with no evidence reference is UNKNOWN, not SUPPORTED or CONTRADICTED');
  }

  const sealed = canonicalTime(pre.sealed_at, 'sealed_at');
  const started = canonicalTime(o.action_started_at, 'action_started_at');
  const graded = canonicalTime(o.graded_at, 'graded_at');
  if (!(sealed < started)) {
    throw new PrecommitError(
      'NOT_SEALED_BEFORE_ACTION',
      sealed === started
        ? 'the forecast was sealed at the same instant the action started; ordering cannot be established, so it is refused'
        : 'the forecast was sealed after the action started: a prediction made after the fact is a description',
    );
  }
  if (graded < started) throw new PrecommitError('GRADED_BEFORE_ACTION', 'graded_at is earlier than action_started_at');
  return o as unknown as OutcomeBody;
}

export type OutcomeInput = Omit<OutcomeBody, 'schema' | 'pre_action_hash' | 'task_id' | 'graded_at'>;

/** Grade a sealed forecast. Verifies the pre-action record first. Throws PrecommitError on any rule. */
export function gradeOutcome(preRecord: unknown, input: OutcomeInput, opts: { now?: Date } = {}): OutcomeRecord {
  const pre = verifyPreAction(preRecord);
  const body: OutcomeBody = {
    schema: OUTCOME_SCHEMA,
    pre_action_hash: pre.sealed_hash.value,
    task_id: pre.task_id,
    grader: input.grader,
    result: input.result,
    execution: input.execution,
    evidence: input.evidence,
    action_started_at: input.action_started_at,
    graded_at: (opts.now ?? new Date()).toISOString(),
  };
  exactKeys(body as unknown as Record<string, unknown>, OUTCOME_KEYS.filter((k) => k !== 'outcome_hash'), 'outcome');
  checkOutcomeBody(pre, body as unknown as Record<string, unknown>);
  return { ...body, outcome_hash: digestOf(body) };
}

/** Check an outcome against the pre-action record it names. Both are re-hashed. */
export function verifyOutcome(preRecord: unknown, outcome: unknown): { pre: PreActionRecord; outcome: OutcomeRecord } {
  const pre = verifyPreAction(preRecord);
  const o = plainObject(outcome, 'outcome');
  exactKeys(o, OUTCOME_KEYS, 'outcome');
  const sealed = digestShape(o.outcome_hash, 'outcome_hash');
  const body = withoutKey(o, 'outcome_hash');
  checkOutcomeBody(pre, body);
  if (jcsSha256(body) !== sealed.value) throw new PrecommitError('OUTCOME_HASH_MISMATCH', 'the outcome record does not hash to its outcome_hash: it was edited after it was made');
  return { pre, outcome: o as unknown as OutcomeRecord };
}

// ── ledger: the one place "cannot be edited after an outcome exists" and "single-use nonce" live ──

/**
 * A copy for the ledger to keep. JSON, not structuredClone: a verified record is plain JSON by
 * construction (RFC 8785 refused anything else), and structuredClone can hand back objects from
 * another realm, which jcs.ts then refuses as "not a plain object" (measured under jest's vm).
 */
function copyOf<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function deepFreeze<T>(v: T): T {
  if (v !== null && typeof v === 'object') {
    for (const x of Object.values(v as Record<string, unknown>)) deepFreeze(x);
    Object.freeze(v);
  }
  return v;
}

export interface LedgerEntry {
  pre: PreActionRecord;
  outcome: OutcomeRecord | null;
}

/**
 * In-memory, append-only. It stores frozen copies, so a caller changing its own object after
 * `seal` changes nothing here. NOT persisted: shadow only, no database.
 */
export class PrecommitLedger {
  private readonly pres = new Map<string, PreActionRecord>();
  private readonly outcomes = new Map<string, OutcomeRecord>();
  private readonly supersededBy = new Map<string, string>();
  private readonly nonces = new Set<string>();

  /** Accept a sealed record. A nonce is single-use across the ledger, superseded records included. */
  seal(record: unknown): PreActionRecord {
    const pre = verifyPreAction(record);
    if (this.nonces.has(pre.nonce)) throw new PrecommitError('NONCE_REUSED', 'this nonce was already used by a sealed record');
    const kept = deepFreeze(copyOf(pre));
    this.nonces.add(kept.nonce);
    this.pres.set(kept.sealed_hash.value, kept);
    return kept;
  }

  /**
   * Replace a forecast with a later one for the same task, BEFORE anything grades it. After an
   * outcome exists the record is fixed for good: EDIT_AFTER_OUTCOME. The old record is kept,
   * marked superseded, and can no longer be graded.
   */
  amend(oldHash: string, next: unknown): PreActionRecord {
    const old = this.pres.get(oldHash);
    if (!old) throw new PrecommitError('PRE_ACTION_NOT_FOUND', 'no sealed record has that hash');
    if (this.outcomes.has(oldHash)) throw new PrecommitError('EDIT_AFTER_OUTCOME', 'this forecast already has an outcome; it cannot be amended');
    if (this.supersededBy.has(oldHash)) throw new PrecommitError('SUPERSEDED', 'this forecast was already amended');
    const pre = verifyPreAction(next);
    if (pre.task_id !== old.task_id) throw new PrecommitError('TASK_MISMATCH', 'an amendment must forecast the same task');
    if (!(Date.parse(pre.sealed_at) > Date.parse(old.sealed_at))) throw new PrecommitError('NOT_LATER', 'an amendment must be sealed after the record it replaces');
    const kept = this.seal(pre);
    this.supersededBy.set(oldHash, kept.sealed_hash.value);
    return kept;
  }

  /** Accept an outcome for a sealed, current record. One outcome per record; an outcome is not edited either. */
  grade(outcome: unknown): OutcomeRecord {
    const named = plainObject(outcome, 'outcome').pre_action_hash;
    const pre = typeof named === 'string' ? this.pres.get(named) : undefined;
    if (!pre) throw new PrecommitError('PRE_ACTION_NOT_FOUND', 'the outcome names no sealed record in this ledger');
    if (this.supersededBy.has(pre.sealed_hash.value)) throw new PrecommitError('SUPERSEDED', 'the outcome names a forecast that was amended; grade the current one');
    if (this.outcomes.has(pre.sealed_hash.value)) throw new PrecommitError('ALREADY_GRADED', 'this forecast already has an outcome');
    const verified = verifyOutcome(pre, outcome);
    const kept = deepFreeze(copyOf(verified.outcome));
    this.outcomes.set(pre.sealed_hash.value, kept);
    return kept;
  }

  /** Current forecasts (superseded ones left out), each with its outcome or null. */
  entries(): LedgerEntry[] {
    return [...this.pres.values()]
      .filter((p) => !this.supersededBy.has(p.sealed_hash.value))
      .map((pre) => ({ pre, outcome: this.outcomes.get(pre.sealed_hash.value) ?? null }));
  }
}

// ── Brier, resolved outcomes only ───────────────────────────────────────────────────────────────

/** The bar `learn report` uses for calibration (report.ts CALIBRATION_MIN): below it, "not measured". */
export const BRIER_MIN = 20;

export interface BrierReport {
  axis: Axis;
  /** Mean squared error over resolved outcomes, or null with `not_measured` saying why. */
  brier: number | null;
  not_measured: string | null;
  /** Current forecasts that state a probability on this axis. */
  stated: number;
  /** Graded SUPPORTED/CONTRADICTED (p_truth) or SUCCEEDED/FAILED (p_success): the only ones scored. */
  resolved: number;
  /** Graded UNKNOWN on this axis. Censored: never scored. */
  unknown: number;
  /** Stated, with no outcome yet. Never scored. */
  ungraded: number;
  /** Forecasts with no probability on this axis. */
  not_stated: number;
  /** resolved / stated. Grading only the easy ones shows up here, not as a better score. */
  selection_rate: number | null;
  mean_p_resolved: number | null;
  mean_p_unresolved: number | null;
  confidence_methods: string[];
  /** RFC 8785 SHA-256 of the sorted [pre hash, outcome hash] pairs scored: which records the number is about. */
  scored_set_sha256: string | null;
  /** With `tasks`: how many of the tasks that ran had a forecast on this axis at all. */
  task_coverage: { tasks: number; with_forecast: number; rate: number } | null;
}

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/**
 * Brier score on ONE axis. Every pair is re-verified (hashes, ordering, grader) and nonces must be
 * unique across the set, so a file of records is checked before it is scored. UNKNOWN and ungraded
 * forecasts are counted, never scored. Two confidence methods are never pooled into one number.
 *
 * `tasks`: the ids of every task that ran, from a source other than these records. Without it, a
 * forecaster who only SEALS forecasts for easy tasks is invisible; with it, that is task_coverage.
 */
export function brierScore(
  entries: readonly LedgerEntry[],
  axis: Axis,
  opts: { min?: number; tasks?: readonly string[] } = {},
): BrierReport {
  const min = opts.min ?? BRIER_MIN;
  const nonces = new Set<string>();
  const stated: { p: number; pre: PreActionRecord; outcome: OutcomeRecord | null }[] = [];
  let notStated = 0;
  for (const e of entries) {
    const pre = e.outcome ? verifyOutcome(e.pre, e.outcome).pre : verifyPreAction(e.pre);
    if (nonces.has(pre.nonce)) throw new PrecommitError('NONCE_REUSED', 'two records in this set share a nonce');
    nonces.add(pre.nonce);
    const p = pre[axis];
    if (p === null) notStated += 1;
    else stated.push({ p, pre, outcome: e.outcome });
  }
  const resolution = (o: OutcomeRecord | null): 0 | 1 | 'UNKNOWN' | null => {
    if (!o) return null;
    const r = axis === 'p_truth' ? o.result : o.execution;
    return r === 'SUPPORTED' || r === 'SUCCEEDED' ? 1 : r === 'CONTRADICTED' || r === 'FAILED' ? 0 : 'UNKNOWN';
  };
  const resolved = stated.filter((s) => typeof resolution(s.outcome) === 'number');
  const unknown = stated.filter((s) => resolution(s.outcome) === 'UNKNOWN').length;
  const ungraded = stated.filter((s) => s.outcome === null).length;
  const unresolved = stated.filter((s) => typeof resolution(s.outcome) !== 'number');
  const methods = [...new Set(stated.map((s) => s.pre.confidence_method))].sort();

  let notMeasured: string | null = null;
  if (methods.length > 1) notMeasured = `mixed confidence methods (${methods.join(', ')}): score each method separately`;
  else if (resolved.length === 0) notMeasured = 'no resolved outcome on this axis';
  else if (resolved.length < min) notMeasured = `needs ${min} resolved outcomes on this axis (has ${resolved.length})`;
  const brier = notMeasured === null ? (mean(resolved.map((s) => (s.p - (resolution(s.outcome) as number)) ** 2)) as number) : null;

  let coverage: BrierReport['task_coverage'] = null;
  if (opts.tasks) {
    const universe = new Set(opts.tasks);
    const forecast = new Set(stated.map((s) => s.pre.task_id));
    const withForecast = [...universe].filter((t) => forecast.has(t)).length;
    coverage = { tasks: universe.size, with_forecast: withForecast, rate: universe.size ? withForecast / universe.size : 0 };
  }

  return {
    axis,
    brier,
    not_measured: notMeasured,
    stated: stated.length,
    resolved: resolved.length,
    unknown,
    ungraded,
    not_stated: notStated,
    selection_rate: stated.length ? resolved.length / stated.length : null,
    mean_p_resolved: mean(resolved.map((s) => s.p)),
    mean_p_unresolved: mean(unresolved.map((s) => s.p)),
    confidence_methods: methods,
    scored_set_sha256: resolved.length
      ? jcsSha256(resolved.map((s) => [s.pre.sealed_hash.value, (s.outcome as OutcomeRecord).outcome_hash.value]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)))
      : null,
    task_coverage: coverage,
  };
}

/** One line, the number never without its ruler. */
export function formatBrier(r: BrierReport): string {
  const pct = (x: number | null) => (x === null ? 'n/a' : `${Math.round(x * 100)}%`);
  const head = r.brier === null ? `${r.axis}: not measured (${r.not_measured})` : `${r.axis}: Brier ${r.brier.toFixed(3)}`;
  const parts = [
    head,
    `method ${r.confidence_methods.join(', ') || 'none'}`,
    `${r.resolved} resolved of ${r.stated} stated (selection ${pct(r.selection_rate)})`,
    `${r.unknown} UNKNOWN`,
    `${r.ungraded} ungraded`,
    `${r.not_stated} not stated on this axis`,
  ];
  if (r.task_coverage) parts.push(`forecast on ${r.task_coverage.with_forecast} of ${r.task_coverage.tasks} tasks (${pct(r.task_coverage.rate)})`);
  if (r.scored_set_sha256) parts.push(`scored set ${r.scored_set_sha256.slice(0, 12)}`);
  return parts.join(' · ');
}
