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
export type MemoryKind = 'note' | 'pref' | 'do_not_send';
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
export declare function memoryDbPath(env?: NodeJS.ProcessEnv, home?: string): string;
export declare function insertMemory(path: string, kind: MemoryKind, body: string, now?: string, env?: NodeJS.ProcessEnv, taint?: ProvenanceInput): MemoryRow;
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
