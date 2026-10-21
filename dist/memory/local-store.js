"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LESSON_ACCEPTED = exports.LEGACY_REASON = exports.INJECTION_WITHHELD = exports.INJECTION_PREFIX = void 0;
exports.heldAsInjection = heldAsInjection;
exports.admitsLearnKinds = admitsLearnKinds;
exports.memoryDbPath = memoryDbPath;
exports.insertMemory = insertMemory;
exports.insertRow = insertRow;
exports.listNotes = listNotes;
exports.listQuarantinedRows = listQuarantinedRows;
exports.countQuarantined = countQuarantined;
exports.getNote = getNote;
exports.markReleased = markReleased;
exports.releaseRow = releaseRow;
exports.requarantineRow = requarantineRow;
exports.setQuarantineReason = setQuarantineReason;
exports.countDoNotSend = countDoNotSend;
exports.formatRecall = formatRecall;
exports.writeKeyed = writeKeyed;
exports.readKeyed = readKeyed;
exports.deleteKeyed = deleteKeyed;
exports.openMemoryDb = openMemoryDb;
exports.readRows = readRows;
exports.injectable = injectable;
exports.exportRows = exportRows;
exports.importRows = importRows;
/**
 * Local memory sqlite. Default file is ~/.trustshell/memory.sqlite.
 * TRUSTSHELL_MEMORY points tests and CI at a temp file.
 */
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_module_1 = require("node:module");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const encrypt_1 = require("./encrypt");
const ingest_1 = require("../lib/ingest");
const loadSqlite = (0, node_module_1.createRequire)(__filename);
/** A quarantine reason that starts with this marks injection-looking text: described, never printed. */
exports.INJECTION_PREFIX = 'injection-looking text';
/** What is printed in place of injection-looking text. */
exports.INJECTION_WITHHELD = '[text withheld: injection-looking text is described, never printed]';
/** Why a note saved before taint labels is held: nothing recorded who wrote it. */
exports.LEGACY_REASON = 'legacy: saved before taint labels, so who wrote it is unknown';
/**
 * True when a quarantined note's text must be withheld and can never be released by a check: its
 * reason says injection, OR its readable body screens as injection now (src/lib/ingest.ts). The
 * second clause covers notes no screen ever saw: legacy rows, and encrypted rows read with the key.
 */
function heldAsInjection(row) {
    if (typeof row.quarantine_reason === 'string' && row.quarantine_reason.startsWith(exports.INJECTION_PREFIX))
        return true;
    if (row.body === encrypt_1.SEALED_NO_KEY || row.body === encrypt_1.SEALED_WRONG_KEY)
        return false;
    return (0, ingest_1.ingest)(row.body).ingest !== 'clean';
}
const KINDS = "'note', 'pref', 'do_not_send', 'lesson', 'learn'";
const SCHEMA = `CREATE TABLE IF NOT EXISTS memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN (${KINDS})),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
)`;
/**
 * Does this CREATE TABLE text already admit every kind? Reads the actual `CHECK (kind IN (...))` list
 * and compares it as a set, rather than looking for one word anywhere in the text. A table with no
 * CHECK on kind admits any kind, so it needs no rebuild.
 */
function admitsLearnKinds(createSql) {
    const m = /CHECK\s*\(\s*kind\s+IN\s*\(([^)]*)\)\s*\)/i.exec(createSql);
    if (!m)
        return true;
    const have = new Set([...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]));
    return [...KINDS.matchAll(/'([^']*)'/g)].every((x) => have.has(x[1]));
}
/** Every column, in order, for the one-time rebuild below. */
const ALL_COLUMNS = 'id, kind, body, created_at, key, provenance, source, quarantined, quarantine_reason, released_by, released_at, source_sha256';
/**
 * A file made before the learn kinds has CHECK (kind IN ('note', 'pref', 'do_not_send')) baked into
 * its table, and SQLite cannot alter a CHECK. So the table is rebuilt ONCE, in one transaction: copy
 * every row with its id, swap the tables, keep the AUTOINCREMENT high-water mark so a deleted id is
 * never reused. Any failure rolls back and leaves the old table exactly as it was.
 *
 * DEFAULT-INERT: only the learn commands call it (openMemoryDb, before any learn write). A file nobody
 * runs `learn` on keeps its table as it was; a new file is created with the wide CHECK already.
 *
 * BACKUP FIRST. Inside the write lock and before anything changes, the whole file is copied next to
 * itself as `<file>.bak-<UTC time>` (0600), and its path is printed once on stderr. If the copy fails,
 * nothing is rebuilt: the error is thrown and the transaction rolls back untouched.
 */
