/**
 * Local memory sqlite. Default file is ~/.trustshell/memory.sqlite.
 * TRUSTSHELL_MEMORY points tests and CI at a temp file.
 */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const loadSqlite = createRequire(__filename);

export type MemoryKind = 'note' | 'pref' | 'do_not_send';

export type MemoryRow = {
  id: number;
  kind: MemoryKind;
  body: string;
  created_at: string;
};

const SCHEMA = `CREATE TABLE IF NOT EXISTS memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('note', 'pref', 'do_not_send')),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
)`;

type Statement = {
  run(...params: unknown[]): { lastInsertRowid: number | bigint };
  all(...params: unknown[]): Record<string, unknown>[];
  get(...params: unknown[]): Record<string, unknown> | undefined;
};

type SqliteDb = {
  exec(sql: string): void;
  prepare(sql: string): Statement;
  close(): void;
};

export function memoryDbPath(env: NodeJS.ProcessEnv = process.env, home: string = homedir()): string {
  const override = env.TRUSTSHELL_MEMORY;
  if (typeof override === 'string' && override.trim().length > 0) return override.trim();
  return join(home, '.trustshell', 'memory.sqlite');
}

function ensureSchema(db: SqliteDb): void {
  db.exec(SCHEMA);
  const cols = db.prepare('PRAGMA table_info(memory)').all();
  const hasKey = cols.some((col) => String(col.name) === 'key');
  if (!hasKey) db.exec('ALTER TABLE memory ADD COLUMN key TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS memory_key_unique ON memory(key) WHERE key IS NOT NULL');
}

function openDb(path: string): SqliteDb {
  try {
    mkdirSync(dirname(path), { recursive: true });
    const { DatabaseSync } = loadSqlite('node:sqlite') as {
      DatabaseSync: new (location: string) => SqliteDb;
    };
    const db = new DatabaseSync(path);
    ensureSchema(db);
    return db;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('NOT_CHECKED ')) throw err;
    throw new Error(`NOT_CHECKED ${path}`);
  }
}

function asRow(row: Record<string, unknown>): MemoryRow {
  return {
    id: Number(row.id),
    kind: row.kind as MemoryKind,
    body: String(row.body),
    created_at: String(row.created_at),
  };
}

export function insertMemory(
  path: string,
  kind: MemoryKind,
  body: string,
  now: string = new Date().toISOString(),
): MemoryRow {
  const db = openDb(path);
  try {
    const result = db
      .prepare('INSERT INTO memory (kind, body, created_at) VALUES (?, ?, ?)')
      .run(kind, body, now);
    return { id: Number(result.lastInsertRowid), kind, body, created_at: now };
  } finally {
    db.close();
  }
}

export function listNotes(path: string): MemoryRow[] {
  const db = openDb(path);
  try {
    return db
      .prepare(
        "SELECT id, kind, body, created_at FROM memory WHERE kind = 'note' AND key IS NULL ORDER BY id ASC",
      )
      .all()
      .map(asRow);
  } finally {
    db.close();
  }
}

export function countDoNotSend(path: string): number {
  const db = openDb(path);
  try {
    const row = db.prepare("SELECT COUNT(*) AS n FROM memory WHERE kind = 'do_not_send'").get();
    return Number(row?.n ?? 0);
  } finally {
    db.close();
  }
}

/** Notes in insert order, then a count. do_not_send bodies are not included. */
export function formatRecall(path: string): string {
  const notes = listNotes(path).map((row) => row.body);
  return [...notes, `do_not_send COUNT ${countDoNotSend(path)}`].join('\n');
}

/** One value under key. A later write of the same key replaces the row. */
export function writeKeyed(
  path: string,
  key: string,
  body: string,
  now: string = new Date().toISOString(),
): void {
  const db = openDb(path);
  try {
    db.prepare('DELETE FROM memory WHERE key = ?').run(key);
    db.prepare('INSERT INTO memory (kind, body, created_at, key) VALUES (?, ?, ?, ?)').run(
      'pref',
      body,
      now,
      key,
    );
  } finally {
    db.close();
  }
}

/**
 * The stored value, or NOT_CHECKED when the key is absent.
 * A blank body is NOT_CHECKED so a missing value is never "".
 */
export function readKeyed(path: string, key: string): string {
  const db = openDb(path);
  try {
    const row = db.prepare('SELECT body FROM memory WHERE key = ?').get(key);
    if (!row) return 'NOT_CHECKED';
    const body = String(row.body ?? '');
    if (body.trim().length === 0) return 'NOT_CHECKED';
    return body;
  } finally {
    db.close();
  }
}

/** Delete the row for key. Missing is NOT_CHECKED, not an empty success. */
export function deleteKeyed(path: string, key: string): 'redacted' | 'NOT_CHECKED' {
  const db = openDb(path);
  try {
    const row = db.prepare('SELECT id FROM memory WHERE key = ?').get(key);
    if (!row) return 'NOT_CHECKED';
    db.prepare('DELETE FROM memory WHERE key = ?').run(key);
    return 'redacted';
  } finally {
    db.close();
  }
}
