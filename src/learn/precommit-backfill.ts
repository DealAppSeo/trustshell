/**
 * DRY RUN. Map existing `learn` episodes onto pre-action / outcome records (precommit.ts) and print
 * them. It never writes a database: the memory file is opened READ-ONLY (node:sqlite readOnly, so
 * SQLite itself refuses a write), and output goes to stdout or to a NEW file you name.
 * ------------------------------------------------------------------
 * WHICH AXIS. `learn record --confidence` is described to agents as "your probability that the
 * check will pass, stated before it runs" (src/mcp/index.ts learn_record). The check is the
 * person's registered command that decides whether the agent's work on the job succeeded. So the
 * number maps to p_success, with the check as the sealed success criterion. p_truth stays null:
 * learn records no proposition, and copying one number into both fields is exactly the merge the
 * new record exists to prevent.
 *
 * WHAT IS ELIGIBLE. Only episodes under a job the person created (report.ts leaves the others out
 * of every ruler too), with a frozen check and a confidence recorded STRICTLY before the check.
 * `learn report` accepts confidence_at <= check_at; an equal timestamp is not eligible here, for
 * the reason context-frame.ts gives: it cannot be told apart from the same code path.
 *
 * WHAT IS NEVER INVENTED. No outcome is made up. An episode whose check never ran (or did not
 * exit, which writes nothing) has no outcome record: it is a forecast nobody graded, and it counts
 * in the denominator of the selection rate. Every outcome's `result` (truth) is UNKNOWN, because
 * learn grades no proposition. `execution` is the check's own pass / fail and nothing else.
 *
 * WHAT IT CANNOT SHOW. learn stores the LAST confidence stated before the check (a second
 * `learn record --confidence` overwrites the first) and seals nothing, so these records seal what
 * the file holds now. They cannot show the values were not edited before the backfill read them.
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { closeSync, existsSync, openSync, writeSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { jcsSha256 } from '../lib/jcs';
import { PrecommitError, brierScore, formatBrier, gradeOutcome, sealPreAction, type BrierReport, type OutcomeRecord, type PreActionRecord } from './precommit';

/** The learn_episode columns the backfill reads. Metadata only: learn stores no prompt text here. */
export interface LearnEpisodeRow {
  id: number;
  job: string;
  model: string | null;
  family: string | null;
  check_id: string | null;
  confidence: number | null;
  confidence_at: string | null;
  check_outcome: 'pass' | 'fail' | null;
  check_at: string | null;
}

export interface BackfillLine {
  source: { learn_episode: number; job: string; family: string | null };
  pre_action: PreActionRecord;
  outcome: OutcomeRecord | null;
}

export interface BackfillResult {
  lines: BackfillLine[];
  skipped: { episode: number; reason: string }[];
  summary: {
    episodes: number;
    eligible: number;
    skipped: Record<string, number>;
    graded: number;
    succeeded: number;
    failed: number;
    ungraded: number;
    /** Every graded line: learn grades no proposition. */
    truth_unknown: number;
    p_success: BrierReport;
  };
}

export const BACKFILL_METHOD = 'learn.confidence';
const NONCE_DOMAIN = 'dev.trustshell.precommit.backfill/learn/v1';

function canonical(v: string | null): number | null {
  if (v === null) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) && new Date(t).toISOString() === v ? t : null;
}

/** Why an episode is not eligible, or null. */
function ineligible(e: LearnEpisodeRow, jobs: ReadonlySet<string>): string | null {
  if (!jobs.has(e.job)) return 'job not created by the person';
  if (e.check_id === null) return 'no check frozen on the episode';
  if (e.confidence === null || e.confidence_at === null) return 'no confidence recorded';
  if (!(e.confidence >= 0 && e.confidence <= 1)) return 'confidence outside 0-1';
  const stated = canonical(e.confidence_at);
  if (stated === null) return 'confidence_at is not a canonical ISO instant';
  if (e.check_outcome !== null) {
    const checked = canonical(e.check_at);
    if (checked === null) return 'check_at is not a canonical ISO instant';
    if (!(stated < checked)) return 'confidence not recorded strictly before the check';
  }
  return null;
}

