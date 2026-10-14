/**
 * Local memory sqlite. Default file is ~/.trustshell/memory.sqlite.
 * TRUSTSHELL_MEMORY points tests and CI at a temp file.
 */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  SEALED_NO_KEY,
  SEALED_WRONG_KEY,
  deriveKey,
  encryptionEnabled,
  isSealed,
  memoryPassword,
  newSalt,
  seal,
  unseal,
} from './encrypt';
import { ingest } from '../lib/ingest';

const loadSqlite = createRequire(__filename);

/** A quarantine reason that starts with this marks injection-looking text: described, never printed. */
export const INJECTION_PREFIX = 'injection-looking text';
/** What is printed in place of injection-looking text. */
export const INJECTION_WITHHELD = '[text withheld: injection-looking text is described, never printed]';
/** Why a note saved before taint labels is held: nothing recorded who wrote it. */
export const LEGACY_REASON = 'legacy: saved before taint labels, so who wrote it is unknown';

/**
 * True when a quarantined note's text must be withheld and can never be released by a check: its
 * reason says injection, OR its readable body screens as injection now (src/lib/ingest.ts). The
 * second clause covers notes no screen ever saw: legacy rows, and encrypted rows read with the key.
 */
export function heldAsInjection(row: Pick<MemoryRow, 'body' | 'quarantine_reason'>): boolean {
  if (typeof row.quarantine_reason === 'string' && row.quarantine_reason.startsWith(INJECTION_PREFIX)) return true;
  if (row.body === SEALED_NO_KEY || row.body === SEALED_WRONG_KEY) return false;
  return ingest(row.body).ingest !== 'clean';
}

export type MemoryKind = 'note' | 'pref' | 'do_not_send';

/**
 * Taint label (immune system v0). Where an entry came from, as far as this file can know it:
 *   trusted    written by the operator (the CLI's `remember`, or SDK code that says so)
 *   untrusted  anything else (an MCP tool call, a web page, another agent): held in quarantine
 *   verified   was untrusted, and a recorded check released it
 * Rows written before this column existed are UNTRUSTED, source `legacy`, and quarantined: they came
 * from the CLI or MCP `remember`, and nothing recorded which, so the file does not guess "trusted".
 */
export type Provenance = 'trusted' | 'untrusted' | 'verified';

export type MemoryRow = {
  id: number;
  kind: MemoryKind;
  body: string;
  created_at: string;
  provenance?: Provenance;
  source?: string;
  quarantined?: boolean;
  quarantine_reason?: string | null;
  released_by?: string | null;
  released_at?: string | null;
  /** sha256 of the source document recorded when the note was stored; null when none was given. */
  source_sha256?: string | null;
};