function widenKinds(db, path, copy) {
    const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'memory'").get();
    if (!row || admitsLearnKinds(String(row.sql)))
        return;
    db.exec('BEGIN IMMEDIATE');
    try {
        // The time with its separators removed (20261016T101500123Z): a Windows file name cannot hold ':'.
        const backup = `${path}.bak-${new Date().toISOString().replace(/[-:.]/g, '')}`;
        try {
            copy(path, backup);
            (0, node_fs_1.chmodSync)(backup, 0o600);
        }
        catch (err) {
            throw new Error(`NOT_CHECKED could not back up ${path} to ${backup} (${err?.message ?? String(err)}); the memory table was not changed`);
        }
        process.stderr.write(`trustshell: backed up ${path} to ${backup} before widening its memory table (once)\n`);
        const seq = db.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'memory'").get();
        db.exec(`CREATE TABLE memory_widen (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL CHECK (kind IN (${KINDS})),
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      key TEXT, provenance TEXT, source TEXT, quarantined INTEGER NOT NULL DEFAULT 0,
      quarantine_reason TEXT, released_by TEXT, released_at TEXT, source_sha256 TEXT
    )`);
        db.exec(`INSERT INTO memory_widen (${ALL_COLUMNS}) SELECT ${ALL_COLUMNS} FROM memory`);
        db.exec('DROP TABLE memory');
        db.exec('ALTER TABLE memory_widen RENAME TO memory');
        db.exec('CREATE UNIQUE INDEX IF NOT EXISTS memory_key_unique ON memory(key) WHERE key IS NOT NULL');
        if (seq) {
            const top = db.prepare('SELECT COALESCE(MAX(id), 0) AS n FROM memory').get();
            db.prepare("DELETE FROM sqlite_sequence WHERE name = 'memory'").run();
            db.prepare("INSERT INTO sqlite_sequence (name, seq) VALUES ('memory', ?)").run(Math.max(Number(seq.seq), Number(top?.n ?? 0)));
        }
        db.exec('COMMIT');
    }
    catch (err) {
        db.exec('ROLLBACK');
        throw err;
    }
}
function memoryDbPath(env = process.env, home = (0, node_os_1.homedir)()) {
    const override = env.TRUSTSHELL_MEMORY;
    if (typeof override === 'string' && override.trim().length > 0)
        return override.trim();
    return (0, node_path_1.join)(home, '.trustshell', 'memory.sqlite');
}
/** One row per memory file: the scrypt salt for TRUSTSHELL_MEMORY_ENCRYPT (src/memory/encrypt.ts). */
const META = 'CREATE TABLE IF NOT EXISTS memory_meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)';
function ensureSchema(db) {
    db.exec(SCHEMA);
    db.exec(META);
    const cols = db.prepare('PRAGMA table_info(memory)').all();
    const hasKey = cols.some((col) => String(col.name) === 'key');
    if (!hasKey)
        db.exec('ALTER TABLE memory ADD COLUMN key TEXT');
    // Immune system v0 columns, added in place to this LOCAL file.
    const have = new Set(cols.map((col) => String(col.name)));
    const TAINT_COLUMNS = [
        ['provenance', 'TEXT'],
        ['source', 'TEXT'],
        ['quarantined', 'INTEGER NOT NULL DEFAULT 0'],
        ['quarantine_reason', 'TEXT'],
        ['released_by', 'TEXT'],
        ['released_at', 'TEXT'],
        ['source_sha256', 'TEXT'],
    ];
    for (const [name, type] of TAINT_COLUMNS) {
        if (!have.has(name))
            db.exec(`ALTER TABLE memory ADD COLUMN ${name} ${type}`);
    }
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS memory_key_unique ON memory(key) WHERE key IS NOT NULL');
    // FAIL CLOSED ON UPGRADE. A note with no provenance was saved before taint labels existed, by the
    // CLI or by an MCP caller, and nothing says which. It is quarantined as untrusted, never read as
    // trusted. Idempotent: every write since sets provenance, so this touches only pre-v0 notes.
    db.prepare("UPDATE memory SET provenance = 'untrusted', source = 'legacy', quarantined = 1, quarantine_reason = ? WHERE kind = 'note' AND key IS NULL AND provenance IS NULL").run(exports.LEGACY_REASON);
}
/**
 * SEC F6: the memory holds the operator's notes and keyed values, so it is owner-only. A folder this
 * creates is 0700, and the file is created 0600 and put back to 0600 on every open (an existing
 * world-readable file is tightened). An existing folder keeps its mode. On Windows those modes do
 * nothing, so a folder this creates gets an ACL for the current user only. The default
 * ~/.trustshell already inherits the user profile's ACL (the user, SYSTEM, Administrators).
 */