/** PURE. Episodes in, records out. Same rows, same output (the nonce is derived, not random). */
export function backfillEpisodes(rows: readonly LearnEpisodeRow[], jobs: ReadonlySet<string>, opts: { min?: number } = {}): BackfillResult {
  const lines: BackfillLine[] = [];
  const skipped: { episode: number; reason: string }[] = [];
  for (const e of [...rows].sort((a, b) => a.id - b.id)) {
    const why = ineligible(e, jobs);
    if (why) {
      skipped.push({ episode: e.id, reason: why });
      continue;
    }
    const check = e.check_id as string;
    const nonce = createHash('sha256').update(`${NONCE_DOMAIN}\u0000${e.job}\u0000${e.id}\u0000${e.confidence_at}`, 'utf8').digest('hex').slice(0, 32);
    let pre: PreActionRecord;
    let outcome: OutcomeRecord | null = null;
    try {
      pre = sealPreAction(
        {
          task_id: `learn:${e.job}:episode:${e.id}`,
          proposition: null,
          success_criterion: `the registered learn check ${check} exits 0 for this episode`,
          p_truth: null,
          p_success: e.confidence,
          expected_cost: null,
          confidence_method: BACKFILL_METHOD,
          agent: { provider: 'unrecorded', model: e.model ?? 'unrecorded', version: 'unrecorded' },
        },
        { now: new Date(e.confidence_at as string), nonce },
      );
      if (e.check_outcome !== null) {
        const at = new Date(e.check_at as string);
        outcome = gradeOutcome(
          pre,
          {
            // `learn check run` stamps check_at when it is invoked, before the command runs: the action start.
            action_started_at: at.toISOString(),
            grader: { kind: 'deterministic_check', id: `learn-check:${check}`, method: 'learn.check.exit_code' },
            result: 'UNKNOWN',
            execution: e.check_outcome === 'pass' ? 'SUCCEEDED' : 'FAILED',
            evidence: {
              schema: 'trustshell.learn_episode',
              digest: jcsSha256({ learn_episode: e.id, job: e.job, check_id: check, check_outcome: e.check_outcome, check_at: e.check_at }),
              ref: `learn_episode:${e.id}`,
            },
          },
          { now: at },
        );
      }
    } catch (err) {
      if (!(err instanceof PrecommitError)) throw err;
      skipped.push({ episode: e.id, reason: `refused by the record rules (${err.code})` });
      continue;
    }
    lines.push({ source: { learn_episode: e.id, job: e.job, family: e.family }, pre_action: pre, outcome });
  }
  const graded = lines.filter((l) => l.outcome !== null);
  const reasons: Record<string, number> = {};
  for (const s of skipped) reasons[s.reason] = (reasons[s.reason] ?? 0) + 1;
  return {
    lines,
    skipped,
    summary: {
      episodes: rows.length,
      eligible: lines.length,
      skipped: reasons,
      graded: graded.length,
      succeeded: graded.filter((l) => l.outcome?.execution === 'SUCCEEDED').length,
      failed: graded.filter((l) => l.outcome?.execution === 'FAILED').length,
      ungraded: lines.length - graded.length,
      truth_unknown: graded.filter((l) => l.outcome?.result === 'UNKNOWN').length,
      p_success: brierScore(lines.map((l) => ({ pre: l.pre_action, outcome: l.outcome })), 'p_success', { min: opts.min }),
    },
  };
}

// ── reading the memory file, read-only ──────────────────────────────────────────────────────────

type ReadOnlyDb = {
  prepare(sql: string): { all(...args: unknown[]): Record<string, unknown>[] };
  close(): void;
};

const loadSqlite = createRequire(__filename);

/** Thrown when the file cannot be read as a learn memory file. The CLI prints NOT_CHECKED, exit 2. */
export class BackfillNotChecked extends Error {}

/** Episodes and person-created job slugs, from a memory file opened read-only. Never creates the file. */
export function readLearnEpisodes(path: string): { rows: LearnEpisodeRow[]; jobs: Set<string> } {
  if (!existsSync(path)) throw new BackfillNotChecked(`no file at ${path}; nothing was read`);
  let db: ReadOnlyDb;
  try {
    const { DatabaseSync } = loadSqlite('node:sqlite') as { DatabaseSync: new (p: string, o: { readOnly: boolean }) => ReadOnlyDb };
    db = new DatabaseSync(path, { readOnly: true });
  } catch (err) {
    throw new BackfillNotChecked(`could not open ${path} read-only (${err instanceof Error ? err.message : String(err)})`);
  }
  try {
    let tables: Set<string>;
    try {
      tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => String(r.name)));
    } catch (err) {
      throw new BackfillNotChecked(`could not read ${path} as a SQLite file (${err instanceof Error ? err.message : String(err)})`);
    }
    if (!tables.has('learn_episode') || !tables.has('learn_job')) throw new BackfillNotChecked(`${path} has no learn tables; nothing to backfill`);
    const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
    const rows = db
      .prepare('SELECT id, job, model, family, check_id, confidence, confidence_at, check_outcome, check_at FROM learn_episode ORDER BY id')
      .all()
      .map((r) => ({
        id: Number(r.id),
        job: String(r.job),
        model: str(r.model),
        family: str(r.family),
        check_id: str(r.check_id),
        confidence: r.confidence === null || r.confidence === undefined ? null : Number(r.confidence),
        confidence_at: str(r.confidence_at),
        check_outcome: str(r.check_outcome) as 'pass' | 'fail' | null,
        check_at: str(r.check_at),
      }));
    const jobs = new Set(db.prepare('SELECT slug FROM learn_job').all().map((r) => String(r.slug)));
    return { rows, jobs };
  } finally {
    db.close();
  }
}