/** What a write says about where the text came from. Absent = trusted operator write. */
export type ProvenanceInput = {
  provenance: Provenance;
  source: string;
  quarantined: boolean;
  reason?: string | null;
  sourceSha256?: string | null;
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

/** One row per memory file: the scrypt salt for TRUSTSHELL_MEMORY_ENCRYPT (src/memory/encrypt.ts). */
const META = 'CREATE TABLE IF NOT EXISTS memory_meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)';

function ensureSchema(db: SqliteDb): void {
  db.exec(SCHEMA);
  db.exec(META);
  const cols = db.prepare('PRAGMA table_info(memory)').all();
  const hasKey = cols.some((col) => String(col.name) === 'key');
  if (!hasKey) db.exec('ALTER TABLE memory ADD COLUMN key TEXT');
  // Immune system v0 columns, added in place to this LOCAL file.
  const have = new Set(cols.map((col) => String(col.name)));
  const TAINT_COLUMNS: ReadonlyArray<readonly [string, string]> = [
    ['provenance', 'TEXT'],
    ['source', 'TEXT'],
    ['quarantined', 'INTEGER NOT NULL DEFAULT 0'],
    ['quarantine_reason', 'TEXT'],
    ['released_by', 'TEXT'],
    ['released_at', 'TEXT'],
    ['source_sha256', 'TEXT'],
  ];
  for (const [name, type] of TAINT_COLUMNS) {
    if (!have.has(name)) db.exec(`ALTER TABLE memory ADD COLUMN ${name} ${type}`);
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS memory_key_unique ON memory(key) WHERE key IS NOT NULL');
  // FAIL CLOSED ON UPGRADE. A note with no provenance was saved before taint labels existed, by the
  // CLI or by an MCP caller, and nothing says which. It is quarantined as untrusted, never read as
  // trusted. Idempotent: every write since sets provenance, so this touches only pre-v0 notes.
  db.prepare(
    "UPDATE memory SET provenance = 'untrusted', source = 'legacy', quarantined = 1, quarantine_reason = ? WHERE kind = 'note' AND key IS NULL AND provenance IS NULL",
  ).run(LEGACY_REASON);
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
    // `node:sqlite` is a built-in from Node 22.5. On older Node the require itself throws, and a bare
    // "NOT_CHECKED <path>" gives a stranger no way to tell that from a bad path or a locked file.
    if ((err as { code?: string } | null)?.code === 'ERR_UNKNOWN_BUILTIN_MODULE') {
      throw new Error(`NOT_CHECKED ${path} (node:sqlite is not in this Node; local memory needs Node 22.5 or newer)`);
    }
    throw new Error(`NOT_CHECKED ${path}`);
  }
}

function fileSalt(db: SqliteDb, create: boolean): Buffer | null {
  const row = db.prepare("SELECT v FROM memory_meta WHERE k = 'salt'").get();
  if (row) return Buffer.from(String(row.v), 'base64');
  if (!create) return null;
  const salt = newSalt();
  db.prepare("INSERT INTO memory_meta (k, v) VALUES ('salt', ?)").run(salt.toString('base64'));
  return salt;
}

/**
 * How a body is written. Plain unless TRUSTSHELL_MEMORY_ENCRYPT is on; on with no key THROWS before
 * anything is written, so a note is never stored in plain text while the setting says encrypted.
 */
function sealer(db: SqliteDb, env: NodeJS.ProcessEnv): (body: string) => string {
  if (!encryptionEnabled(env)) return (body) => body;
  const password = memoryPassword(env);
  if (!password) {
    throw new Error('NOT_CHECKED TRUSTSHELL_MEMORY_KEY missing: TRUSTSHELL_MEMORY_ENCRYPT is on, so nothing was written');
  }
  const key = deriveKey(password, fileSalt(db, true) as Buffer);
  return (body) => seal(body, key);
}

type Opened = { body: string; readable: boolean; reason?: 'no-key' | 'wrong-key' };

/** How a body is read. The key is derived at most once, and only if a sealed row is met. */
function opener(db: SqliteDb, env: NodeJS.ProcessEnv): (body: string) => Opened {
  let key: Buffer | null | undefined;
  return (body) => {
    if (!isSealed(body)) return { body, readable: true };
    if (key === undefined) {
      const password = memoryPassword(env);
      const salt = fileSalt(db, false);
      key = password && salt ? deriveKey(password, salt) : null;
    }
    if (!key) return { body: SEALED_NO_KEY, readable: false, reason: 'no-key' };
    try {
      return { body: unseal(body, key), readable: true };
    } catch {
      return { body: SEALED_WRONG_KEY, readable: false, reason: 'wrong-key' };
    }
  };
}

function asRow(row: Record<string, unknown>): MemoryRow {
  const out: MemoryRow = {
    id: Number(row.id),
    kind: row.kind as MemoryKind,
    body: String(row.body),
    created_at: String(row.created_at),
  };
  if ('quarantined' in row) {
    // Never default to trusted: a missing label is untrusted (ensureSchema has already quarantined it).
    out.provenance = (row.provenance as Provenance | null) ?? 'untrusted';
    out.source = (row.source as string | null) ?? 'legacy';
    out.quarantined = Number(row.quarantined) === 1;
    out.quarantine_reason = (row.quarantine_reason as string | null) ?? null;
    out.released_by = (row.released_by as string | null) ?? null;
    out.released_at = (row.released_at as string | null) ?? null;
    out.source_sha256 = (row.source_sha256 as string | null) ?? null;
  }
  return out;
}

const FULL_COLS =
  'id, kind, body, created_at, provenance, source, quarantined, quarantine_reason, released_by, released_at, source_sha256';

export function insertMemory(
  path: string,
  kind: MemoryKind,
  body: string,
  now: string = new Date().toISOString(),
  env: NodeJS.ProcessEnv = process.env,
  taint: ProvenanceInput = { provenance: 'trusted', source: 'operator', quarantined: false },
): MemoryRow {
  const db = openDb(path);
  try {
    const stored = sealer(db, env)(body);
    const result = db
      .prepare(
        'INSERT INTO memory (kind, body, created_at, provenance, source, quarantined, quarantine_reason, source_sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
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
  } finally {
    db.close();
  }
}

/**
 * Notes in insert order. A sealed note that cannot be opened reads as a placeholder line, never ciphertext.
 * QUARANTINED NOTES ARE LEFT OUT unless `includeQuarantined` is set: untrusted text does not reach a
 * reader of recall until a check releases it.
 */
export function listNotes(
  path: string,
  env: NodeJS.ProcessEnv = process.env,
  opts: { includeQuarantined?: boolean } = {},
): MemoryRow[] {
  const db = openDb(path);
  try {
    const open = opener(db, env);
    const where = opts.includeQuarantined ? '' : ' AND quarantined = 0';
    return db
      .prepare(`SELECT ${FULL_COLS} FROM memory WHERE kind = 'note' AND key IS NULL${where} ORDER BY id ASC`)
      .all()
      .map(asRow)
      .map((row) => ({ ...row, body: open(row.body).body }));
  } finally {
    db.close();
  }
}

/** Notes still in quarantine, oldest first. */
export function listQuarantinedRows(path: string, env: NodeJS.ProcessEnv = process.env): MemoryRow[] {
  return listNotes(path, env, { includeQuarantined: true }).filter((row) => row.quarantined);
}

export function countQuarantined(path: string): number {
  const db = openDb(path);
  try {
    const row = db.prepare("SELECT COUNT(*) AS n FROM memory WHERE kind = 'note' AND quarantined = 1").get();
    return Number(row?.n ?? 0);
  } finally {
    db.close();
  }
}

/** One note by id, with its taint record, or null. */
export function getNote(path: string, id: number, env: NodeJS.ProcessEnv = process.env): MemoryRow | null {
  const db = openDb(path);
  try {
    const row = db.prepare(`SELECT ${FULL_COLS} FROM memory WHERE id = ? AND kind = 'note' AND key IS NULL`).get(id);
    if (!row) return null;
    const r = asRow(row);
    return { ...r, body: opener(db, env)(r.body).body };
  } finally {
    db.close();
  }
}

/**
 * Release one quarantined note: provenance becomes `verified` (a check passed) or `trusted` (the
 * operator vouched), and `released_by` records which. Only a row that is still quarantined changes;
 * the return says whether one did.
 */
export function markReleased(
  path: string,
  id: number,
  releasedBy: string,
  now: string = new Date().toISOString(),
  provenance: 'verified' | 'trusted' = 'verified',
): boolean {
  const db = openDb(path);
  try {
    const before = db.prepare('SELECT quarantined FROM memory WHERE id = ?').get(id);
    if (!before || Number(before.quarantined) !== 1) return false;
    db.prepare(
      'UPDATE memory SET quarantined = 0, provenance = ?, released_by = ?, released_at = ?, quarantine_reason = NULL WHERE id = ? AND quarantined = 1',
    ).run(provenance, releasedBy, now, id);
    return true;
  } finally {
    db.close();
  }
}

/** Record why a quarantined note stays held (a failed check). It stays quarantined. */
export function setQuarantineReason(path: string, id: number, reason: string): void {
  const db = openDb(path);
  try {
    db.prepare('UPDATE memory SET quarantine_reason = ? WHERE id = ? AND quarantined = 1').run(reason, id);
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

/**
 * Notes in insert order, then a count. do_not_send bodies are not included.
 * Quarantined notes are left out, and when any exist a last line says how many, so nothing is
 * hidden silently. With `includeQuarantined` they are printed, each marked [QUARANTINED: reason],
 * except injection-looking text, which is described and never printed (the same rule as list/explain).
 */
export function formatRecall(
  path: string,
  env: NodeJS.ProcessEnv = process.env,
  opts: { includeQuarantined?: boolean } = {},
): string {
  const rows = listNotes(path, env, { includeQuarantined: opts.includeQuarantined });
  const notes = rows.map((row) => {
    if (!row.quarantined) return row.body;
    const mark = `[QUARANTINED: ${row.quarantine_reason ?? 'untrusted, not yet checked'}]`;
    return heldAsInjection(row) ? `${mark} ${INJECTION_WITHHELD}` : `${mark} ${row.body}`;
  });
  const lines = [...notes, `do_not_send COUNT ${countDoNotSend(path)}`];
  const held = countQuarantined(path);
  if (held > 0 && !opts.includeQuarantined) lines.push(`quarantined COUNT ${held} (trustshell quarantine list)`);
  return lines.join('\n');
}

/** One value under key. A later write of the same key replaces the row. */
export function writeKeyed(
  path: string,
  key: string,
  body: string,
  now: string = new Date().toISOString(),
  env: NodeJS.ProcessEnv = process.env,
): void {
  const db = openDb(path);
  try {
    const stored = sealer(db, env)(body);
    db.prepare('DELETE FROM memory WHERE key = ?').run(key);
    db.prepare('INSERT INTO memory (kind, body, created_at, key) VALUES (?, ?, ?, ?)').run(
      'pref',
      stored,
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
 * A sealed value that cannot be opened THROWS: a placeholder returned here would be read by a
 * script as the value itself.
 */
export function readKeyed(path: string, key: string, env: NodeJS.ProcessEnv = process.env): string {
  const db = openDb(path);
  try {
    const row = db.prepare('SELECT body FROM memory WHERE key = ?').get(key);
    if (!row) return 'NOT_CHECKED';
    const opened = opener(db, env)(String(row.body ?? ''));
    if (!opened.readable) {
      throw new Error(
        opened.reason === 'wrong-key'
          ? 'NOT_CHECKED TRUSTSHELL_MEMORY_KEY does not open this value'
          : 'NOT_CHECKED this value is encrypted: set TRUSTSHELL_MEMORY_KEY to read it',
      );
    }
    const body = opened.body;
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