function ownerOnly(path) {
    const created = (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(path), { recursive: true, mode: 0o700 });
    if (created && process.platform === 'win32')
        windowsOwnerOnly(created);
    (0, node_fs_1.closeSync)((0, node_fs_1.openSync)(path, 'a', 0o600));
    (0, node_fs_1.chmodSync)(path, 0o600);
}
/**
 * Grant the current user full control first, and only then drop the inherited entries, so a failure
 * part way never leaves the folder with no one able to open it.
 * ponytail: best effort, by user name; if icacls is missing or refuses, the folder keeps the ACL it
 * inherited. Use the user's SID instead if a name ever fails to resolve.
 */
function windowsOwnerOnly(dir) {
    try {
        (0, node_child_process_1.execFileSync)('icacls', [dir, '/grant:r', `${(0, node_os_1.userInfo)().username}:(OI)(CI)F`], { stdio: 'ignore', windowsHide: true });
        (0, node_child_process_1.execFileSync)('icacls', [dir, '/inheritance:r'], { stdio: 'ignore', windowsHide: true });
    }
    catch {
        /* keeps the inherited ACL */
    }
}
function openDb(path) {
    try {
        ownerOnly(path);
        const { DatabaseSync } = loadSqlite('node:sqlite');
        const db = new DatabaseSync(path);
        ensureSchema(db);
        return db;
    }
    catch (err) {
        if (err instanceof Error && err.message.startsWith('NOT_CHECKED '))
            throw err;
        // `node:sqlite` is a built-in from Node 22.5. On older Node the require itself throws, and a bare
        // "NOT_CHECKED <path>" gives a stranger no way to tell that from a bad path or a locked file.
        if (err?.code === 'ERR_UNKNOWN_BUILTIN_MODULE') {
            throw new Error(`NOT_CHECKED ${path} (node:sqlite is not in this Node; local memory needs Node 22.5 or newer)`);
        }
        throw new Error(`NOT_CHECKED ${path}`);
    }
}
function fileSalt(db, create) {
    const row = db.prepare("SELECT v FROM memory_meta WHERE k = 'salt'").get();
    if (row)
        return Buffer.from(String(row.v), 'base64');
    if (!create)
        return null;
    const salt = (0, encrypt_1.newSalt)();
    db.prepare("INSERT INTO memory_meta (k, v) VALUES ('salt', ?)").run(salt.toString('base64'));
    return salt;
}
/**
 * How a body is written. Plain unless TRUSTSHELL_MEMORY_ENCRYPT is on; on with no key THROWS before
 * anything is written, so a note is never stored in plain text while the setting says encrypted.
 */
