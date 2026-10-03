"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.memoryDbPath = memoryDbPath;
exports.insertMemory = insertMemory;
exports.listNotes = listNotes;
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
function ensureSchema(db) {
    db.exec(SCHEMA);
    const cols = db.prepare('PRAGMA table_info(memory)').all();
    const hasKey = cols.some((col) => String(col.name) === 'key');
    if (!hasKey)
        db.exec('ALTER TABLE memory ADD COLUMN key TEXT');
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
        throw new Error(`NOT_CHECKED ${path}`);
    }
}
function asRow(row) {
    return {
        id: Number(row.id),
        kind: row.kind,
        body: String(row.body),
        created_at: String(row.created_at),
    };
}
function insertMemory(path, kind, body, now = new Date().toISOString()) {
    const db = openDb(path);
    try {
        const result = db
            .prepare('INSERT INTO memory (kind, body, created_at) VALUES (?, ?, ?)')
            .run(kind, body, now);
        return { id: Number(result.lastInsertRowid), kind, body, created_at: now };
    }
    finally {
        db.close();
    }
}
function listNotes(path) {
    const db = openDb(path);
    try {
        return db
            .prepare("SELECT id, kind, body, created_at FROM memory WHERE kind = 'note' AND key IS NULL ORDER BY id ASC")
            .all()
            .map(asRow);
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
/** Notes in insert order, then a count. do_not_send bodies are not included. */
function formatRecall(path) {
    const notes = listNotes(path).map((row) => row.body);
    return [...notes, `do_not_send COUNT ${countDoNotSend(path)}`].join('\n');
}
/** One value under key. A later write of the same key replaces the row. */
function writeKeyed(path, key, body, now = new Date().toISOString()) {
    const db = openDb(path);
    try {
        db.prepare('DELETE FROM memory WHERE key = ?').run(key);
        db.prepare('INSERT INTO memory (kind, body, created_at, key) VALUES (?, ?, ?, ?)').run('pref', body, now, key);
    }
    finally {
        db.close();
    }
}
/**
 * The stored value, or NOT_CHECKED when the key is absent.
 * A blank body is NOT_CHECKED so a missing value is never "".
 */
function readKeyed(path, key) {
    const db = openDb(path);
    try {
        const row = db.prepare('SELECT body FROM memory WHERE key = ?').get(key);
        if (!row)
            return 'NOT_CHECKED';
        const body = String(row.body ?? '');
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
