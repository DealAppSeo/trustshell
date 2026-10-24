/**
 * AUTONOMY LEVELS, SHADOW FIRST: an agent's autonomy under Guard rises with checked evidence and falls on incidents.
 * ------------------------------------------------------------------------------------------------------------
 * OFF unless the owner policy has an `autonomy` block (`trustshell guard level shadow` writes one). The block is
 * inside `policy`, so the owner's signature covers it and every change to it is a recorded policy change.
 *   mode "shadow"   the default. The level is computed and recorded; Guard allows exactly what the policy allows,
 *                   and nothing in here can stop an action (a failure is swallowed and the decision stands).
 *   mode "enforce"  an explicit owner opt-in. The level can also refuse, and fails closed. It only ever NARROWS the
 *                   policy: a level never allows an action the policy does not list, and the spend caps still bind.
 *
 * LEVELS, as presets over the request classes the guard already has (`--class` is the caller's label, as everywhere
 * in the guard):
 *   L0 observe     nothing starts
 *   L1 read-only   class read, and the trustshell commands that only read (READ_ONLY_COMMANDS)
 *   L2 workspace   L1, and class other: commands that change local files. The guard does not see where they write.
 *   L3 broader     L2, and post and spend, under the policy's spend caps
 * Every agent starts at L1.
 *
 * PROMOTION, one level: `promote_after` Inspect records (`trustshell check <runUrl> --claims-file <f> --out <dir>`)
 * whose EVERY claim is SUPPORTED on a complete run, since the last level change. One record per run, and one commit
 * counts once, ever: re-running a workflow, or a second workflow on the same commit, does not count twice. A record
 * with any NOT_CHECKED claim counts for nothing: NOT_CHECKED never promotes.
 * DEMOTION: one level on an Inspect record with a CONTRADICTED claim, or on a Guard refusal of an out-of-lane attempt
 * (an action the policy does not list, a `run` whose executable is not the named tool, a command always denied, and
 * under enforce, what the level does not allow). To L0 on owner revocation (`guard level revoke`, `guard kill`).
 * A demotion at L0 stays at L0 and starts the count again. Expiry, an over-cap amount or a broken policy file are the
 * owner's state, not the agent's attempt, and are not incidents. In shadow the level falls only on what actually
 * happened; a refusal the level WOULD have made is measured, not counted.
 * Every change is its own hashed record in `autonomy.jsonl`, with the reason.
 *
 * MEASUREMENT: every Guard decision under an autonomy block writes a `would-be` record beside it: what the policy
 * alone decided (fixed autonomy) and what the policy and the level together would decide (earned autonomy). That is
 * the data for a question no published study has measured (hyperdag-protocol docs/WHY.md §2): does autonomy earned
 * from checked records reduce harmful actions compared with fixed autonomy? Nothing here answers it yet.
 *
 * WHAT THIS IS NOT. Local guardrails for cooperative agents, not a security boundary. Anything running as you can
 * edit the policy, edit or delete `autonomy.jsonl`, or hand `guard level record` a record.json it made up: an Inspect
 * record is unsigned, and its digest shows it was not edited, not who made it. A record counts for the policy's
 * subject because whoever ran `guard level record` said it was that agent's. The level is per host: bundles do not
 * carry `autonomy.jsonl`. The chain is unkeyed, like the guard's.
 */
import { join } from 'node:path';
import { canonicalize, jcsSha256 } from './jcs';
import { ACTION_EVIDENCE_SCHEMA, claimsExitCode, digestRecord, tallyClaims, type ActionEvidenceRecord, type ClaimStatus, type ClaimTally } from './action-evidence';
import type { GuardFs, GuardRequest } from './guardrails';

export const AUTONOMY_FILE = 'autonomy.jsonl';
export const AUTONOMY_RECORD_SCHEMA = 'trustshell.autonomy-record/0.1-draft';

export type Level = 0 | 1 | 2 | 3;
export type AutonomyMode = 'shadow' | 'enforce';

export const LEVEL_MEANS: readonly string[] = [
  'L0 observe: nothing starts',
  'L1 read-only: class read, and the trustshell commands that only read (ground, inspect, recall, report, traps)',
  'L2 workspace: L1, and class other, the commands that change local files (the guard does not see where they write)',
  "L3 broader: L2, and post and spend, under the policy's spend caps",
];

/** Every agent starts here. L0 is where revocation puts it. */
export const START_LEVEL: Level = 1;

