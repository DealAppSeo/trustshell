"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.execCheck = exports.RECONCILED = exports.SCAFFOLD = exports.LearnError = exports.LADDER_DAYS = exports.LESSON_DAYS = exports.MAX_LOOP_TOKENS = exports.MAX_LESSONS = exports.MODES = void 0;
exports.estimateTokens = estimateTokens;
exports.sha256 = sha256;
exports.addJob = addJob;
exports.listJobs = listJobs;
exports.addCheck = addCheck;
exports.runCheck = runCheck;
exports.recordEpisode = recordEpisode;
exports.rateEpisode = rateEpisode;
exports.correct = correct;
exports.acceptLesson = acceptLesson;
exports.declineLesson = declineLesson;
exports.listLessons = listLessons;
exports.addAttempt = addAttempt;
exports.cloze = cloze;
exports.inject = inject;
exports.addProbe = addProbe;
exports.runProbe = runProbe;
exports.dueReviews = dueReviews;
exports.answerReview = answerReview;
exports.snapshot = snapshot;
/**
 * learn — the learning loop v1, local. Spec: living-docs 03_specs/LEARNING_LOOP_SPEC_v1_2026-10-16.md
 * (§2 non-negotiables, §8 the round-2 changes that override §3–§7).
 *
 * WHERE THINGS LIVE. One sqlite file: the local memory (src/memory/local-store.ts).
 *   - TEXT the person wrote (a correction, a job line, an attempt, a probe criterion) goes through
 *     insertRow (insertMemory on the learn connection, in the same transaction as its learn_* row) with an
 *     explicit taint label, so it is sealed when TRUSTSHELL_MEMORY_ENCRYPT is on
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
const node_crypto_1 = require("node:crypto");
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const ingest_1 = require("../lib/ingest");
const remember_1 = require("../cli/remember");
const quarantine_1 = require("../memory/quarantine");
const local_store_1 = require("../memory/local-store");
exports.MODES = ['delegate', 'cowork', 'learn'];
exports.MAX_LESSONS = 5;
exports.MAX_LOOP_TOKENS = 400;
exports.LESSON_DAYS = 30;
/** Spaced review ladder, in days. A recall moves one step up; a miss goes back to the first step. */
exports.LADDER_DAYS = [1, 3, 7, 14, 30];
const DAY = 86400000;
const SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;
/** Model ids, families, check ids and turn keys: printed in reports, so a plain charset only. */
const LABEL = /^[A-Za-z0-9._:/@+-]{1,120}$/;
const SHA256 = /^[0-9a-f]{64}$/;
/** A refused or malformed request. Nothing was written. The CLI exits 2. */
class LearnError extends Error {
}
exports.LearnError = LearnError;
exports.SCAFFOLD = {
    delegate: '',
    cowork: "Co-work mode, the person's choice for this job: ask for the person's prediction before you reveal your answer.",
    learn: "Learn mode, the person's choice for this job: ask for the person's own attempt first, give hints rather than the answer, and end with one recall question from today's work.",
};
/**
 * Tokens, estimated as characters / 4.
 * ponytail: a fixed ratio, not a tokenizer; good enough for a 400-token cap. Use the model's own
 * tokenizer if a cap ever has to be exact.
 */
