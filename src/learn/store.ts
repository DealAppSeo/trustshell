/**
 * learn — the learning loop v1, local. Spec: living-docs 03_specs/LEARNING_LOOP_SPEC_v1_2026-10-16.md
 * (§2 non-negotiables, §8 the round-2 changes that override §3–§7).
 *
 * WHERE THINGS LIVE. One sqlite file: the local memory (src/memory/local-store.ts).
 *   - TEXT the person wrote (a correction, a job line, an attempt, a probe criterion) goes through
 *     insertMemory with an explicit taint label, so it is sealed when TRUSTSHELL_MEMORY_ENCRYPT is on
 *     and screened like every other row. A correction is kind `lesson`, untrusted and QUARANTINED
 *     until the person runs `learn accept`; nothing here reads the memory table directly.
 *   - Everything else is metadata in learn_* tables: slugs, ids, counts, hashes, timestamps, and the
 *     check commands the person registered. No prompt text is stored; an ask is a sha256.
 *
 * WHO MAY WRITE WHAT (§8.1). Only `learn check run` writes check_outcome, from the exit code of the
 * command the person registered. `learn record` (and MCP learn_record) writes agent_outcome, which no
 * ruler reads. The person's rating (`learn rate`) is stored and reported, outside rulers 1–2.
 *
 * WHAT REACHES A MODEL. Only `inject` builds model-bound text, and only from rows `injectable`
 * (local-store) passes: lessons the person accepted, unexpired, for this job, verbatim; plus the
 * person's own attempt as a cloze. Capped at 5 lessons and 400 tokens, counted as loop_tokens.
 *
 * NO NETWORK. Nothing here imports a network helper. `check run` and `probe run` execute the
 * command the person registered, which is the person's own program.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { ingest } from '../lib/ingest';
import { refusedValue } from '../cli/remember';
import { rememberUntrusted } from '../memory/quarantine';
import {
  INJECTION_PREFIX,
  INJECTION_WITHHELD,
  LESSON_ACCEPTED,
  heldAsInjection,
  injectable,
  insertMemory,
  markReleased,
  memoryDbPath,
  openMemoryDb,
  readRows,
  type MemoryRow,
  type SqliteDb,
} from '../memory/local-store';

export const MODES = ['delegate', 'cowork', 'learn'] as const;
export type Mode = (typeof MODES)[number];
export type Outcome = 'pass' | 'fail';
export type LessonStatus = 'candidate' | 'accepted' | 'declined' | 'retired' | 'quarantined';

export const MAX_LESSONS = 5;
export const MAX_LOOP_TOKENS = 400;
export const LESSON_DAYS = 30;
/** Spaced review ladder, in days. A recall moves one step up; a miss goes back to the first step. */
export const LADDER_DAYS = [1, 3, 7, 14, 30] as const;
const DAY = 86_400_000;

const SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;
/** Model ids, families, check ids and turn keys: printed in reports, so a plain charset only. */
const LABEL = /^[A-Za-z0-9._:/@+-]{1,120}$/;
const SHA256 = /^[0-9a-f]{64}$/;

/** A refused or malformed request. Nothing was written. The CLI exits 2. */
export class LearnError extends Error {}

export const SCAFFOLD: Record<Mode, string> = {
  delegate: '',
  cowork: "Co-work mode, the person's choice for this job: ask for the person's prediction before you reveal your answer.",
  learn:
    "Learn mode, the person's choice for this job: ask for the person's own attempt first, give hints rather than the answer, and end with one recall question from today's work.",
};

/**
 * Tokens, estimated as characters / 4.
 * ponytail: a fixed ratio, not a tokenizer; good enough for a 400-token cap. Use the model's own
 * tokenizer if a cap ever has to be exact.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS learn_job (
    slug TEXT PRIMARY KEY, mode TEXT NOT NULL CHECK (mode IN ('delegate', 'cowork', 'learn')),
    jtbd_id INTEGER NOT NULL, created_by TEXT NOT NULL DEFAULT 'person', created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS learn_check (
    id TEXT PRIMARY KEY, job TEXT NOT NULL, cmd TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS learn_episode (
    id INTEGER PRIMARY KEY AUTOINCREMENT, job TEXT NOT NULL, turn TEXT, ask_sha256 TEXT,
    model TEXT, family TEXT, tokens INTEGER, loop_tokens INTEGER NOT NULL DEFAULT 0,
    check_id TEXT, confidence REAL, confidence_at TEXT,
    agent_outcome TEXT CHECK (agent_outcome IN ('pass', 'fail')),
    check_outcome TEXT CHECK (check_outcome IN ('pass', 'fail')), check_at TEXT,
    rating TEXT CHECK (rating IN ('accept', 'edit', 'reject')), rated_at TEXT,
    injected TEXT NOT NULL DEFAULT '[]', attempt_id INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  'CREATE UNIQUE INDEX IF NOT EXISTS learn_episode_turn ON learn_episode(turn) WHERE turn IS NOT NULL',
  `CREATE TABLE IF NOT EXISTS learn_eval (
    id INTEGER PRIMARY KEY AUTOINCREMENT, job TEXT NOT NULL, check_id TEXT, body_id INTEGER NOT NULL,
    episode_id INTEGER, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS learn_lesson (
    id INTEGER PRIMARY KEY AUTOINCREMENT, eval_id INTEGER NOT NULL REFERENCES learn_eval(id),
    job TEXT NOT NULL, check_id TEXT, body_id INTEGER NOT NULL, note_id INTEGER,
    status TEXT NOT NULL CHECK (status IN ('candidate', 'accepted', 'declined', 'retired', 'quarantined')),
    status_reason TEXT, accepted_at TEXT, expires_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS learn_attempt (
    id INTEGER PRIMARY KEY AUTOINCREMENT, job TEXT NOT NULL, body_id INTEGER NOT NULL, episode_id INTEGER,
    created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS learn_probe (
    id INTEGER PRIMARY KEY AUTOINCREMENT, job TEXT NOT NULL, check_id TEXT NOT NULL, criterion_id INTEGER NOT NULL,
    created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS learn_probe_score (
    id INTEGER PRIMARY KEY AUTOINCREMENT, probe_id INTEGER NOT NULL, aided INTEGER NOT NULL DEFAULT 0,
    score REAL NOT NULL, by TEXT NOT NULL DEFAULT 'check', created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS learn_review (
    id INTEGER PRIMARY KEY AUTOINCREMENT, lesson_id INTEGER NOT NULL, step INTEGER NOT NULL, due_at TEXT NOT NULL,
    result TEXT CHECK (result IN ('yes', 'no')), answered_at TEXT, created_at TEXT NOT NULL)`,
];

type Row = Record<string, unknown>;

function withDb<T>(path: string, fn: (db: SqliteDb) => T): T {
  const db = openMemoryDb(path);
  try {
    for (const sql of SCHEMA) db.exec(sql);
    return fn(db);
  } finally {
    db.close();
  }
}

/** Readers: a missing memory file is a no-op (null), never a crash, and is never created. */
function readDb<T>(env: NodeJS.ProcessEnv, fn: (db: SqliteDb, path: string) => T): T | null {
  const path = memoryDbPath(env);
  if (!existsSync(path)) return null;
  return withDb(path, (db) => fn(db, path));
}

