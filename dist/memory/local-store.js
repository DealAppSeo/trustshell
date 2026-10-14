"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.memoryDbPath = memoryDbPath;
exports.insertMemory = insertMemory;
exports.listNotes = listNotes;
exports.listQuarantinedRows = listQuarantinedRows;
exports.countQuarantined = countQuarantined;
exports.getNote = getNote;
exports.markReleased = markReleased;
exports.setQuarantineReason = setQuarantineReason;
exports.countDoNotSend = countDoNotSend;
exports.formatRecall = formatRecall;
exports.writeKeyed = writeKeyed;
exports.readKeyed = readKeyed;
exports.deleteKeyed = deleteKeyed;
/**
 * Local memory sqlite. Default file is ~/.trustshell/memory.sqlite.
 * TRUSTSHELL_MEMORY points tests and CI at a temp file.
 */
const node_fs_1 = require("node:fs");
const node_module_1 = require("node:module");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const encrypt_1 = require("./encrypt");
const loadSqlite = (0, node_module_1.createRequire)(__filename);
const SCHEMA = `CREATE TABLE IF NOT EXISTS memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('note', 'pref', 'do_not_send')),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
)`;
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
    // Immune system v0 columns, added in place to this LOCAL file. Existing rows keep NULLs and
    // read as legacy trusted.
    const have = new Set(cols.map((col) => String(col.name)));
    const TAINT_COLUMNS = [
        ['provenance', 'TEXT'],
        ['source', 'TEXT'],
        ['quarantined', 'INTEGER NOT NULL DEFAULT 0'],
        ['quarantine_reason', 'TEXT'],
        ['released_by', 'TEXT'],
        ['released_at', 'TEXT'],
    ];
    for (const [name, type] of TAINT_COLUMNS) {
        if (!have.has(name))
            db.exec(`ALTER TABLE memory ADD COLUMN ${name} ${type}`);
    }
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS memory_key_unique ON memory(key) WHERE key IS NOT NULL');
}
function openDb(path) {
    try {
        (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(path), { recursive: true });
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
        out.provenance = row.provenance ?? 'trusted';
        out.source = row.source ?? 'legacy';
        out.quarantined = Number(row.quarantined) === 1;
        out.quarantine_reason = row.quarantine_reason ?? null;
        out.released_by = row.released_by ?? null;
        out.released_at = row.released_at ?? null;
    }
    return out;
}
const FULL_COLS = 'id, kind, body, created_at, provenance, source, quarantined, quarantine_reason, released_by, released_at';
function insertMemory(path, kind, body, now = new Date().toISOString(), env = process.env, taint = { provenance: 'trusted', source: 'operator', quarantined: false }) {
    const db = openDb(path);
    try {
        const stored = sealer(db, env)(body);
        const result = db
            .prepare('INSERT INTO memory (kind, body, created_at, provenance, source, quarantined, quarantine_reason) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(kind, stored, now, taint.provenance, taint.source, taint.quarantined ? 1 : 0, taint.reason ?? null);
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
        };
    }
    finally {
        db.close();
    }
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
 * Release one quarantined note: provenance becomes `verified` and `released_by` records the check.
 * Only a row that is still quarantined changes; the return says whether one did.
 */
function markReleased(path, id, releasedBy, now = new Date().toISOString()) {
    const db = openDb(path);
    try {
        const before = db.prepare('SELECT quarantined FROM memory WHERE id = ?').get(id);
        if (!before || Number(before.quarantined) !== 1)
            return false;
        db.prepare("UPDATE memory SET quarantined = 0, provenance = 'verified', released_by = ?, released_at = ?, quarantine_reason = NULL WHERE id = ? AND quarantined = 1").run(releasedBy, now, id);
        return true;
    }
    finally {
        db.close();
    }
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
 */
function formatRecall(path, env = process.env, opts = {}) {
    const rows = listNotes(path, env, { includeQuarantined: opts.includeQuarantined });
    const notes = rows.map((row) => row.quarantined ? `[QUARANTINED: ${row.quarantine_reason ?? 'untrusted, not yet checked'}] ${row.body}` : row.body);
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
