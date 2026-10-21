/** A quarantine reason that starts with this marks injection-looking text: described, never printed. */
export declare const INJECTION_PREFIX = "injection-looking text";
/** What is printed in place of injection-looking text. */
export declare const INJECTION_WITHHELD = "[text withheld: injection-looking text is described, never printed]";
/** Why a note saved before taint labels is held: nothing recorded who wrote it. */
export declare const LEGACY_REASON = "legacy: saved before taint labels, so who wrote it is unknown";
/**
 * True when a quarantined note's text must be withheld and can never be released by a check: its
 * reason says injection, OR its readable body screens as injection now (src/lib/ingest.ts). The
 * second clause covers notes no screen ever saw: legacy rows, and encrypted rows read with the key.
 */
export declare function heldAsInjection(row: Pick<MemoryRow, 'body' | 'quarantine_reason'>): boolean;
/**
 * note / pref / do_not_send are the original kinds. The learning loop (src/learn) adds two of its
 * own, so its rows can never be read as notes: `listNotes`, `formatRecall`, `countQuarantined` and the
 * quarantine commands select kind = 'note' only.
 *   lesson  a correction, verbatim, in the person's words. Written untrusted + quarantined; only
 *           `trustshell learn accept` releases it (src/learn/store.ts).
 *   learn   the person's other learn text: a job line, an attempt, a probe criterion.
 */
export type MemoryKind = 'note' | 'pref' | 'do_not_send' | 'lesson' | 'learn';
/**
 * Taint label (immune system v0). Where an entry came from, as far as this file can know it:
 *   trusted    the operator vouched for it (`remember --trusted`, or `quarantine release --trusted`)
 *   untrusted  anything else (an MCP tool call, a web page, another agent): held in quarantine
 *   grounded   was untrusted; released because the note was found in the source document recorded
 *              with it. Whoever recorded the note also supplied that document, so this is NOT a
 *              check the recorder could not satisfy alone.
 *   verified   was untrusted; released by a check the caller cannot satisfy alone (HAL: two checkers
 *              of two model families on the default endpoint)
 * Rows written before this column existed are UNTRUSTED, source `legacy`, and quarantined: they came
 * from the CLI or MCP `remember`, and nothing recorded which, so the file does not guess "trusted".
 */
export type Provenance = 'trusted' | 'untrusted' | 'grounded' | 'verified';
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
/**
 * Does this CREATE TABLE text already admit every kind? Reads the actual `CHECK (kind IN (...))` list
 * and compares it as a set, rather than looking for one word anywhere in the text. A table with no
 * CHECK on kind admits any kind, so it needs no rebuild.
 */
export declare function admitsLearnKinds(createSql: string): boolean;
type Statement = {
    run(...params: unknown[]): {
        lastInsertRowid: number | bigint;
    };
    all(...params: unknown[]): Record<string, unknown>[];
    get(...params: unknown[]): Record<string, unknown> | undefined;
};
type SqliteDb = {
    exec(sql: string): void;
    prepare(sql: string): Statement;
    close(): void;
};
export declare function memoryDbPath(env?: NodeJS.ProcessEnv, home?: string): string;
export declare function insertMemory(path: string, kind: MemoryKind, body: string, now?: string, env?: NodeJS.ProcessEnv, taint?: ProvenanceInput): MemoryRow;
/**
 * insertMemory on a handle the caller already holds, so src/learn can write the memory row and its own
 * learn_* row in ONE transaction on one connection. Same sealing, same taint columns. The taint is
 * required here: a learn write always says where its text came from.
 */
export declare function insertRow(db: SqliteDb, kind: MemoryKind, body: string, now: string, env: NodeJS.ProcessEnv, taint: ProvenanceInput): MemoryRow;
/**
 * Notes in insert order. A sealed note that cannot be opened reads as a placeholder line, never ciphertext.
 * QUARANTINED NOTES ARE LEFT OUT unless `includeQuarantined` is set: untrusted text does not reach a
 * reader of recall until a check releases it.
 */
export declare function listNotes(path: string, env?: NodeJS.ProcessEnv, opts?: {
    includeQuarantined?: boolean;
}): MemoryRow[];
/** Notes still in quarantine, oldest first. */
export declare function listQuarantinedRows(path: string, env?: NodeJS.ProcessEnv): MemoryRow[];
export declare function countQuarantined(path: string): number;
/** One note by id, with its taint record, or null. */
export declare function getNote(path: string, id: number, env?: NodeJS.ProcessEnv): MemoryRow | null;
/**
 * Release one quarantined note: provenance becomes `verified` (HAL), `grounded` (found in the
 * recorder-supplied source) or `trusted` (the operator vouched), and `released_by` records which.
 * Only a row that is still quarantined changes; the return says whether one did.
 */