/** All or nothing: a refused request leaves no half-written episode behind. */
function tx<T>(db: SqliteDb, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function writeDb<T>(env: NodeJS.ProcessEnv, fn: (db: SqliteDb, path: string) => T): T {
  const path = memoryDbPath(env);
  return withDb(path, (db) => fn(db, path));
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const iso = (d: Date): string => d.toISOString();

function slugOf(job: string): string {
  if (!SLUG.test(job)) throw new LearnError(`job slug must be lowercase letters, digits and dashes (got ${JSON.stringify(job).slice(0, 60)})`);
  return job;
}

function label(what: string, v: string): string {
  if (!LABEL.test(v)) throw new LearnError(`${what} must be 1-120 characters of letters, digits and . _ : / @ + -`);
  return v;
}

/** Refuse secret-shaped text before anything is written (the same detector as `remember`). */
function refuseSecret(...texts: (string | undefined)[]): void {
  if (texts.some((t) => t !== undefined && refusedValue(t))) throw new LearnError('learn refused: secret-shaped text is never stored');
}

function getJob(db: SqliteDb, slug: string): { slug: string; mode: Mode; jtbd_id: number } | null {
  const row = db.prepare('SELECT slug, mode, jtbd_id FROM learn_job WHERE slug = ?').get(slug);
  return row ? { slug: String(row.slug), mode: row.mode as Mode, jtbd_id: Number(row.jtbd_id) } : null;
}

function requireJob(db: SqliteDb, job: string): { slug: string; mode: Mode; jtbd_id: number } {
  const found = getJob(db, slugOf(job));
  if (!found) throw new LearnError(`no job ${job}: the person creates jobs with \`trustshell learn job add\``);
  return found;
}

function requireCheck(db: SqliteDb, job: string, check: string): void {
  const row = db.prepare('SELECT job FROM learn_check WHERE id = ?').get(label('check id', check));
  if (!row || String(row.job) !== job) {
    throw new LearnError(`check ${check} is not registered on job ${job}: \`trustshell learn check add --job ${job} --id ${check} --cmd "<command>"\``);
  }
}

/** How a person's CLI text is labelled: trusted (they typed it), quarantined if it reads as injection. */
function personTaint(source: string, text: string) {
  const screen = ingest(text);
  return screen.ingest === 'clean'
    ? { provenance: 'trusted' as const, source, quarantined: false }
    : { provenance: 'untrusted' as const, source, quarantined: true, reason: `${INJECTION_PREFIX}: ${screen.excerpt}` };
}

function shown(row: MemoryRow | undefined): string {
  if (!row) return '[missing]';
  return heldAsInjection(row) ? INJECTION_WITHHELD : row.body;
}

// --- jobs ---------------------------------------------------------------------------------------

export function addJob(slug: string, mode: string, jtbd: string, env: NodeJS.ProcessEnv = process.env, now = new Date()): void {
  slugOf(slug);
  if (!(MODES as readonly string[]).includes(mode)) throw new LearnError('--mode must be delegate, cowork or learn');
  const line = jtbd.trim();
  if (!line) throw new LearnError('a job needs its one line: "When …, I want …, so I can …"');
  refuseSecret(line);
  const path = memoryDbPath(env);
  withDb(path, (db) => {
    if (getJob(db, slug)) throw new LearnError(`job ${slug} already exists`);
  });
  const row = insertMemory(path, 'learn', line, iso(now), env, personTaint('cli:learn job add', line));
  withDb(path, (db) =>
    db.prepare("INSERT INTO learn_job (slug, mode, jtbd_id, created_by, created_at) VALUES (?, ?, ?, 'person', ?)").run(slug, mode, row.id, iso(now)),
  );
}

export type JobListItem = { slug: string; mode: Mode; jtbd: string; checks: { id: string; cmd: string }[] };

export function listJobs(env: NodeJS.ProcessEnv = process.env): JobListItem[] {
  return (
    readDb(env, (db, path) => {
      const jobs = db.prepare('SELECT slug, mode, jtbd_id FROM learn_job ORDER BY slug').all();
      const checks = db.prepare('SELECT id, job, cmd FROM learn_check ORDER BY id').all();
      const bodies = new Map(readRows(path, jobs.map((j) => Number(j.jtbd_id)), env).map((r) => [r.id, r]));
      return jobs.map((j) => ({
        slug: String(j.slug),
        mode: j.mode as Mode,
        jtbd: shown(bodies.get(Number(j.jtbd_id))),
        checks: checks.filter((c) => c.job === j.slug).map((c) => ({ id: String(c.id), cmd: String(c.cmd) })),
      }));
    }) ?? []
  );
}

// --- checks: registered by the person, run by `learn check run` -----------------------------

export function addCheck(job: string, id: string, cmd: string, env: NodeJS.ProcessEnv = process.env, now = new Date()): void {
  label('check id', id);
  if (!cmd.trim()) throw new LearnError('--cmd needs the deterministic command whose exit code is the outcome');
  refuseSecret(cmd);
  writeDb(env, (db) => {
    requireJob(db, job);
    if (db.prepare('SELECT 1 FROM learn_check WHERE id = ?').get(id)) throw new LearnError(`check ${id} already exists`);
    db.prepare('INSERT INTO learn_check (id, job, cmd, created_at) VALUES (?, ?, ?, ?)').run(id, job, cmd.trim(), iso(now));
  });
}

/** Runs a registered command. Exit code only: null when it was killed or could not start. */
export type Exec = (cmd: string) => number | null;

export const execCheck: Exec = (cmd) => {
  // The child's output goes to stderr, so `learn check run` keeps one verdict line on stdout.
  const r = spawnSync(cmd, { shell: true, stdio: ['ignore', 2, 2], timeout: 15 * 60_000, windowsHide: true });
  return typeof r.status === 'number' ? r.status : null;
};

export type CheckRun = { check: string; episode: number | null; exit: number | null; outcome: Outcome | null; retired: string[] };

/**
 * Run a registered check and write its outcome on an episode whose check id was frozen at its start:
 * --episode, --turn, else the newest open episode on that job that froze this check, else a new
 * episode that froze it now. A command that did not exit (killed, timed out, could not start) writes
 * nothing: NOT_CHECKED. A fail retires every accepted lesson injected into that episode (§2.5).
 */
export function runCheck(
  id: string,
  opts: { episode?: number; turn?: string } = {},
  env: NodeJS.ProcessEnv = process.env,
  now = new Date(),
  exec: Exec = execCheck,
): CheckRun {
  function named(db: SqliteDb, checkId: string): Row {
    const ep = episodeRow(db, opts);
    if (!ep) throw new LearnError('no such episode');
    if (ep.check_id !== checkId) throw new LearnError(`episode ${ep.id} froze ${ep.check_id ?? 'no check'} at its start, not ${checkId}`);
    if (ep.check_outcome !== null) throw new LearnError(`episode ${ep.id} already has a check outcome`);
    return ep;
  }
  const check = writeDb(env, (db) => {
    const row = db.prepare('SELECT id, job, cmd FROM learn_check WHERE id = ?').get(label('check id', id));
    if (!row) throw new LearnError(`no check ${id}: \`trustshell learn check add\``);
    if (opts.episode !== undefined || opts.turn !== undefined) named(db, String(row.id)); // refuse before running anything
    return { id: String(row.id), job: String(row.job), cmd: String(row.cmd) };
  });
  const exit = exec(check.cmd);
  if (exit === null) return { check: id, episode: null, exit, outcome: null, retired: [] };
  const outcome: Outcome = exit === 0 ? 'pass' : 'fail';
  return writeDb(env, (db) => tx(db, () => {
    let ep: Row | undefined;
    if (opts.episode !== undefined || opts.turn !== undefined) {
      ep = named(db, check.id);
    } else {
      ep = db
        .prepare('SELECT * FROM learn_episode WHERE job = ? AND check_id = ? AND check_outcome IS NULL ORDER BY id DESC LIMIT 1')
        .get(check.job, check.id);
    }
    const t = iso(now);
    const episodeId = ep
      ? Number(ep.id)
      : Number(
          db
            .prepare('INSERT INTO learn_episode (job, check_id, created_at, updated_at) VALUES (?, ?, ?, ?)')
            .run(check.job, check.id, t, t).lastInsertRowid,
        );
    db.prepare('UPDATE learn_episode SET check_outcome = ?, check_at = ?, updated_at = ? WHERE id = ?').run(outcome, t, t, episodeId);
    const retired: string[] = [];
    if (outcome === 'fail') {
      const injected = JSON.parse(String(ep?.injected ?? '[]')) as number[];
      for (const lessonId of injected) {
        const reason = `retired: check ${check.id} failed on episode ${episodeId} with this lesson injected`;
        const changed = db
          .prepare("UPDATE learn_lesson SET status = 'retired', status_reason = ?, updated_at = ? WHERE id = ? AND status = 'accepted'")
          .run(reason, t, lessonId) as unknown as { changes?: number };
        if (Number(changed.changes ?? 0) > 0) retired.push(`lesson ${lessonId} ${reason}`);
      }
    }
    return { check: check.id, episode: episodeId, exit, outcome, retired };
  }));
}

// --- episodes --------------------------------------------------------------------------------

function episodeRow(db: SqliteDb, ref: { episode?: number; turn?: string }): Row | undefined {
  if (ref.episode !== undefined) return db.prepare('SELECT * FROM learn_episode WHERE id = ?').get(ref.episode);
  if (ref.turn !== undefined) return db.prepare('SELECT * FROM learn_episode WHERE turn = ?').get(label('turn', ref.turn));
  return undefined;
}

export type RecordInput = {
  job?: string;
  episode?: number;
  turn?: string;
  model?: string;
  family?: string;
  tokens?: number;
  check?: string;
  confidence?: number;
  /** The agent's own outcome. Stored as agent_outcome; no ruler reads it. */
  outcome?: Outcome;
  askSha256?: string;
};

/**
 * One episode per turn: --episode or --turn names an existing one (a second record in the same turn
 * updates it), otherwise a new one is made. An unknown job slug is stored and left out of every ruler.
 */
function upsertEpisode(db: SqliteDb, input: RecordInput, now: Date): { row: Row; created: boolean } {
  const existing = episodeRow(db, input);
  if (input.episode !== undefined && !existing) throw new LearnError(`no episode ${input.episode}`);
  if (existing) {
    if (input.job !== undefined && input.job !== existing.job) throw new LearnError(`episode ${existing.id} belongs to job ${existing.job}`);
    return { row: existing, created: false };
  }
  if (input.job === undefined) throw new LearnError('a new episode needs --job');
  const t = iso(now);
  const id = db
    .prepare('INSERT INTO learn_episode (job, turn, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(slugOf(input.job), input.turn ?? null, t, t).lastInsertRowid;
  return { row: db.prepare('SELECT * FROM learn_episode WHERE id = ?').get(id) as Row, created: true };
}

function applyRecord(db: SqliteDb, row: Row, input: RecordInput, now: Date): void {
  const set: Record<string, unknown> = {};
  if (input.check !== undefined) {
    requireCheck(db, String(row.job), input.check);
    if (row.check_id !== null && row.check_id !== input.check) {
      throw new LearnError(`episode ${row.id} froze check ${row.check_id} at its start; it cannot change`);
    }
    if (row.check_id === null && row.check_outcome !== null) throw new LearnError(`episode ${row.id} already has a check outcome`);
    set.check_id = input.check;
  }
  if (input.confidence !== undefined) {
    if (!(input.confidence >= 0 && input.confidence <= 1)) throw new LearnError('--confidence is a probability, 0 to 1');
    if (row.check_outcome !== null) throw new LearnError('confidence is stated before the check runs; this episode already has its check outcome');
    set.confidence = input.confidence;
    set.confidence_at = iso(now);
  }
  if (input.tokens !== undefined) {
    if (!Number.isInteger(input.tokens) || input.tokens < 0) throw new LearnError('--tokens is a whole number, 0 or more');
    set.tokens = input.tokens;
  }
  if (input.model !== undefined) set.model = label('model', input.model);
  if (input.family !== undefined) set.family = label('family', input.family);
  if (input.outcome !== undefined) {
    if (input.outcome !== 'pass' && input.outcome !== 'fail') throw new LearnError('--outcome is pass or fail');
    set.agent_outcome = input.outcome;
  }
  if (input.askSha256 !== undefined) {
    if (!SHA256.test(input.askSha256)) throw new LearnError('--ask-sha256 is 64 lowercase hex characters');
    set.ask_sha256 = input.askSha256;
  }
  const cols = Object.keys(set);
  if (!cols.length) return;
  db.prepare(`UPDATE learn_episode SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(
    ...cols.map((c) => set[c]),
    iso(now),
    row.id,
  );
}

/** `learn record` / MCP learn_record. Writes episode metadata and agent_outcome, never check_outcome. */
export function recordEpisode(input: RecordInput, env: NodeJS.ProcessEnv = process.env, now = new Date()): { episode: number; created: boolean } {
  if (input.turn !== undefined) label('turn', input.turn);
  return writeDb(env, (db) =>
    tx(db, () => {
      const { row, created } = upsertEpisode(db, input, now);
      applyRecord(db, row, input, now);
      return { episode: Number(row.id), created };
    }),
  );
}

/** `learn rate`: the person's accept / edit / reject. Reported; never read by rulers 1–2. */
export function rateEpisode(episode: number, rating: string, env: NodeJS.ProcessEnv = process.env, now = new Date()): void {
  if (!['accept', 'edit', 'reject'].includes(rating)) throw new LearnError('rating is accept, edit or reject');
  writeDb(env, (db) => {
    if (!episodeRow(db, { episode })) throw new LearnError(`no episode ${episode}`);
    db.prepare('UPDATE learn_episode SET rating = ?, rated_at = ?, updated_at = ? WHERE id = ?').run(rating, iso(now), iso(now), episode);
  });
}

// --- corrections → eval case → candidate lesson ------------------------------------------------

export type Correction = { eval: number; lesson: number; status: LessonStatus; reason: string; note: number | null };

/**
 * The person's correction, verbatim. FAILURE FIRST (§2.2): the eval case is written before the lesson,
 * in one transaction. The lesson body is kind `lesson`, UNTRUSTED and QUARANTINED until `learn accept`
 * (§8.3). Text that came from somewhere else (`source`: a page, another agent, a model) is held for good
 * and never accepted; so is injection-looking text. A model's paraphrase (`note`) is kept as an ordinary
 * quarantined note, never injected. A secret-shaped correction or note writes nothing.
 */
export function correct(
  input: { job: string; text: string; check?: string; episode?: number; source?: string; note?: string },
  env: NodeJS.ProcessEnv = process.env,
  now = new Date(),
): Correction {
  const text = input.text;
  if (!text.trim()) throw new LearnError('a correction needs its text, in the person\'s own words');
  refuseSecret(text, input.note);
  const path = memoryDbPath(env);
  withDb(path, (db) => {
    requireJob(db, input.job);
    if (input.check !== undefined) requireCheck(db, input.job, input.check);
    if (input.episode !== undefined && !episodeRow(db, { episode: input.episode })) throw new LearnError(`no episode ${input.episode}`);
  });
  const screen = ingest(text);
  const source = input.source === undefined ? undefined : label('source', input.source);
  const status: LessonStatus = screen.ingest !== 'clean' || source !== undefined ? 'quarantined' : 'candidate';
  const reason =
    screen.ingest !== 'clean'
      ? `${INJECTION_PREFIX}: ${screen.excerpt}`
      : source !== undefined
        ? `derived from untrusted content (${source}): never injected, never accepted`
        : 'candidate: waiting for the person to run learn accept';
  const t = iso(now);
  const body = insertMemory(path, 'lesson', text, t, env, {
    provenance: 'untrusted',
    source: source !== undefined ? `learn:${source}` : 'cli:learn correct',
    quarantined: true,
    reason,
  });
  const note = input.note?.trim() ? rememberUntrusted(input.note, { source: 'learn:paraphrase' }, env).id : null;
  return withDb(path, (db) =>
    tx(db, () => {
      const evalId = Number(
        db
          .prepare('INSERT INTO learn_eval (job, check_id, body_id, episode_id, created_at) VALUES (?, ?, ?, ?, ?)')
          .run(input.job, input.check ?? null, body.id, input.episode ?? null, t).lastInsertRowid,
      );
      const lessonId = Number(
        db
          .prepare(
            'INSERT INTO learn_lesson (eval_id, job, check_id, body_id, note_id, status, status_reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .run(evalId, input.job, input.check ?? null, body.id, note, status, reason, t, t).lastInsertRowid,
      );
      return { eval: evalId, lesson: lessonId, status, reason, note };
    }),
  );
}

function lessonRow(db: SqliteDb, id: number): Row {
  const row = db.prepare('SELECT * FROM learn_lesson WHERE id = ?').get(id);
  if (!row) throw new LearnError(`no lesson ${id}`);
  return row;
}

/**
 * The person accepts a lesson: its row is released as trusted with LESSON_ACCEPTED, and it may be
 * injected for 30 days. Accepting an accepted lesson renews the 30 days. Held, declined or retired
 * lessons are refused; write a new correction instead.
 */
export function acceptLesson(id: number, env: NodeJS.ProcessEnv = process.env, now = new Date()): { expires_at: string } {
  const path = memoryDbPath(env);
  const lesson = withDb(path, (db) => lessonRow(db, id));
  const status = lesson.status as LessonStatus;
  if (status !== 'candidate' && status !== 'accepted') {
    throw new LearnError(`lesson ${id} is ${status} (${lesson.status_reason ?? 'no reason recorded'}); it cannot be accepted`);
  }
  const [body] = readRows(path, [Number(lesson.body_id)], env);
  if (!body || heldAsInjection(body)) {
    withDb(path, (db) =>
      db.prepare("UPDATE learn_lesson SET status = 'quarantined', status_reason = ?, updated_at = ? WHERE id = ?").run(
        `${INJECTION_PREFIX}: found when the lesson was accepted`,
        iso(now),
        id,
      ),
    );
    throw new LearnError(`lesson ${id} reads as injection-looking text; it is held and cannot be accepted`);
  }
  const t = iso(now);
  if (body.quarantined) markReleased(path, body.id, LESSON_ACCEPTED, t, 'trusted');
  const expires = iso(new Date(now.getTime() + LESSON_DAYS * DAY));
  withDb(path, (db) => {
    db.prepare("UPDATE learn_lesson SET status = 'accepted', status_reason = NULL, accepted_at = ?, expires_at = ?, updated_at = ? WHERE id = ?").run(
      t,
      expires,
      t,
      id,
    );
    if (!db.prepare('SELECT 1 FROM learn_review WHERE lesson_id = ? AND result IS NULL').get(id)) {
      db.prepare('INSERT INTO learn_review (lesson_id, step, due_at, created_at) VALUES (?, 0, ?, ?)').run(id, iso(new Date(now.getTime() + LADDER_DAYS[0] * DAY)), t);
    }
  });
  return { expires_at: expires };
}

/** Decline a candidate, or revert an accepted lesson. It is never injected again. */
export function declineLesson(id: number, env: NodeJS.ProcessEnv = process.env, now = new Date()): void {
  writeDb(env, (db) => {
    const lesson = lessonRow(db, id);
    if (lesson.status !== 'candidate' && lesson.status !== 'accepted') throw new LearnError(`lesson ${id} is ${lesson.status}`);
    db.prepare("UPDATE learn_lesson SET status = 'declined', status_reason = 'declined by the person', updated_at = ? WHERE id = ?").run(iso(now), id);
  });
}

export type LessonListItem = { id: number; job: string; check: string | null; status: LessonStatus; reason: string | null; expires_at: string | null; text: string };

export function listLessons(job: string | undefined, env: NodeJS.ProcessEnv = process.env): LessonListItem[] {
  return (
    readDb(env, (db, path) => {
      const rows = job === undefined ? db.prepare('SELECT * FROM learn_lesson ORDER BY id').all() : db.prepare('SELECT * FROM learn_lesson WHERE job = ? ORDER BY id').all(job);
      const bodies = new Map(readRows(path, rows.map((r) => Number(r.body_id)), env).map((r) => [r.id, r]));
      return rows.map((r) => ({
        id: Number(r.id),
        job: String(r.job),
        check: str(r.check_id),
        status: r.status as LessonStatus,
        reason: str(r.status_reason),
        expires_at: str(r.expires_at),
        text: shown(bodies.get(Number(r.body_id))),
      }));
    }) ?? []
  );
}

// --- attempts, cloze, inject -------------------------------------------------------------------

/** The person's own attempt. The next `inject` on this job binds it to that turn's episode. */
export function addAttempt(input: { job: string; text: string; episode?: number }, env: NodeJS.ProcessEnv = process.env, now = new Date()): number {
  if (!input.text.trim()) throw new LearnError('an attempt needs its text');
  refuseSecret(input.text);
  const path = memoryDbPath(env);
  withDb(path, (db) => {
    requireJob(db, input.job);
    if (input.episode !== undefined && !episodeRow(db, { episode: input.episode })) throw new LearnError(`no episode ${input.episode}`);
  });
  const row = insertMemory(path, 'learn', input.text, iso(now), env, personTaint('cli:learn attempt', input.text));
  return withDb(path, (db) => {
    const id = Number(
      db.prepare('INSERT INTO learn_attempt (job, body_id, episode_id, created_at) VALUES (?, ?, ?, ?)').run(input.job, row.id, input.episode ?? null, iso(now))
        .lastInsertRowid,
    );
    if (input.episode !== undefined) db.prepare('UPDATE learn_episode SET attempt_id = ? WHERE id = ?').run(id, input.episode);
    return id;
  });
}

/**
 * A recall item cut by code from the person's own words: the longest word (4+ letters) is blanked,
 * with up to six words either side. Never model text. Null when no word is long enough.
 */
export function cloze(text: string): string | null {
  const words = text.split(/\s+/).filter(Boolean);
  let best = -1;
  let bestLen = 3;
  words.forEach((w, i) => {
    const core = w.replace(/[^\p{L}\p{N}_-]/gu, '').length;
    if (core > bestLen) {
      best = i;
      bestLen = core;
    }
  });
  if (best < 0) return null;
  const from = Math.max(0, best - 6);
  const to = Math.min(words.length, best + 7);
  const span = words.slice(from, to).map((w, i) => (from + i === best ? w.replace(/[\p{L}\p{N}_-]+/u, '_____') : w));
  return `${from > 0 ? '… ' : ''}${span.join(' ')}${to < words.length ? ' …' : ''}`;
}

export type Injection = { text: string; episode: number; lessons: number[]; loop_tokens: number };

/**
 * What goes into the model's context for one turn of a job, and the episode that records it.
 *   - Only this job's lessons that the person accepted, unexpired, verbatim, through `injectable`.
 *   - At most 5 lessons and 400 tokens in all; a lesson that does not fit whole is left out, never cut.
 *   - learn mode: with no attempt by the person on this episode, the scaffold only, no lesson bodies
 *     (§8.2). After `learn attempt`, the lessons and one cloze from that attempt.
 *   - cowork mode: the prediction-first line, then the lessons.
 * Missing memory file or unknown job: null, nothing written. The tokens printed are added to the
 * episode's loop_tokens, so the loop's own cost is never left out of a ruler.
 */
export function inject(
  opts: { job: string; turn?: string; check?: string; askSha256?: string },
  env: NodeJS.ProcessEnv = process.env,
  now = new Date(),
): Injection | null {
  if (!SLUG.test(opts.job)) return null;
  if (opts.turn !== undefined) label('turn', opts.turn);
  const plan = readDb(env, (db, path) => {
    const job = getJob(db, opts.job);
    if (!job) return null;
    return tx(db, () => {
    const { row } = upsertEpisode(db, { job: job.slug, turn: opts.turn }, now);
    applyRecord(db, row, { check: opts.check, askSha256: opts.askSha256 }, now);
    let attemptId = num(row.attempt_id);
    if (attemptId === null) {
      const open = db.prepare('SELECT id FROM learn_attempt WHERE job = ? AND episode_id IS NULL ORDER BY id DESC LIMIT 1').get(job.slug);
      if (open) {
        attemptId = Number(open.id);
        db.prepare('UPDATE learn_attempt SET episode_id = ? WHERE id = ?').run(row.id, attemptId);
        db.prepare('UPDATE learn_episode SET attempt_id = ? WHERE id = ?').run(attemptId, row.id);
      }
    }
    const attempt = attemptId === null ? undefined : db.prepare('SELECT body_id FROM learn_attempt WHERE id = ?').get(attemptId);
    const lessons = db
      .prepare("SELECT id, body_id FROM learn_lesson WHERE job = ? AND status = 'accepted' AND expires_at > ? ORDER BY accepted_at DESC, id DESC")
      .all(job.slug, iso(now))
      .map((l) => ({ id: Number(l.id), body_id: Number(l.body_id) }));
    return { path, job, episode: Number(row.id), prior: JSON.parse(String(row.injected)) as number[], attemptBody: num(attempt?.body_id), lessons };
    });
  });
  if (!plan) return null;

  const withheld = plan.job.mode === 'learn' && plan.attemptBody === null;
  const fixed: string[] = [];
  if (SCAFFOLD[plan.job.mode]) fixed.push(SCAFFOLD[plan.job.mode]);
  if (withheld) {
    fixed.push(`No attempt from the person on this turn yet, so no lessons are shown. They record one with: trustshell learn attempt --job ${plan.job.slug} "<attempt>"`);
  }
  const bodies = new Map(
    readRows(plan.path, [...plan.lessons.map((l) => l.body_id), ...(plan.attemptBody === null ? [] : [plan.attemptBody])], env).map((r) => [r.id, r]),
  );
  let recall: string | null = null;
  if (plan.attemptBody !== null && plan.job.mode === 'learn') {
    const attempt = bodies.get(plan.attemptBody);
    const blank = attempt && injectable(attempt) ? cloze(attempt.body) : null;
    if (blank) recall = `Recall question for the end, cut from the person's own attempt (fill the blank): ${blank}`;
  }
  const header = `[trustshell learn] job ${plan.job.slug} · ${plan.job.mode} · episode ${plan.episode}`;
  const used: number[] = [];
  const lines: string[] = [];
  if (!withheld) {
    const budget = MAX_LOOP_TOKENS - estimateTokens([header, ...fixed, recall ?? '', "Lessons, in the person's own words:"].join('\n'));
    for (const l of plan.lessons) {
      if (used.length >= MAX_LESSONS) break;
      const row = bodies.get(l.body_id);
      if (!row || !injectable(row)) continue;
      const line = `- ${row.body}`;
      if (estimateTokens([...lines, line].join('\n')) > budget) continue;
      lines.push(line);
      used.push(l.id);
    }
  }
  const parts = [...fixed];
  if (lines.length) parts.push("Lessons, in the person's own words:", ...lines);
  if (recall) parts.push(recall);
  const text = parts.length ? [header, ...parts].join('\n') : '';
  const tokens = estimateTokens(text);
  writeDb(env, (db) => {
    const injected = [...new Set([...plan.prior, ...used])];
    db.prepare('UPDATE learn_episode SET loop_tokens = loop_tokens + ?, injected = ?, updated_at = ? WHERE id = ?').run(
      tokens,
      JSON.stringify(injected),
      iso(now),
      plan.episode,
    );
  });
  return { text, episode: plan.episode, lessons: used, loop_tokens: tokens };
}

// --- unaided probes (human) --------------------------------------------------------------------

/** The person writes the criterion BEFORE the attempt. Learn jobs only; scored by a registered check. */
export function addProbe(input: { job: string; check: string; criterion: string }, env: NodeJS.ProcessEnv = process.env, now = new Date()): number {
  if (!input.criterion.trim()) throw new LearnError('a probe needs its criterion, written before the attempt');
  refuseSecret(input.criterion);
  const path = memoryDbPath(env);
  withDb(path, (db) => {
    const job = requireJob(db, input.job);
    if (job.mode !== 'learn') throw new LearnError(`job ${job.slug} is in ${job.mode} mode; unaided probes are for learn jobs`);
    requireCheck(db, job.slug, input.check);
  });
  const row = insertMemory(path, 'learn', input.criterion, iso(now), env, personTaint('cli:learn probe add', input.criterion));
  return withDb(path, (db) =>
    Number(
      db.prepare('INSERT INTO learn_probe (job, check_id, criterion_id, created_at) VALUES (?, ?, ?, ?)').run(input.job, input.check, row.id, iso(now))
        .lastInsertRowid,
    ),
  );
}

/** Score one unaided attempt on a probe: 1 when its check exits 0, 0 otherwise. Prints no lesson. */
export function runProbe(id: number, env: NodeJS.ProcessEnv = process.env, now = new Date(), exec: Exec = execCheck): { probe: number; check: string; exit: number | null; score: number | null } {
  const probe = writeDb(env, (db) => {
    const row = db.prepare('SELECT p.id, p.check_id, c.cmd FROM learn_probe p JOIN learn_check c ON c.id = p.check_id WHERE p.id = ?').get(id);
    if (!row) throw new LearnError(`no probe ${id}`);
    return { check: String(row.check_id), cmd: String(row.cmd) };
  });
  const exit = exec(probe.cmd);
  if (exit === null) return { probe: id, check: probe.check, exit, score: null };
  const score = exit === 0 ? 1 : 0;
  writeDb(env, (db) =>
    db.prepare("INSERT INTO learn_probe_score (probe_id, aided, score, by, created_at) VALUES (?, 0, ?, 'check', ?)").run(id, score, iso(now)),
  );
  return { probe: id, check: probe.check, exit, score };
}

// --- spaced review (human) ---------------------------------------------------------------------

export type DueReview = { id: number; lesson: number; job: string; days: number; cue: string };

/** Reviews due now, for lessons still accepted. The cue is a cloze of the lesson, never its full text. */
export function dueReviews(env: NodeJS.ProcessEnv = process.env, now = new Date()): DueReview[] {
  return (
    readDb(env, (db, path) => {
      const rows = db
        .prepare(
          "SELECT r.id, r.lesson_id, r.step, l.job, l.body_id FROM learn_review r JOIN learn_lesson l ON l.id = r.lesson_id WHERE r.result IS NULL AND r.due_at <= ? AND l.status = 'accepted' ORDER BY r.due_at",
        )
        .all(iso(now));
      const bodies = new Map(readRows(path, rows.map((r) => Number(r.body_id)), env).map((r) => [r.id, r]));
      return rows.map((r) => {
        const body = bodies.get(Number(r.body_id));
        const cue = body && !heldAsInjection(body) ? (cloze(body.body) ?? '(too short for a blank: recall it whole)') : INJECTION_WITHHELD;
        return { id: Number(r.id), lesson: Number(r.lesson_id), job: String(r.job), days: LADDER_DAYS[Number(r.step)] as number, cue };
      });
    }) ?? []
  );
}

/** Record a review. A recall moves one rung up the ladder; a miss resets to the 1-day rung (§8.2). */
export function answerReview(id: number, recalled: 'yes' | 'no', env: NodeJS.ProcessEnv = process.env, now = new Date()): { next_due: string; days: number } {
  return writeDb(env, (db) => {
    const row = db.prepare('SELECT lesson_id, step, result FROM learn_review WHERE id = ?').get(id);
    if (!row) throw new LearnError(`no review ${id}`);
    if (row.result !== null) throw new LearnError(`review ${id} is already answered`);
    const step = recalled === 'yes' ? Math.min(Number(row.step) + 1, LADDER_DAYS.length - 1) : 0;
    const days = LADDER_DAYS[step] as number;
    const next = iso(new Date(now.getTime() + days * DAY));
    db.prepare('UPDATE learn_review SET result = ?, answered_at = ? WHERE id = ?').run(recalled, iso(now), id);
    db.prepare('INSERT INTO learn_review (lesson_id, step, due_at, created_at) VALUES (?, ?, ?, ?)').run(row.lesson_id, step, next, iso(now));
    return { next_due: next, days };
  });
}

// --- everything the report reads ---------------------------------------------------------------

export type Snapshot = {
  jobs: { slug: string; mode: Mode }[];
  checks: { id: string; job: string; created_at: string }[];
  episodes: {
    id: number; job: string; family: string | null; tokens: number | null; loop_tokens: number; check_id: string | null;
    confidence: number | null; confidence_at: string | null; agent_outcome: Outcome | null; check_outcome: Outcome | null;
    check_at: string | null; rating: string | null; injected: number[]; created_at: string;
  }[];
  evals: { id: number; job: string; check_id: string | null; body_id: number }[];
  lessons: { id: number; job: string; check_id: string | null; status: LessonStatus; accepted_at: string | null }[];
  probes: { id: number; job: string; check_id: string; scores: { score: number; created_at: string }[] }[];
  reviews: { result: 'yes' | 'no'; answered_at: string }[];
};

/** Every learn row the rulers need, metadata only. Null when there is no memory file. */
export function snapshot(env: NodeJS.ProcessEnv = process.env): Snapshot | null {
  return readDb(env, (db) => ({
    jobs: db.prepare('SELECT slug, mode FROM learn_job ORDER BY slug').all().map((r) => ({ slug: String(r.slug), mode: r.mode as Mode })),
    checks: db.prepare('SELECT id, job, created_at FROM learn_check ORDER BY id').all().map((r) => ({ id: String(r.id), job: String(r.job), created_at: String(r.created_at) })),
    episodes: db
      .prepare('SELECT * FROM learn_episode ORDER BY id')
      .all()
      .map((r) => ({
        id: Number(r.id),
        job: String(r.job),
        family: str(r.family),
        tokens: num(r.tokens),
        loop_tokens: Number(r.loop_tokens),
        check_id: str(r.check_id),
        confidence: num(r.confidence),
        confidence_at: str(r.confidence_at),
        agent_outcome: str(r.agent_outcome) as Outcome | null,
        check_outcome: str(r.check_outcome) as Outcome | null,
        check_at: str(r.check_at),
        rating: str(r.rating),
        injected: JSON.parse(String(r.injected)) as number[],
        created_at: String(r.created_at),
      })),
    evals: db.prepare('SELECT id, job, check_id, body_id FROM learn_eval ORDER BY id').all().map((r) => ({ id: Number(r.id), job: String(r.job), check_id: str(r.check_id), body_id: Number(r.body_id) })),
    lessons: db
      .prepare('SELECT id, job, check_id, status, accepted_at FROM learn_lesson ORDER BY id')
      .all()
      .map((r) => ({ id: Number(r.id), job: String(r.job), check_id: str(r.check_id), status: r.status as LessonStatus, accepted_at: str(r.accepted_at) })),
    probes: db
      .prepare('SELECT id, job, check_id FROM learn_probe ORDER BY id')
      .all()
      .map((p) => ({
        id: Number(p.id),
        job: String(p.job),
        check_id: String(p.check_id),
        scores: db
          .prepare('SELECT score, created_at FROM learn_probe_score WHERE probe_id = ? AND aided = 0 ORDER BY id')
          .all(p.id)
          .map((s) => ({ score: Number(s.score), created_at: String(s.created_at) })),
      })),
    reviews: db
      .prepare('SELECT result, answered_at FROM learn_review WHERE result IS NOT NULL ORDER BY answered_at, id')
      .all()
      .map((r) => ({ result: r.result as 'yes' | 'no', answered_at: String(r.answered_at) })),
  }));
}