function sealer(db, env) {
    if (!(0, encrypt_1.encryptionEnabled)(env))
        return (body) => body;
    const password = (0, encrypt_1.memoryPassword)(env);
    if (!password) {
        throw new Error('NOT_CHECKED TRUSTSHELL_MEMORY_KEY missing: TRUSTSHELL_MEMORY_ENCRYPT is on, so nothing was written');
    }
    const key = (0, encrypt_1.deriveKey)(password, fileSalt(db, true));
    return (body) => (0, encrypt_1.seal)(body, key);
}
/** How a body is read. The key is derived at most once, and only if a sealed row is met. */
function opener(db, env) {
    let key;
    return (body) => {
        if (!(0, encrypt_1.isSealed)(body))
            return { body, readable: true };
        if (key === undefined) {
            const password = (0, encrypt_1.memoryPassword)(env);
            const salt = fileSalt(db, false);
            key = password && salt ? (0, encrypt_1.deriveKey)(password, salt) : null;
        }
        if (!key)
            return { body: encrypt_1.SEALED_NO_KEY, readable: false, reason: 'no-key' };
        try {
            return { body: (0, encrypt_1.unseal)(body, key), readable: true };
        }
        catch {
            return { body: encrypt_1.SEALED_WRONG_KEY, readable: false, reason: 'wrong-key' };
        }
    };
}
function asRow(row) {
    const out = {
        id: Number(row.id),
        kind: row.kind,
        body: String(row.body),
        created_at: String(row.created_at),
    };
    if ('quarantined' in row) {
        // Never default to trusted: a missing label is untrusted (ensureSchema has already quarantined it).
        out.provenance = row.provenance ?? 'untrusted';
        out.source = row.source ?? 'legacy';
        out.quarantined = Number(row.quarantined) === 1;
        out.quarantine_reason = row.quarantine_reason ?? null;
        out.released_by = row.released_by ?? null;
        out.released_at = row.released_at ?? null;
        out.source_sha256 = row.source_sha256 ?? null;
    }
    return out;
}
const FULL_COLS = 'id, kind, body, created_at, provenance, source, quarantined, quarantine_reason, released_by, released_at, source_sha256';
function insertMemory(path, kind, body, now = new Date().toISOString(), env = process.env, taint = { provenance: 'trusted', source: 'operator', quarantined: false }) {
    const db = openDb(path);
    try {
        return insertRow(db, kind, body, now, env, taint);
    }
    finally {
        db.close();
    }
}
/**
 * insertMemory on a handle the caller already holds, so src/learn can write the memory row and its own
 * learn_* row in ONE transaction on one connection. Same sealing, same taint columns. The taint is
 * required here: a learn write always says where its text came from.
 */