/** trustshell commands that only read: L1 lets these start. A `run` names an executable, so it is never one of these. */
export const READ_ONLY_COMMANDS: readonly string[] = ['ground', 'inspect', 'recall', 'report', 'traps'];

export interface AutonomyConfig {
  mode: AutonomyMode;
  /** Inspect records SUPPORTED in full, one per commit, needed to reach each level from the one below it. */
  promote_after: { L1: number; L2: number; L3: number };
}

export const DEFAULT_AUTONOMY: AutonomyConfig = { mode: 'shadow', promote_after: { L1: 3, L2: 5, L3: 10 } };

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** PURE. The `autonomy` block of a policy, as strictly as the rest of it: unknown keys and missing ones are errors. */
export function parseAutonomy(v: unknown): { ok: true; config: AutonomyConfig } | { ok: false; errors: string[] } {
  if (!isObject(v)) return { ok: false, errors: ['autonomy must be { mode, promote_after }'] };
  const errors = Object.keys(v)
    .filter((k) => k !== 'mode' && k !== 'promote_after')
    .map((k) => `autonomy: unknown field "${k.slice(0, 40)}"`);
  if (v.mode !== 'shadow' && v.mode !== 'enforce') errors.push('autonomy.mode must be shadow or enforce');
  const p = v.promote_after;
  const n = (x: unknown) => Number.isSafeInteger(x) && (x as number) >= 1 && (x as number) <= 10000;
  if (!isObject(p) || Object.keys(p).sort().join() !== 'L1,L2,L3' || !n(p.L1) || !n(p.L2) || !n(p.L3)) {
    errors.push('autonomy.promote_after must be { L1, L2, L3 }, each a whole number from 1 to 10000');
  }
  if (errors.length) return { ok: false, errors };
  const q = p as { L1: number; L2: number; L3: number };
  return { ok: true, config: { mode: v.mode as AutonomyMode, promote_after: { L1: q.L1, L2: q.L2, L3: q.L3 } } };
}

/** PURE. Whether a level lets this request start. The policy is weighed separately, and both must allow it. */
export function levelAllows(level: Level, req: Pick<GuardRequest, 'tool' | 'class' | 'executable'>): boolean {
  if (req.class === 'spend' || req.class === 'post') return level >= 3;
  if (req.class === 'other') return level >= 2 || (level === 1 && req.executable === undefined && READ_ONLY_COMMANDS.includes(req.tool));
  return level >= 1;
}

type Ref = { seq: number; hash: string };
type Verdict = 'ALLOWED' | 'DENIED';

export type AutonomyEvent =
  /** One Inspect record, attributed to the policy's subject by whoever recorded it. */
  | { kind: 'evidence'; subject: string; run: string; commit: string; record_sha256: string; outcome: ClaimStatus; tally: ClaimTally }
  /** A Guard refusal of an out-of-lane attempt, by its guard record. */
  | { kind: 'incident'; guard_record: Ref; action: string; reasons: string[] }
  | { kind: 'revocation'; via: string }
  | { kind: 'level-change'; from: Level; to: Level; reason: string }
  /** fixed: what the policy alone decided. earned: what the policy and the level decide together. */
  | { kind: 'would-be'; guard_record: Ref; action: string; class: GuardRequest['class']; level: Level; fixed: Verdict; earned: Verdict };

export type AutonomyRecord = AutonomyEvent & {
  schema: typeof AUTONOMY_RECORD_SCHEMA;
  seq: number;
  ts: string;
  /** The mode in force when the record was written. */
  mode: AutonomyMode;
  prev: string | null;
  hash: string;
};

export interface AutonomyReading {
  verdict: 'INTACT' | 'BROKEN' | 'EMPTY';
  records: AutonomyRecord[];
  breaks: string[];
}

/** PURE. Check every hash and link of `autonomy.jsonl`, the guard ledger's way. */
export function readAutonomy(text: string): AutonomyReading {
  const records: AutonomyRecord[] = [];
  const breaks: string[] = [];
  let prev: string | null = null;
  text
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .forEach((line, i) => {
      const n = i + 1;
      let r: AutonomyRecord;
      try {
        r = JSON.parse(line) as AutonomyRecord;
      } catch {
        breaks.push(`line ${n}: not JSON`);
        return;
      }
      const { hash, ...body } = r;
      let want: string | null = null;
      try {
        want = jcsSha256(body);
      } catch {
        /* not canonicalizable: a break below */
      }
      if (r.schema !== AUTONOMY_RECORD_SCHEMA) breaks.push(`line ${n}: schema is not ${AUTONOMY_RECORD_SCHEMA}`);
      if (want === null || hash !== want) breaks.push(`line ${n}: hash does not match the record`);
      if (r.prev !== prev) breaks.push(`line ${n}: prev does not match the line before`);
      if (r.seq !== n) breaks.push(`line ${n}: seq is ${r.seq}`);
      prev = typeof hash === 'string' ? hash : null;
      records.push(r);
    });
  return { verdict: breaks.length ? 'BROKEN' : records.length ? 'INTACT' : 'EMPTY', records, breaks };
}