// ── the script's entry point (scripts/precommit-backfill.cjs) ───────────────────────────────────

export const BACKFILL_USAGE = `precommit-backfill (dry run; reads a learn memory file read-only, writes no database)
  node scripts/precommit-backfill.cjs --memory <memory.sqlite> [--out <new-file.jsonl>] [--min N]
  One JSON line per eligible episode ({source, pre_action, outcome}) to stdout, or to --out (a new
  file; an existing file, the memory file, or a .sqlite/.db name is refused). Summary on stderr.
  Exit: 0 done, 2 usage or NOT_CHECKED, 3 runtime error.`;

const DB_EXT = new Set(['.sqlite', '.sqlite3', '.db', '.db3']);

export function runBackfill(argv: readonly string[], io: { out: (s: string) => void; err: (s: string) => void }): number {
  const opt: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i] as string;
    if (a !== '--memory' && a !== '--out' && a !== '--min') {
      io.err(`precommit-backfill: unknown argument ${JSON.stringify(a).slice(0, 60)}\n${BACKFILL_USAGE}`);
      return 2;
    }
    const v = argv[i + 1];
    if (v === undefined) {
      io.err(`precommit-backfill: ${a} needs a value\n${BACKFILL_USAGE}`);
      return 2;
    }
    opt[a.slice(2)] = v;
    i += 1;
  }
  if (!opt.memory) {
    io.err(`precommit-backfill: --memory <path> is required (there is no default: name the file)\n${BACKFILL_USAGE}`);
    return 2;
  }
  if (opt.min !== undefined && !/^[1-9]\d{0,5}$/.test(opt.min)) {
    io.err('precommit-backfill: --min is a whole number, 1 or more');
    return 2;
  }
  if (opt.out !== undefined) {
    if (DB_EXT.has(extname(opt.out).toLowerCase())) {
      io.err('precommit-backfill: refused: --out names a database file; this script never writes one');
      return 2;
    }
    if (resolve(opt.out) === resolve(opt.memory)) {
      io.err('precommit-backfill: refused: --out is the memory file');
      return 2;
    }
  }
  try {
    const { rows, jobs } = readLearnEpisodes(opt.memory);
    const r = backfillEpisodes(rows, jobs, { min: opt.min === undefined ? undefined : Number(opt.min) });
    const body = r.lines.map((l) => JSON.stringify(l)).join('\n') + (r.lines.length ? '\n' : '');
    if (opt.out !== undefined) {
      let fd: number;
      try {
        fd = openSync(opt.out, 'wx'); // exclusive create: an existing file is never overwritten
      } catch (err) {
        io.err(`precommit-backfill: refused to write ${opt.out} (${(err as { code?: string }).code ?? 'error'}): it exists or cannot be created; nothing was written`);
        return 2;
      }
      try {
        writeSync(fd, body);
      } finally {
        closeSync(fd);
      }
    } else if (body) io.out(body.trimEnd());
    const s = r.summary;
    const reasons = Object.entries(s.skipped).map(([k, n]) => `${n} ${k}`).join('; ') || 'none';
    io.err(`precommit-backfill (dry run): ${s.episodes} episodes read, ${s.eligible} eligible, skipped: ${reasons}`);
    io.err(`graded by the person's check: ${s.graded} (${s.succeeded} SUCCEEDED, ${s.failed} FAILED); ungraded: ${s.ungraded}; truth UNKNOWN on every graded line: ${s.truth_unknown}`);
    io.err(formatBrier(s.p_success));
    if (opt.out !== undefined) io.err(`wrote ${r.lines.length} lines to ${opt.out}`);
    return 0;
  } catch (err) {
    if (err instanceof BackfillNotChecked) {
      io.err(`precommit-backfill: NOT_CHECKED ${err.message}`);
      return 2;
    }
    io.err(`precommit-backfill failed: ${err instanceof Error ? err.message : String(err)}`);
    return 3;
  }
}