function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
function sha256(text) {
    return (0, node_crypto_1.createHash)('sha256').update(text, 'utf8').digest('hex');
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
/** Why reconcile put a lesson back in quarantine: its body was released but the lesson is not accepted. */
exports.RECONCILED = 'learn: released body of a lesson that is not accepted, put back in quarantine';
function withDb(path, fn) {
    const db = (0, local_store_1.openMemoryDb)(path);
    try {
        for (const sql of SCHEMA)
            db.exec(sql);
        // Every write below keeps a lesson's body and its status in one transaction. This also repairs a
        // file written otherwise (an older build, a crash between two connections): a released body whose
        // lesson is not accepted goes back to quarantine.
        db.prepare("UPDATE memory SET quarantined = 1, quarantine_reason = ? WHERE kind = 'lesson' AND quarantined = 0 AND id IN (SELECT body_id FROM learn_lesson WHERE status != 'accepted')").run(exports.RECONCILED);
        return fn(db);
    }
    finally {
        db.close();
    }
}
/** Readers: a missing memory file is a no-op (null), never a crash, and is never created. */
function readDb(env, fn) {
    const path = (0, local_store_1.memoryDbPath)(env);
    if (!(0, node_fs_1.existsSync)(path))
        return null;
    return withDb(path, (db) => fn(db, path));
}
/** All or nothing: a refused request leaves no half-written episode behind. */
function tx(db, fn) {
    db.exec('BEGIN IMMEDIATE');
    try {
        const out = fn();
        db.exec('COMMIT');
        return out;
    }
    catch (err) {
        db.exec('ROLLBACK');
        throw err;
    }
}
function writeDb(env, fn) {
    const path = (0, local_store_1.memoryDbPath)(env);
    return withDb(path, (db) => fn(db, path));
}
const num = (v) => (v === null || v === undefined ? null : Number(v));
const str = (v) => (v === null || v === undefined ? null : String(v));
const iso = (d) => d.toISOString();
function slugOf(job) {
    if (!SLUG.test(job))
        throw new LearnError(`job slug must be lowercase letters, digits and dashes (got ${JSON.stringify(job).slice(0, 60)})`);
    return job;
}
function label(what, v) {
    if (!LABEL.test(v))
        throw new LearnError(`${what} must be 1-120 characters of letters, digits and . _ : / @ + -`);
    return v;
}
/** Refuse secret-shaped text before anything is written (the same detector as `remember`). */
function refuseSecret(...texts) {
    if (texts.some((t) => t !== undefined && (0, remember_1.refusedValue)(t)))
        throw new LearnError('learn refused: secret-shaped text is never stored');
}
function getJob(db, slug) {
    const row = db.prepare('SELECT slug, mode, jtbd_id FROM learn_job WHERE slug = ?').get(slug);
    return row ? { slug: String(row.slug), mode: row.mode, jtbd_id: Number(row.jtbd_id) } : null;
}
function requireJob(db, job) {
    const found = getJob(db, slugOf(job));
    if (!found)
        throw new LearnError(`no job ${job}: the person creates jobs with \`trustshell learn job add\``);
    return found;
}
function requireCheck(db, job, check) {
    const row = db.prepare('SELECT job FROM learn_check WHERE id = ?').get(label('check id', check));
    if (!row || String(row.job) !== job) {
        throw new LearnError(`check ${check} is not registered on job ${job}: \`trustshell learn check add --job ${job} --id ${check} --cmd "<command>"\``);
    }
}
/** How a person's CLI text is labelled: trusted (they typed it), quarantined if it reads as injection. */
function personTaint(source, text) {
    const screen = (0, ingest_1.ingest)(text);
    return screen.ingest === 'clean'
        ? { provenance: 'trusted', source, quarantined: false }
        : { provenance: 'untrusted', source, quarantined: true, reason: `${local_store_1.INJECTION_PREFIX}: ${screen.excerpt}` };
}
function shown(row) {
    if (!row)
        return '[missing]';
    return (0, local_store_1.heldAsInjection)(row) ? local_store_1.INJECTION_WITHHELD : row.body;
}
// --- jobs ---------------------------------------------------------------------------------------
function addJob(slug, mode, jtbd, env = process.env, now = new Date()) {
    slugOf(slug);
    if (!exports.MODES.includes(mode))
        throw new LearnError('--mode must be delegate, cowork or learn');
    const line = jtbd.trim();
    if (!line)
        throw new LearnError('a job needs its one line: "When …, I want …, so I can …"');
    refuseSecret(line);
    writeDb(env, (db) => tx(db, () => {
        if (getJob(db, slug))
            throw new LearnError(`job ${slug} already exists`);
        const row = (0, local_store_1.insertRow)(db, 'learn', line, iso(now), env, personTaint('cli:learn job add', line));
        db.prepare("INSERT INTO learn_job (slug, mode, jtbd_id, created_by, created_at) VALUES (?, ?, ?, 'person', ?)").run(slug, mode, row.id, iso(now));
    }));
}
function listJobs(env = process.env) {
    return (readDb(env, (db, path) => {
        const jobs = db.prepare('SELECT slug, mode, jtbd_id FROM learn_job ORDER BY slug').all();
        const checks = db.prepare('SELECT id, job, cmd FROM learn_check ORDER BY id').all();
        const bodies = new Map((0, local_store_1.readRows)(path, jobs.map((j) => Number(j.jtbd_id)), env).map((r) => [r.id, r]));
        return jobs.map((j) => ({
            slug: String(j.slug),
            mode: j.mode,
            jtbd: shown(bodies.get(Number(j.jtbd_id))),
            checks: checks.filter((c) => c.job === j.slug).map((c) => ({ id: String(c.id), cmd: String(c.cmd) })),
        }));
    }) ?? []);
}
// --- checks: registered by the person, run by `learn check run` -----------------------------
function addCheck(job, id, cmd, env = process.env, now = new Date()) {
    label('check id', id);
    if (!cmd.trim())
        throw new LearnError('--cmd needs the deterministic command whose exit code is the outcome');
    refuseSecret(cmd);
    writeDb(env, (db) => {
        requireJob(db, job);
        if (db.prepare('SELECT 1 FROM learn_check WHERE id = ?').get(id))
            throw new LearnError(`check ${id} already exists`);
        db.prepare('INSERT INTO learn_check (id, job, cmd, created_at) VALUES (?, ?, ?, ?)').run(id, job, cmd.trim(), iso(now));
    });
}
const execCheck = (cmd) => {
    // The child's output goes to stderr, so `learn check run` keeps one verdict line on stdout.
    const r = (0, node_child_process_1.spawnSync)(cmd, { shell: true, stdio: ['ignore', 2, 2], timeout: 15 * 60000, windowsHide: true });
    return typeof r.status === 'number' ? r.status : null;
};
exports.execCheck = execCheck;
/**
 * Run a registered check and write its outcome on an episode whose check id was frozen at its start:
 * --episode, --turn, else the newest open episode on that job that froze this check, else a new
 * episode that froze it now. A command that did not exit (killed, timed out, could not start) writes
 * nothing: NOT_CHECKED. A fail retires every accepted lesson injected into that episode (§2.5).
 */
function runCheck(id, opts = {}, env = process.env, now = new Date(), exec = exports.execCheck) {
    function named(db, checkId) {
        const ep = episodeRow(db, opts);
        if (!ep)
            throw new LearnError('no such episode');
        if (ep.check_id !== checkId)
            throw new LearnError(`episode ${ep.id} froze ${ep.check_id ?? 'no check'} at its start, not ${checkId}`);
        if (ep.check_outcome !== null)
            throw new LearnError(`episode ${ep.id} already has a check outcome`);
        return ep;
    }
    const check = writeDb(env, (db) => {
        const row = db.prepare('SELECT id, job, cmd FROM learn_check WHERE id = ?').get(label('check id', id));
        if (!row)
            throw new LearnError(`no check ${id}: \`trustshell learn check add\``);
        if (opts.episode !== undefined || opts.turn !== undefined)
            named(db, String(row.id)); // refuse before running anything
        return { id: String(row.id), job: String(row.job), cmd: String(row.cmd) };
    });
    const exit = exec(check.cmd);
    if (exit === null)
        return { check: id, episode: null, exit, outcome: null, retired: [] };
    const outcome = exit === 0 ? 'pass' : 'fail';
    return writeDb(env, (db) => tx(db, () => {
        let ep;
        if (opts.episode !== undefined || opts.turn !== undefined) {
            ep = named(db, check.id);
        }
        else {
            ep = db
                .prepare('SELECT * FROM learn_episode WHERE job = ? AND check_id = ? AND check_outcome IS NULL ORDER BY id DESC LIMIT 1')
                .get(check.job, check.id);
        }
        const t = iso(now);
        const episodeId = ep
            ? Number(ep.id)
            : Number(db
                .prepare('INSERT INTO learn_episode (job, check_id, created_at, updated_at) VALUES (?, ?, ?, ?)')
                .run(check.job, check.id, t, t).lastInsertRowid);
        db.prepare('UPDATE learn_episode SET check_outcome = ?, check_at = ?, updated_at = ? WHERE id = ?').run(outcome, t, t, episodeId);
        const retired = [];
        if (outcome === 'fail') {
            // Only the lessons this failure is evidence against: scoped to this check, or job-wide (no
            // check). A lesson scoped to another check stays accepted. Its body goes back to quarantine.
            const injected = JSON.parse(String(ep?.injected ?? '[]'));
            for (const lessonId of injected) {
                const lesson = db.prepare('SELECT body_id, check_id FROM learn_lesson WHERE id = ? AND status = ?').get(lessonId, 'accepted');
                if (!lesson || (lesson.check_id !== null && lesson.check_id !== check.id))
                    continue;
                const reason = `retired: check ${check.id} failed on episode ${episodeId} with this lesson injected`;
                db.prepare("UPDATE learn_lesson SET status = 'retired', status_reason = ?, updated_at = ? WHERE id = ?").run(reason, t, lessonId);
                (0, local_store_1.requarantineRow)(db, Number(lesson.body_id), `learn: ${reason}`);
                retired.push(`lesson ${lessonId} ${reason}`);
            }
        }
        return { check: check.id, episode: episodeId, exit, outcome, retired };
    }));
}
// --- episodes --------------------------------------------------------------------------------
function episodeRow(db, ref) {
    if (ref.episode !== undefined)
        return db.prepare('SELECT * FROM learn_episode WHERE id = ?').get(ref.episode);
    if (ref.turn !== undefined)
        return db.prepare('SELECT * FROM learn_episode WHERE turn = ?').get(label('turn', ref.turn));
    return undefined;
}
/**
 * One episode per turn: --episode or --turn names an existing one (a second record in the same turn
 * updates it), otherwise a new one is made. An unknown job slug is stored and left out of every ruler.
 */
function upsertEpisode(db, input, now) {
    const existing = episodeRow(db, input);
    if (input.episode !== undefined && !existing)
        throw new LearnError(`no episode ${input.episode}`);
    if (existing) {
        if (input.job !== undefined && input.job !== existing.job)
            throw new LearnError(`episode ${existing.id} belongs to job ${existing.job}`);
        return { row: existing, created: false };
    }
    if (input.job === undefined)
        throw new LearnError('a new episode needs --job');
    const t = iso(now);
    const id = db
        .prepare('INSERT INTO learn_episode (job, turn, created_at, updated_at) VALUES (?, ?, ?, ?)')
        .run(slugOf(input.job), input.turn ?? null, t, t).lastInsertRowid;
    return { row: db.prepare('SELECT * FROM learn_episode WHERE id = ?').get(id), created: true };
}
function applyRecord(db, row, input, now) {
    const set = {};
    if (input.check !== undefined) {
        requireCheck(db, String(row.job), input.check);
        if (row.check_id !== null && row.check_id !== input.check) {
            throw new LearnError(`episode ${row.id} froze check ${row.check_id} at its start; it cannot change`);
        }
        if (row.check_id === null && row.check_outcome !== null)
            throw new LearnError(`episode ${row.id} already has a check outcome`);
        set.check_id = input.check;
    }
    if (input.confidence !== undefined) {
        if (!(input.confidence >= 0 && input.confidence <= 1))
            throw new LearnError('--confidence is a probability, 0 to 1');
        if (row.check_outcome !== null)
            throw new LearnError('confidence is stated before the check runs; this episode already has its check outcome');
        set.confidence = input.confidence;
        set.confidence_at = iso(now);
    }
    if (input.tokens !== undefined) {
        if (!Number.isInteger(input.tokens) || input.tokens < 0)
            throw new LearnError('--tokens is a whole number, 0 or more');
        set.tokens = input.tokens;
    }
    if (input.model !== undefined)
        set.model = label('model', input.model);
    if (input.family !== undefined)
        set.family = label('family', input.family);
    if (input.outcome !== undefined) {
        if (input.outcome !== 'pass' && input.outcome !== 'fail')
            throw new LearnError('--outcome is pass or fail');
        set.agent_outcome = input.outcome;
    }
    if (input.askSha256 !== undefined) {
        if (!SHA256.test(input.askSha256))
            throw new LearnError('--ask-sha256 is 64 lowercase hex characters');
        set.ask_sha256 = input.askSha256;
    }
    const cols = Object.keys(set);
    if (!cols.length)
        return;
    db.prepare(`UPDATE learn_episode SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(...cols.map((c) => set[c]), iso(now), row.id);
}
/** `learn record` / MCP learn_record. Writes episode metadata and agent_outcome, never check_outcome. */
function recordEpisode(input, env = process.env, now = new Date()) {
    if (input.turn !== undefined)
        label('turn', input.turn);
    return writeDb(env, (db) => tx(db, () => {
        const { row, created } = upsertEpisode(db, input, now);
        applyRecord(db, row, input, now);
        return { episode: Number(row.id), created };
    }));
}
/** `learn rate`: the person's accept / edit / reject. Reported; never read by rulers 1–2. */
function rateEpisode(episode, rating, env = process.env, now = new Date()) {
    if (!['accept', 'edit', 'reject'].includes(rating))
        throw new LearnError('rating is accept, edit or reject');
    writeDb(env, (db) => {
        if (!episodeRow(db, { episode }))
            throw new LearnError(`no episode ${episode}`);
        db.prepare('UPDATE learn_episode SET rating = ?, rated_at = ?, updated_at = ? WHERE id = ?').run(rating, iso(now), iso(now), episode);
    });
}
/**
 * The person's correction, verbatim. FAILURE FIRST (§2.2): the eval case is written before the lesson.
 * The body row, the eval case and the lesson are ONE transaction on one connection. The lesson body is
 * kind `lesson`, UNTRUSTED and QUARANTINED until `learn accept` (§8.3). `derivedFrom` marks text
 * that is not the person's (held for good, never accepted); so is injection-looking text. `credit`
 * only records who prompted it. A secret-shaped correction or note writes nothing.
 */
function correct(input, env = process.env, now = new Date()) {
    const text = input.text;
    if (!text.trim())
        throw new LearnError("a correction needs its text, in the person's own words");
    refuseSecret(text, input.note);
    const derived = input.derivedFrom === undefined ? undefined : label('--derived-from-untrusted', input.derivedFrom);
    const credit = input.credit === undefined ? undefined : label('--credit', input.credit);
    const screen = (0, ingest_1.ingest)(text);
    const status = screen.ingest !== 'clean' || derived !== undefined ? 'quarantined' : 'candidate';
    const reason = screen.ingest !== 'clean'
        ? `${local_store_1.INJECTION_PREFIX}: ${screen.excerpt}`
        : derived !== undefined
            ? `derived from untrusted content (${derived}): never injected, never accepted`
            : 'candidate: waiting for the person to run learn accept';
    const source = derived !== undefined ? `learn:derived-from-untrusted:${derived}` : credit !== undefined ? `cli:learn correct (credit: ${credit})` : 'cli:learn correct';
    const t = iso(now);
    return writeDb(env, (db) => tx(db, () => {
        requireJob(db, input.job);
        if (input.check !== undefined)
            requireCheck(db, input.job, input.check);
        if (input.episode !== undefined && !episodeRow(db, { episode: input.episode }))
            throw new LearnError(`no episode ${input.episode}`);
        const body = (0, local_store_1.insertRow)(db, 'lesson', text, t, env, { provenance: 'untrusted', source, quarantined: true, reason });
        let note = null;
        if (input.note?.trim()) {
            const noteScreen = (0, ingest_1.ingest)(input.note);
            note = (0, local_store_1.insertRow)(db, 'note', input.note, t, env, {
                provenance: 'untrusted',
                source: 'learn:paraphrase',
                quarantined: true,
                reason: noteScreen.ingest === 'clean' ? quarantine_1.UNCHECKED_REASON : `${local_store_1.INJECTION_PREFIX}: ${noteScreen.excerpt}`,
            }).id;
        }
        const evalId = Number(db
            .prepare('INSERT INTO learn_eval (job, check_id, body_id, episode_id, created_at) VALUES (?, ?, ?, ?, ?)')
            .run(input.job, input.check ?? null, body.id, input.episode ?? null, t).lastInsertRowid);
        const lessonId = Number(db
            .prepare('INSERT INTO learn_lesson (eval_id, job, check_id, body_id, note_id, status, status_reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .run(evalId, input.job, input.check ?? null, body.id, note, status, reason, t, t).lastInsertRowid);
        return { eval: evalId, lesson: lessonId, status, reason, note };
    }));
}
function lessonRow(db, id) {
    const row = db.prepare('SELECT * FROM learn_lesson WHERE id = ?').get(id);
    if (!row)
        throw new LearnError(`no lesson ${id}`);
    return row;
}
/**
 * The person accepts a lesson: its body is released as trusted with LESSON_ACCEPTED and the lesson may be
 * injected for 30 days, in one transaction. Accepting an accepted lesson renews the 30 days. A RETIRED
 * lesson can be re-accepted, only this way: the retirement receipt is returned first and a re-accept
 * receipt is recorded. Held (quarantined) and declined lessons are refused. Nothing re-accepts by itself.
 */
function acceptLesson(id, env = process.env, now = new Date()) {
    const path = (0, local_store_1.memoryDbPath)(env);
    const bodyId = withDb(path, (db) => Number(lessonRow(db, id).body_id));
    const [body] = (0, local_store_1.readRows)(path, [bodyId], env);
    const t = iso(now);
    const expires = iso(new Date(now.getTime() + exports.LESSON_DAYS * DAY));
    return withDb(path, (db) => {
        const held = tx(db, () => {
            const lesson = lessonRow(db, id);
            const status = lesson.status;
            if (status !== 'candidate' && status !== 'accepted' && status !== 'retired') {
                throw new LearnError(`lesson ${id} is ${status} (${lesson.status_reason ?? 'no reason recorded'}); it cannot be accepted`);
            }
            if (!body || (0, local_store_1.heldAsInjection)(body)) {
                db.prepare("UPDATE learn_lesson SET status = 'quarantined', status_reason = ?, updated_at = ? WHERE id = ?").run(`${local_store_1.INJECTION_PREFIX}: found when the lesson was accepted`, t, id);
                return true;
            }
            const retired = status === 'retired' ? String(lesson.status_reason ?? 'retired') : null;
            const receipt = retired === null ? null : `re-accepted by the person at ${t}; before that: ${retired}`;
            (0, local_store_1.releaseRow)(db, bodyId, local_store_1.LESSON_ACCEPTED, t, 'trusted');
            db.prepare("UPDATE learn_lesson SET status = 'accepted', status_reason = ?, accepted_at = ?, expires_at = ?, updated_at = ? WHERE id = ?").run(receipt, t, expires, t, id);
            if (!db.prepare('SELECT 1 FROM learn_review WHERE lesson_id = ? AND result IS NULL').get(id)) {
                db.prepare('INSERT INTO learn_review (lesson_id, step, due_at, created_at) VALUES (?, 0, ?, ?)').run(id, iso(new Date(now.getTime() + exports.LADDER_DAYS[0] * DAY)), t);
            }
            return { expires_at: expires, retired_receipt: retired, reaccept_receipt: receipt };
        });
        if (held === true)
            throw new LearnError(`lesson ${id} reads as injection-looking text; it is held and cannot be accepted`);
        return held;
    });
}
/** Decline a candidate, or revert an accepted lesson: its body goes back to quarantine, in one transaction. */
function declineLesson(id, env = process.env, now = new Date()) {
    writeDb(env, (db) => tx(db, () => {
        const lesson = lessonRow(db, id);
        if (lesson.status !== 'candidate' && lesson.status !== 'accepted')
            throw new LearnError(`lesson ${id} is ${lesson.status}`);
        db.prepare("UPDATE learn_lesson SET status = 'declined', status_reason = 'declined by the person', updated_at = ? WHERE id = ?").run(iso(now), id);
        (0, local_store_1.requarantineRow)(db, Number(lesson.body_id), 'learn: declined by the person');
    }));
}
function listLessons(job, env = process.env) {
    return (readDb(env, (db, path) => {
        const rows = job === undefined ? db.prepare('SELECT * FROM learn_lesson ORDER BY id').all() : db.prepare('SELECT * FROM learn_lesson WHERE job = ? ORDER BY id').all(job);
        const bodies = new Map((0, local_store_1.readRows)(path, rows.map((r) => Number(r.body_id)), env).map((r) => [r.id, r]));
        return rows.map((r) => ({
            id: Number(r.id),
            job: String(r.job),
            check: str(r.check_id),
            status: r.status,
            reason: str(r.status_reason),
            expires_at: str(r.expires_at),
            text: shown(bodies.get(Number(r.body_id))),
        }));
    }) ?? []);
}
// --- attempts, cloze, inject -------------------------------------------------------------------
/** The person's own attempt. The next `inject` on this job binds it to that turn's episode. */
function addAttempt(input, env = process.env, now = new Date()) {
    if (!input.text.trim())
        throw new LearnError('an attempt needs its text');
    refuseSecret(input.text);
    return writeDb(env, (db) => tx(db, () => {
        requireJob(db, input.job);
        if (input.episode !== undefined && !episodeRow(db, { episode: input.episode }))
            throw new LearnError(`no episode ${input.episode}`);
        const row = (0, local_store_1.insertRow)(db, 'learn', input.text, iso(now), env, personTaint('cli:learn attempt', input.text));
        const id = Number(db.prepare('INSERT INTO learn_attempt (job, body_id, episode_id, created_at) VALUES (?, ?, ?, ?)').run(input.job, row.id, input.episode ?? null, iso(now))
            .lastInsertRowid);
        if (input.episode !== undefined)
            db.prepare('UPDATE learn_episode SET attempt_id = ? WHERE id = ?').run(id, input.episode);
        return id;
    }));
}
/**
 * A recall item cut by code from the person's own words: the longest word (4+ letters) is blanked,
 * with up to six words either side. Never model text. Null when no word is long enough.
 */
function cloze(text) {
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
    if (best < 0)
        return null;
    const from = Math.max(0, best - 6);
    const to = Math.min(words.length, best + 7);
    const span = words.slice(from, to).map((w, i) => (from + i === best ? w.replace(/[\p{L}\p{N}_-]+/u, '_____') : w));
    return `${from > 0 ? '… ' : ''}${span.join(' ')}${to < words.length ? ' …' : ''}`;
}
/**
 * What goes into the model's context for one turn of a job, and the episode that records it.
 *   - Only this job's lessons that the person accepted, unexpired, verbatim, through `injectable`.
 *   - At most 5 lessons and 400 tokens in all, the scaffold and the cloze included; a lesson that does
 *     not fit whole is left out, never cut. If the scaffold and the cloze alone would pass 400, the
 *     cloze is left out and the text says so.
 *   - learn mode: with no attempt by the person on this episode, the scaffold only, no lesson bodies
 *     (§8.2). After `learn attempt`, the lessons and one cloze from that attempt.
 *   - cowork mode: the prediction-first line, then the lessons.
 * Missing memory file or unknown job: null, nothing written. The tokens printed are recorded as the
 * episode's loop_tokens, so the loop's own cost is never left out of a ruler; a second inject on the
 * same turn does not count them again (the larger of the two is kept). `model` / `family` are recorded
 * on the episode, so the hook path can be measured by ruler 1.
 */
function inject(opts, env = process.env, now = new Date()) {
    if (!SLUG.test(opts.job))
        return null;
    if (opts.turn !== undefined)
        label('turn', opts.turn);
    const plan = readDb(env, (db, path) => {
        const job = getJob(db, opts.job);
        if (!job)
            return null;
        return tx(db, () => {
            const { row } = upsertEpisode(db, { job: job.slug, turn: opts.turn }, now);
            applyRecord(db, row, { check: opts.check, askSha256: opts.askSha256, model: opts.model, family: opts.family }, now);
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
            return { path, job, episode: Number(row.id), prior: JSON.parse(String(row.injected)), attemptBody: num(attempt?.body_id), lessons };
        });
    });
    if (!plan)
        return null;
    const withheld = plan.job.mode === 'learn' && plan.attemptBody === null;
    const fixed = [];
    if (exports.SCAFFOLD[plan.job.mode])
        fixed.push(exports.SCAFFOLD[plan.job.mode]);
    if (withheld) {
        fixed.push(`No attempt from the person on this turn yet, so no lessons are shown. They record one with: trustshell learn attempt --job ${plan.job.slug} "<attempt>"`);
    }
    const bodies = new Map((0, local_store_1.readRows)(plan.path, [...plan.lessons.map((l) => l.body_id), ...(plan.attemptBody === null ? [] : [plan.attemptBody])], env).map((r) => [r.id, r]));
    let recall = null;
    if (plan.attemptBody !== null && plan.job.mode === 'learn') {
        const attempt = bodies.get(plan.attemptBody);
        const blank = attempt && (0, local_store_1.injectable)(attempt) ? cloze(attempt.body) : null;
        if (blank)
            recall = `Recall question for the end, cut from the person's own attempt (fill the blank): ${blank}`;
    }
    const header = `[trustshell learn] job ${plan.job.slug} · ${plan.job.mode} · episode ${plan.episode}`;
    /** The whole text, so the cap is measured on exactly what is printed. */
    const render = (lessonLines, recallLine) => {
        const parts = [...fixed];
        if (lessonLines.length)
            parts.push("Lessons, in the person's own words:", ...lessonLines);
        if (recallLine)
            parts.push(recallLine);
        return parts.length ? [header, ...parts].join('\n') : '';
    };
    if (recall && estimateTokens(render([], recall)) > exports.MAX_LOOP_TOKENS) {
        recall = null;
        fixed.push(`The recall question was left out: with the scaffold it would pass the ${exports.MAX_LOOP_TOKENS}-token cap.`);
    }
    const used = [];
    const lines = [];
    if (!withheld) {
        for (const l of plan.lessons) {
            if (used.length >= exports.MAX_LESSONS)
                break;
            const row = bodies.get(l.body_id);
            if (!row || !(0, local_store_1.injectable)(row))
                continue;
            const line = `- ${row.body}`;
            if (estimateTokens(render([...lines, line], recall)) > exports.MAX_LOOP_TOKENS)
                continue;
            lines.push(line);
            used.push(l.id);
        }
    }
    const text = render(lines, recall);
    const tokens = estimateTokens(text);
    writeDb(env, (db) => {
        const injected = [...new Set([...plan.prior, ...used])];
        db.prepare('UPDATE learn_episode SET loop_tokens = MAX(loop_tokens, ?), injected = ?, updated_at = ? WHERE id = ?').run(tokens, JSON.stringify(injected), iso(now), plan.episode);
    });
    return { text, episode: plan.episode, lessons: used, loop_tokens: tokens };
}
// --- unaided probes (human) --------------------------------------------------------------------
/** The person writes the criterion BEFORE the attempt. Learn jobs only; scored by a registered check. */
function addProbe(input, env = process.env, now = new Date()) {
    if (!input.criterion.trim())
        throw new LearnError('a probe needs its criterion, written before the attempt');
    refuseSecret(input.criterion);
    return writeDb(env, (db) => tx(db, () => {
        const job = requireJob(db, input.job);
        if (job.mode !== 'learn')
            throw new LearnError(`job ${job.slug} is in ${job.mode} mode; unaided probes are for learn jobs`);
        requireCheck(db, job.slug, input.check);
        const row = (0, local_store_1.insertRow)(db, 'learn', input.criterion, iso(now), env, personTaint('cli:learn probe add', input.criterion));
        return Number(db.prepare('INSERT INTO learn_probe (job, check_id, criterion_id, created_at) VALUES (?, ?, ?, ?)').run(input.job, input.check, row.id, iso(now))
            .lastInsertRowid);
    }));
}
/** Score one unaided attempt on a probe: 1 when its check exits 0, 0 otherwise. Prints no lesson. */
function runProbe(id, env = process.env, now = new Date(), exec = exports.execCheck) {
    const probe = writeDb(env, (db) => {
        const row = db.prepare('SELECT p.id, p.check_id, c.cmd FROM learn_probe p JOIN learn_check c ON c.id = p.check_id WHERE p.id = ?').get(id);
        if (!row)
            throw new LearnError(`no probe ${id}`);
        return { check: String(row.check_id), cmd: String(row.cmd) };
    });
    const exit = exec(probe.cmd);
    if (exit === null)
        return { probe: id, check: probe.check, exit, score: null };
    const score = exit === 0 ? 1 : 0;
    writeDb(env, (db) => db.prepare("INSERT INTO learn_probe_score (probe_id, aided, score, by, created_at) VALUES (?, 0, ?, 'check', ?)").run(id, score, iso(now)));
    return { probe: id, check: probe.check, exit, score };
}
/** Reviews due now, for lessons still accepted. The cue is a cloze of the lesson, never its full text. */
function dueReviews(env = process.env, now = new Date()) {
    return (readDb(env, (db, path) => {
        const rows = db
            .prepare("SELECT r.id, r.lesson_id, r.step, l.job, l.body_id FROM learn_review r JOIN learn_lesson l ON l.id = r.lesson_id WHERE r.result IS NULL AND r.due_at <= ? AND l.status = 'accepted' ORDER BY r.due_at")
            .all(iso(now));
        const bodies = new Map((0, local_store_1.readRows)(path, rows.map((r) => Number(r.body_id)), env).map((r) => [r.id, r]));
        return rows.map((r) => {
            const body = bodies.get(Number(r.body_id));
            const cue = body && !(0, local_store_1.heldAsInjection)(body) ? (cloze(body.body) ?? '(too short for a blank: recall it whole)') : local_store_1.INJECTION_WITHHELD;
            return { id: Number(r.id), lesson: Number(r.lesson_id), job: String(r.job), days: exports.LADDER_DAYS[Number(r.step)], cue };
        });
    }) ?? []);
}
/** Record a review. A recall moves one rung up the ladder; a miss resets to the 1-day rung (§8.2). */
function answerReview(id, recalled, env = process.env, now = new Date()) {
    return writeDb(env, (db) => {
        const row = db.prepare('SELECT lesson_id, step, result FROM learn_review WHERE id = ?').get(id);
        if (!row)
            throw new LearnError(`no review ${id}`);
        if (row.result !== null)
            throw new LearnError(`review ${id} is already answered`);
        const step = recalled === 'yes' ? Math.min(Number(row.step) + 1, exports.LADDER_DAYS.length - 1) : 0;
        const days = exports.LADDER_DAYS[step];
        const next = iso(new Date(now.getTime() + days * DAY));
        db.prepare('UPDATE learn_review SET result = ?, answered_at = ? WHERE id = ?').run(recalled, iso(now), id);
        db.prepare('INSERT INTO learn_review (lesson_id, step, due_at, created_at) VALUES (?, ?, ?, ?)').run(row.lesson_id, step, next, iso(now));
        return { next_due: next, days };
    });
}
/** Every learn row the rulers need, metadata only. Null when there is no memory file. */
function snapshot(env = process.env) {
    return readDb(env, (db) => ({
        jobs: db.prepare('SELECT slug, mode FROM learn_job ORDER BY slug').all().map((r) => ({ slug: String(r.slug), mode: r.mode })),
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
            agent_outcome: str(r.agent_outcome),
            check_outcome: str(r.check_outcome),
            check_at: str(r.check_at),
            rating: str(r.rating),
            injected: JSON.parse(String(r.injected)),
            created_at: String(r.created_at),
        })),
        evals: db.prepare('SELECT id, job, check_id, body_id FROM learn_eval ORDER BY id').all().map((r) => ({ id: Number(r.id), job: String(r.job), check_id: str(r.check_id), body_id: Number(r.body_id) })),
        lessons: db
            .prepare('SELECT id, job, check_id, status, accepted_at FROM learn_lesson ORDER BY id')
            .all()
            .map((r) => ({ id: Number(r.id), job: String(r.job), check_id: str(r.check_id), status: r.status, accepted_at: str(r.accepted_at) })),
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
            .map((r) => ({ result: r.result, answered_at: String(r.answered_at) })),
    }));
}