export declare function markReleased(path: string, id: number, releasedBy: string, now?: string, provenance?: 'verified' | 'grounded' | 'trusted'): boolean;
/** markReleased on a handle the caller holds (one transaction with a learn_* write). */
export declare function releaseRow(db: SqliteDb, id: number, releasedBy: string, now: string, provenance: 'verified' | 'grounded' | 'trusted'): boolean;
/**
 * Put a released learn row back in quarantine, with why (a declined or retired lesson). Only kinds
 * `lesson` and `learn`: notes are released and held by the quarantine commands, never from here.
 */
export declare function requarantineRow(db: SqliteDb, id: number, reason: string): void;
/** Record why a quarantined note stays held (a failed check). It stays quarantined. */
export declare function setQuarantineReason(path: string, id: number, reason: string): void;
export declare function countDoNotSend(path: string): number;
/**
 * Notes in insert order, then a count. do_not_send bodies are not included.
 * Quarantined notes are left out, and when any exist a last line says how many, so nothing is
 * hidden silently. With `includeQuarantined` they are printed, each marked [QUARANTINED: reason].
 * Injection-looking text is described and never printed, whatever the row's label: a `--trusted`
 * note gets the same screen as a quarantined one (the same rule as list/explain).
 */
export declare function formatRecall(path: string, env?: NodeJS.ProcessEnv, opts?: {
    includeQuarantined?: boolean;
}): string;
/** One value under key. A later write of the same key replaces the row. */
export declare function writeKeyed(path: string, key: string, body: string, now?: string, env?: NodeJS.ProcessEnv): void;
/**
 * The stored value, or NOT_CHECKED when the key is absent.
 * A blank body is NOT_CHECKED so a missing value is never "".
 * A sealed value that cannot be opened THROWS: a placeholder returned here would be read by a
 * script as the value itself.
 */
export declare function readKeyed(path: string, key: string, env?: NodeJS.ProcessEnv): string;
/** Delete the row for key. Missing is NOT_CHECKED, not an empty success. */
export declare function deleteKeyed(path: string, key: string): 'redacted' | 'NOT_CHECKED';
/**
 * The open handle, for src/learn/store.ts and its own learn_* tables in this same file (same path,
 * same owner-only mode, same NOT_CHECKED errors). That module never reads the memory table through
 * it: memory rows are read with readRows, and only `injectable` decides what may reach a model.
 */
export declare function openMemoryDb(path: string, opts?: {
    copyFile?: (from: string, to: string) => void;
}): SqliteDb;
export type { SqliteDb };
/** What `learn accept` writes into released_by. A lesson row without it was never accepted. */
export declare const LESSON_ACCEPTED = "learn accept: the person accepted this lesson";
/**
 * Rows by id, any kind, with the taint record and the body opened (a sealed body that cannot be
 * opened reads as its placeholder, never ciphertext). Quarantined rows are INCLUDED so the learn
 * commands can say why a row is held: a caller that sends text to a model filters with `injectable`.
 */
export declare function readRows(path: string, ids: readonly number[], env?: NodeJS.ProcessEnv): MemoryRow[];
/**
 * May this row's text go into a model's context? Only the person's own words, released by the person:
 *   lesson  not quarantined, trusted, and released by `learn accept` (LESSON_ACCEPTED). A row inserted
 *           without taint defaults to trusted but carries no such release, so it stays out.
 *   learn   the person's own CLI text (an attempt): trusted and not quarantined.
 * Both: readable (not a sealed placeholder) and not injection-looking now (the formatRecall screen).
 */
export declare function injectable(row: MemoryRow): boolean;
/**
 * The notes an owner may select for `trustshell bundle export`, by id: kind note, not keyed, RELEASED (not
 * quarantined) and not encrypted. A sealed body is never opened for a bundle (a bundle is plain JSON), so an
 * encrypted note is listed in `encrypted` and never in `notes`. Quarantined ids are listed too, so the
 * caller can say why a selected id was refused.
 */
export declare function selectableNotes(path: string): {
    notes: {
        id: number;
        body: string;
        created_at: string;
    }[];
    quarantined: number[];
    encrypted: number[];
};
