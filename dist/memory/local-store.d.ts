export type MemoryKind = 'note' | 'pref' | 'do_not_send';
export type MemoryRow = {
    id: number;
    kind: MemoryKind;
    body: string;
    created_at: string;
};
export declare function memoryDbPath(env?: NodeJS.ProcessEnv, home?: string): string;
export declare function insertMemory(path: string, kind: MemoryKind, body: string, now?: string): MemoryRow;
export declare function listNotes(path: string): MemoryRow[];
export declare function countDoNotSend(path: string): number;
/** Notes in insert order, then a count. do_not_send bodies are not included. */
export declare function formatRecall(path: string): string;
/** One value under key. A later write of the same key replaces the row. */
export declare function writeKeyed(path: string, key: string, body: string, now?: string): void;
/**
 * The stored value, or NOT_CHECKED when the key is absent.
 * A blank body is NOT_CHECKED so a missing value is never "".
 */
export declare function readKeyed(path: string, key: string): string;
/** Delete the row for key. Missing is NOT_CHECKED, not an empty success. */
export declare function deleteKeyed(path: string, key: string): 'redacted' | 'NOT_CHECKED';