function insertRow(db, kind, body, now, env, taint) {
    const stored = sealer(db, env)(body);
    const result = db
        .prepare('INSERT INTO memory (kind, body, created_at, provenance, source, quarantined, quarantine_reason, source_sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(kind, stored, now, taint.provenance, taint.source, taint.quarantined ? 1 : 0, taint.reason ?? null, taint.sourceSha256 ?? null);
    return {
        id: Number(result.lastInsertRowid),
        kind,
        body,
        created_at: now,
        provenance: taint.provenance,
        source: taint.source,
        quarantined: taint.quarantined,
        quarantine_reason: taint.reason ?? null,
        released_by: null,
        released_at: null,
        source_sha256: taint.sourceSha256 ?? null,
    };
}
/**
 * Notes in insert order. A sealed note that cannot be opened reads as a placeholder line, never ciphertext.
 * QUARANTINED NOTES ARE LEFT OUT unless `includeQuarantined` is set: untrusted text does not reach a
 * reader of recall until a check releases it.
 */
function listNotes(path, env = process.env, opts = {}) {
    const db = openDb(path);
    try {
        const open = opener(db, env);
        const where = opts.includeQuarantined ? '' : ' AND quarantined = 0';
        return db
            .prepare(`SELECT ${FULL_COLS} FROM memory WHERE kind = 'note' AND key IS NULL${where} ORDER BY id ASC`)
            .all()
            .map(asRow)
            .map((row) => ({ ...row, body: open(row.body).body }));
    }
    finally {
        db.close();
    }
}
/** Notes still in quarantine, oldest first. */
function listQuarantinedRows(path, env = process.env) {
    return listNotes(path, env, { includeQuarantined: true }).filter((row) => row.quarantined);
}
function countQuarantined(path) {
    const db = openDb(path);
    try {
        const row = db.prepare("SELECT COUNT(*) AS n FROM memory WHERE kind = 'note' AND quarantined = 1").get();
        return Number(row?.n ?? 0);
    }
    finally {
        db.close();
    }
}
/** One note by id, with its taint record, or null. */
function getNote(path, id, env = process.env) {
    const db = openDb(path);
    try {
        const row = db.prepare(`SELECT ${FULL_COLS} FROM memory WHERE id = ? AND kind = 'note' AND key IS NULL`).get(id);
        if (!row)
            return null;
        const r = asRow(row);
        return { ...r, body: opener(db, env)(r.body).body };
    }
    finally {
        db.close();
    }
}
/**
 * Release one quarantined note: provenance becomes `verified` (HAL), `grounded` (found in the
 * recorder-supplied source) or `trusted` (the operator vouched), and `released_by` records which.
 * Only a row that is still quarantined changes; the return says whether one did.
 */
function markReleased(path, id, releasedBy, now = new Date().toISOString(), provenance = 'verified') {
    const db = openDb(path);
    try {
        return releaseRow(db, id, releasedBy, now, provenance);
    }
    finally {
        db.close();
    }
}
/** markReleased on a handle the caller holds (one transaction with a learn_* write). */
function releaseRow(db, id, releasedBy, now, provenance) {
    const before = db.prepare('SELECT quarantined FROM memory WHERE id = ?').get(id);
    if (!before || Number(before.quarantined) !== 1)
        return false;
    db.prepare('UPDATE memory SET quarantined = 0, provenance = ?, released_by = ?, released_at = ?, quarantine_reason = NULL WHERE id = ? AND quarantined = 1').run(provenance, releasedBy, now, id);
    return true;
}
/**
 * Put a released learn row back in quarantine, with why (a declined or retired lesson). Only kinds
 * `lesson` and `learn`: notes are released and held by the quarantine commands, never from here.
 */
function requarantineRow(db, id, reason) {
    db.prepare("UPDATE memory SET quarantined = 1, quarantine_reason = ? WHERE id = ? AND kind IN ('lesson', 'learn')").run(reason, id);
}
/** Record why a quarantined note stays held (a failed check). It stays quarantined. */
function setQuarantineReason(path, id, reason) {
    const db = openDb(path);
    try {
        db.prepare('UPDATE memory SET quarantine_reason = ? WHERE id = ? AND quarantined = 1').run(reason, id);
    }
    finally {
        db.close();
    }
}
function countDoNotSend(path) {
    const db = openDb(path);
    try {
        const row = db.prepare("SELECT COUNT(*) AS n FROM memory WHERE kind = 'do_not_send'").get();
        return Number(row?.n ?? 0);
    }
    finally {
        db.close();
    }
}
/**
 * Notes in insert order, then a count. do_not_send bodies are not included.
 * Quarantined notes are left out, and when any exist a last line says how many, so nothing is
 * hidden silently. With `includeQuarantined` they are printed, each marked [QUARANTINED: reason].
 * Injection-looking text is described and never printed, whatever the row's label: a `--trusted`
 * note gets the same screen as a quarantined one (the same rule as list/explain).
 */
function formatRecall(path, env = process.env, opts = {}) {
    const rows = listNotes(path, env, { includeQuarantined: opts.includeQuarantined });
    const notes = rows.map((row) => {
        const body = heldAsInjection(row) ? exports.INJECTION_WITHHELD : row.body;
        return row.quarantined ? `[QUARANTINED: ${row.quarantine_reason ?? 'untrusted, not yet checked'}] ${body}` : body;
    });
    const lines = [...notes, `do_not_send COUNT ${countDoNotSend(path)}`];
    const held = countQuarantined(path);
    if (held > 0 && !opts.includeQuarantined)
        lines.push(`quarantined COUNT ${held} (trustshell quarantine list)`);
    return lines.join('\n');
}
/** One value under key. A later write of the same key replaces the row. */
function writeKeyed(path, key, body, now = new Date().toISOString(), env = process.env) {
    const db = openDb(path);
    try {
        const stored = sealer(db, env)(body);
        db.prepare('DELETE FROM memory WHERE key = ?').run(key);
        db.prepare('INSERT INTO memory (kind, body, created_at, key) VALUES (?, ?, ?, ?)').run('pref', stored, now, key);
    }
    finally {
        db.close();
    }
}
/**
 * The stored value, or NOT_CHECKED when the key is absent.
 * A blank body is NOT_CHECKED so a missing value is never "".
 * A sealed value that cannot be opened THROWS: a placeholder returned here would be read by a
 * script as the value itself.
 */
function readKeyed(path, key, env = process.env) {
    const db = openDb(path);
    try {
        const row = db.prepare('SELECT body FROM memory WHERE key = ?').get(key);
        if (!row)
            return 'NOT_CHECKED';
        const opened = opener(db, env)(String(row.body ?? ''));
        if (!opened.readable) {
            throw new Error(opened.reason === 'wrong-key'
                ? 'NOT_CHECKED TRUSTSHELL_MEMORY_KEY does not open this value'
                : 'NOT_CHECKED this value is encrypted: set TRUSTSHELL_MEMORY_KEY to read it');
        }
        const body = opened.body;
        if (body.trim().length === 0)
            return 'NOT_CHECKED';
        return body;
    }
    finally {
        db.close();
    }
}
/** Delete the row for key. Missing is NOT_CHECKED, not an empty success. */
function deleteKeyed(path, key) {
    const db = openDb(path);
    try {
        const row = db.prepare('SELECT id FROM memory WHERE key = ?').get(key);
        if (!row)
            return 'NOT_CHECKED';
        db.prepare('DELETE FROM memory WHERE key = ?').run(key);
        return 'redacted';
    }
    finally {
        db.close();
    }
}
/**
 * The open handle, for src/learn/store.ts and its own learn_* tables in this same file (same path,
 * same owner-only mode, same NOT_CHECKED errors). That module never reads the memory table through
 * it: memory rows are read with readRows, and only `injectable` decides what may reach a model.
 */
function openMemoryDb(path, opts = {}) {
    const db = openDb(path);
    try {
        widenKinds(db, path, opts.copyFile ?? ((from, to) => (0, node_fs_1.copyFileSync)(from, to, node_fs_1.constants.COPYFILE_EXCL)));
    }
    catch (err) {
        db.close();
        throw err;
    }
    return db;
}
/** What `learn accept` writes into released_by. A lesson row without it was never accepted. */
exports.LESSON_ACCEPTED = 'learn accept: the person accepted this lesson';
/**
 * Rows by id, any kind, with the taint record and the body opened (a sealed body that cannot be
 * opened reads as its placeholder, never ciphertext). Quarantined rows are INCLUDED so the learn
 * commands can say why a row is held: a caller that sends text to a model filters with `injectable`.
 */
function readRows(path, ids, env = process.env) {
    if (ids.length === 0)
        return [];
    const db = openDb(path);
    try {
        const open = opener(db, env);
        const marks = ids.map(() => '?').join(', ');
        return db
            .prepare(`SELECT ${FULL_COLS} FROM memory WHERE id IN (${marks}) ORDER BY id ASC`)
            .all(...ids)
            .map(asRow)
            .map((row) => ({ ...row, body: open(row.body).body }));
    }
    finally {
        db.close();
    }
}
/**
 * May this row's text go into a model's context? Only the person's own words, released by the person:
 *   lesson  not quarantined, trusted, and released by `learn accept` (LESSON_ACCEPTED). A row inserted
 *           without taint defaults to trusted but carries no such release, so it stays out.
 *   learn   the person's own CLI text (an attempt): trusted and not quarantined.
 * Both: readable (not a sealed placeholder) and not injection-looking now (the formatRecall screen).
 */
function injectable(row) {
    if (row.quarantined !== false || row.provenance !== 'trusted')
        return false;
    if (row.body === encrypt_1.SEALED_NO_KEY || row.body === encrypt_1.SEALED_WRONG_KEY || heldAsInjection(row))
        return false;
    if (row.kind === 'lesson')
        return row.released_by === exports.LESSON_ACCEPTED;
    return row.kind === 'learn';
}
/**
 * Every note and keyed value, for `trustshell bundle export`. LEFT OUT, and counted: encrypted bodies
 * (a bundle is plain JSON, so it never decrypts what you chose to encrypt), do_not_send rows (the
 * same rule as recall), and the learn loop's lesson/learn rows (their learn_* tables do not travel).
 * The caller screens what is left for credential shapes.
 */
function exportRows(path) {
    const db = openDb(path);
    try {
        const withheld = { encrypted: 0, do_not_send: 0, learn: 0 };
        const notes = [];
        const values = [];
        for (const raw of db.prepare(`SELECT key, ${FULL_COLS} FROM memory ORDER BY id ASC`).all()) {
            const row = asRow(raw);
            if (row.kind === 'do_not_send')
                withheld.do_not_send += 1;
            else if (row.kind === 'lesson' || row.kind === 'learn')
                withheld.learn += 1;
            else if ((0, encrypt_1.isSealed)(row.body))
                withheld.encrypted += 1;
            else if (raw.key !== null && raw.key !== undefined)
                values.push({ key: String(raw.key), body: row.body, created_at: row.created_at });
            else {
                notes.push({
                    kind: row.kind,
                    body: row.body,
                    created_at: row.created_at,
                    provenance: row.provenance ?? 'untrusted',
                    source: row.source ?? 'legacy',
                    quarantined: row.quarantined !== false,
                    quarantine_reason: row.quarantine_reason ?? null,
                    released_by: row.released_by ?? null,
                    released_at: row.released_at ?? null,
                    source_sha256: row.source_sha256 ?? null,
                });
            }
        }
        return { notes, values, withheld };
    }
    finally {
        db.close();
    }
}
/**
 * Write a bundle's rows into this file, all or nothing, in ONE transaction. A note already here (same
 * kind, time and text) is skipped, so importing twice adds nothing. A key holding a different value is
 * a conflict: nothing at all is written unless `replace`. Labels are written as the bundle carries
 * them; encryption follows THIS file's setting, so an encrypted target seals what it receives.
 */
function importRows(path, rows, opts = {}) {
    const env = opts.env ?? process.env;
    const db = openDb(path);
    try {
        const open = opener(db, env);
        const seen = new Set(db
            .prepare('SELECT kind, body, created_at FROM memory WHERE key IS NULL')
            .all()
            .map((r) => JSON.stringify([String(r.kind), String(r.created_at), open(String(r.body)).body])));
        const fresh = rows.notes.filter((n) => !seen.has(JSON.stringify([n.kind, n.created_at, n.body])));
        const out = {
            applied: false,
            added_notes: 0,
            duplicate_notes: rows.notes.length - fresh.length,
            added_values: 0,
            same_values: 0,
            replaced_values: 0,
            conflicts: [],
        };
        const plan = [];
        for (const v of rows.values) {
            const have = db.prepare('SELECT body FROM memory WHERE key = ?').get(v.key);
            if (!have)
                plan.push({ v, replace: false });
            else if (open(String(have.body)).body === v.body)
                out.same_values += 1;
            else if (opts.replace)
                plan.push({ v, replace: true });
            else
                out.conflicts.push(v.key);
        }
        if (out.conflicts.length)
            return out;
        const seal = sealer(db, env);
        db.exec('BEGIN IMMEDIATE');
        try {
            const insert = db.prepare('INSERT INTO memory (kind, body, created_at, provenance, source, quarantined, quarantine_reason, released_by, released_at, source_sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            for (const n of fresh) {
                insert.run(n.kind, seal(n.body), n.created_at, n.provenance, n.source, n.quarantined ? 1 : 0, n.quarantine_reason, n.released_by, n.released_at, n.source_sha256);
            }
            for (const { v, replace } of plan) {
                if (replace)
                    db.prepare('DELETE FROM memory WHERE key = ?').run(v.key);
                db.prepare('INSERT INTO memory (kind, body, created_at, key) VALUES (?, ?, ?, ?)').run('pref', seal(v.body), v.created_at, v.key);
            }
            db.exec('COMMIT');
        }
        catch (err) {
            db.exec('ROLLBACK');
            throw err;
        }
        out.applied = true;
        out.added_notes = fresh.length;
        out.replaced_values = plan.filter((p) => p.replace).length;
        out.added_values = plan.length - out.replaced_values;
        return out;
    }
    finally {
        db.close();
    }
}