export interface LevelState {
  level: Level;
  /** The reason of the last level change, or the start. */
  reason: string;
  /** Inspect records SUPPORTED in full since the last level change, each on a commit never counted before. */
  supported: number;
  /** What the next level needs: null at L3, or while the record is BROKEN. */
  needed: number | null;
  chain: AutonomyReading['verdict'];
}

/** PURE. The level is the last change's `to`; the count is what came after it. A BROKEN record reads as L0. */
export function levelState(reading: AutonomyReading, config: AutonomyConfig): LevelState {
  if (reading.verdict === 'BROKEN') {
    return { level: 0, reason: `autonomy.jsonl is BROKEN (${reading.breaks[0]}), so the level is unknown and reads as L0`, supported: 0, needed: null, chain: 'BROKEN' };
  }
  let level: Level = START_LEVEL;
  let reason = `every agent starts at L${START_LEVEL}`;
  let supported = 0;
  const counted = new Set<string>();
  for (const r of reading.records) {
    if (r.kind === 'level-change') {
      level = r.to;
      reason = r.reason;
      supported = 0;
    } else if (r.kind === 'evidence' && r.outcome === 'SUPPORTED' && !counted.has(r.commit)) {
      counted.add(r.commit);
      supported += 1;
    }
  }
  const needed = level < 3 ? config.promote_after[`L${level + 1}` as 'L1' | 'L2' | 'L3'] : null;
  return { level, reason, supported, needed, chain: reading.verdict };
}

/** PURE. The level change an event causes, given the state with that event already counted. */
function change(s: LevelState, ev: AutonomyEvent): { to: Level; reason: string } | null {
  if (s.chain === 'BROKEN') return null;
  const down = Math.max(0, s.level - 1) as Level;
  const stays = s.level === 0 ? ' (stays at L0; the count starts again)' : '';
  if (ev.kind === 'revocation') return { to: 0, reason: `the owner revoked it (${ev.via})` };
  if (ev.kind === 'incident') return { to: down, reason: `Guard refused an out-of-lane attempt, ${ev.action} (guard record ${ev.guard_record.seq})${stays}` };
  if (ev.kind !== 'evidence') return null;
  if (ev.outcome === 'CONTRADICTED') return { to: down, reason: `an Inspect record has a CONTRADICTED claim (${ev.run})${stays}` };
  if (ev.outcome === 'SUPPORTED' && s.needed !== null && s.supported >= s.needed) {
    return { to: (s.level + 1) as Level, reason: `${s.supported} Inspect records SUPPORTED in full, one per commit, since the last change, none CONTRADICTED (the last: ${ev.run})` };
  }
  return null;
}

/**
 * Append events to `autonomy.jsonl` in `dir`, each followed by the level change it causes, if any. The CALLER holds
 * the guard lock. `reading` is that file as the caller already read it.
 * ponytail: reads and verifies the whole file per guard decision, like the guard ledger before its checkpoint; add a
 * checkpoint (GUARD_CHECKPOINT_FILE's shape) when the would-be records make that measurable.
 */
export function appendAutonomy(dir: string, fs: GuardFs, config: AutonomyConfig, events: AutonomyEvent[], ts: string, reading?: AutonomyReading): AutonomyRecord[] {
  const path = join(dir, AUTONOMY_FILE);
  const r = reading ?? readAutonomy(fs.exists(path) ? fs.read(path) : '');
  const all = [...r.records];
  const added: AutonomyRecord[] = [];
  const push = (ev: AutonomyEvent) => {
    const last = all[all.length - 1];
    const body = { schema: AUTONOMY_RECORD_SCHEMA, seq: (last?.seq ?? 0) + 1, ts, mode: config.mode, ...ev, prev: last?.hash ?? null };
    const rec = { ...body, hash: jcsSha256(body) } as AutonomyRecord;
    all.push(rec);
    added.push(rec);
  };
  for (const ev of events) {
    push(ev);
    const s = levelState({ ...r, records: all }, config);
    const c = change(s, ev);
    if (c) push({ kind: 'level-change', from: s.level, to: c.to, reason: c.reason });
  }
  fs.mkdirp(dir);
  fs.append(path, added.map((a) => canonicalize(a) + '\n').join(''));
  return added;
}

