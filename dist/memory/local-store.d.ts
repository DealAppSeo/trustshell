export type MemoryKind = 'note' | 'pref' | 'do_not_send';
/**
 * Taint label (immune system v0). Where an entry came from, as far as this file can know it:
 *   trusted    written by the operator (the CLI's `remember`, or SDK code that says so)
 *   untrusted  anything else (an MCP tool call, a web page, another agent): held in quarantine
 *   verified   was untrusted, and a recorded check released it
 * Rows written before this column existed read as trusted, source `legacy`: they came from the
 * CLI or MCP `remember`, and nothing recorded which, so that is stated rather than guessed.
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
};
/** What a write says about where the text came from. Absent = trusted operator write. */
export type ProvenanceInput = {
    provenance: Provenance;
    source: string;
    quarantined: boolean;
    reason?: string | null;
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
 * Release one quarantined note: provenance becomes `verified` and `released_by` records the check.
 * Only a row that is still quarantined changes; the return says whether one did.
 */
export declare function markReleased(path: string, id: number, releasedBy: string, now?: string): boolean;
/** Record why a quarantined note stays held (a failed check). It stays quarantined. */
export declare function setQuarantineReason(path: string, id: number, reason: string): void;
export declare function countDoNotSend(path: string): number;
/**
 * Notes in insert order, then a count. do_not_send bodies are not included.
 * Quarantined notes are left out, and when any exist a last line says how many, so nothing is
 * hidden silently. With `includeQuarantined` they are printed, each marked [QUARANTINED: reason].
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