/**
 * PURE. An Inspect record, as `check --out` writes record.json (and `--json` prints): `{ record, digest }`. The digest
 * must match, and one outcome is drawn from it: CONTRADICTED if any claim is, SUPPORTED only when every claim is
 * SUPPORTED on a complete run (exit 0), and NOT_CHECKED otherwise.
 */
export function evidenceFromRecordFile(text: string, subject: string): { ok: true; event: Extract<AutonomyEvent, { kind: 'evidence' }> } | { ok: false; error: string } {
  const notOne = `not an Inspect record: expected { record, digest } with record.schema ${ACTION_EVIDENCE_SCHEMA}, as trustshell check <runUrl> --claims-file <path> --out <dir> writes record.json`;
  let raw: unknown;
  try {
    raw = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (e) {
    return { ok: false, error: `not JSON: ${(e as Error).message}` };
  }
  if (!isObject(raw) || !isObject(raw.record) || raw.record.schema !== ACTION_EVIDENCE_SCHEMA || !isObject(raw.digest)) return { ok: false, error: notOne };
  const record = raw.record as unknown as ActionEvidenceRecord;
  const o = record.observation;
  const statuses = ['SUPPORTED', 'CONTRADICTED', 'NOT_CHECKED'];
  if (
    !isObject(o) ||
    !Array.isArray(record.claims) ||
    !record.claims.every((c) => isObject(c) && statuses.includes(c.status as string)) ||
    !isObject(o.check) ||
    ![o.url, o.owner, o.repo, o.head_sha].every((x) => typeof x === 'string' && x.length > 0)
  ) {
    return { ok: false, error: notOne };
  }
  let sha: string;
  try {
    sha = digestRecord(record).value;
  } catch {
    return { ok: false, error: notOne };
  }
  if (raw.digest.value !== sha) return { ok: false, error: 'the digest does not match the record: it was changed after it was made' };
  const tally = tallyClaims(record.claims);
  const outcome: ClaimStatus = tally.CONTRADICTED > 0 ? 'CONTRADICTED' : claimsExitCode(record) === 0 ? 'SUPPORTED' : 'NOT_CHECKED';
  return {
    ok: true,
    event: { kind: 'evidence', subject, run: `${o.url}/attempts/${o.run_attempt ?? 'unknown'}`, commit: `${o.owner}/${o.repo}@${o.head_sha}`, record_sha256: sha, outcome, tally },
  };
}

/**
 * Record one piece of evidence or a revocation, under the guard lock. A run already recorded is refused, whatever
 * either outcome was: one record per run, so a run cannot be re-inspected with other claims until one counts.
 */
export function recordAutonomyEvent(
  dir: string,
  fs: GuardFs,
  config: AutonomyConfig,
  ev: Extract<AutonomyEvent, { kind: 'evidence' | 'revocation' }>,
  ts: string = new Date().toISOString(),
): { ok: true; added: AutonomyRecord[]; before: LevelState; after: LevelState } | { ok: false; error: string } {
  const release = fs.lock(dir);
  try {
    const path = join(dir, AUTONOMY_FILE);
    const reading = readAutonomy(fs.exists(path) ? fs.read(path) : '');
    if (ev.kind === 'evidence') {
      const dup = reading.records.find((r) => r.kind === 'evidence' && r.run === ev.run);
      if (dup) return { ok: false, error: `${ev.run} is already recorded (record ${dup.seq}): one record per run` };
    }
    const before = levelState(reading, config);
    const added = appendAutonomy(dir, fs, config, [ev], ts, reading);
    return { ok: true, added, before, after: levelState({ ...reading, records: [...reading.records, ...added] }, config) };
  } finally {
    release();
  }
}

/** What the would-be records measured so far: how often the level would have refused what the policy allowed. */
export function measured(reading: AutonomyReading): { decisions: number; fixed_allowed: number; earned_denied: number } {
  let decisions = 0;
  let fixedAllowed = 0;
  let earnedDenied = 0;
  for (const r of reading.records) {
    if (r.kind !== 'would-be') continue;
    decisions += 1;
    if (r.fixed === 'ALLOWED') {
      fixedAllowed += 1;
      if (r.earned === 'DENIED') earnedDenied += 1;
    }
  }
  return { decisions, fixed_allowed: fixedAllowed, earned_denied: earnedDenied };
}
