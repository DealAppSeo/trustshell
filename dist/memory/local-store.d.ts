export type MemoryKind = 'note' | 'pref' | 'do_not_send';
export type MemoryRow = {
    id: number;
    kind: MemoryKind;
    body: string;
    created_at: string;
};
export declare function memoryDbPath(env?: NodeJS.ProcessEnv, home?: string): string;
export declare function insertMemory(path: string, kind: MemoryKind, body: string, now?: string, env?: NodeJS.ProcessEnv): MemoryRow;
/** Notes in insert order. A sealed note that cannot be opened reads as a placeholder line, never ciphertext. */
export declare function listNotes(path: string, env?: NodeJS.ProcessEnv): MemoryRow[];
export declare function countDoNotSend(path: string): number;
/** Notes in insert order, then a count. do_not_send bodies are not included. */
export declare function formatRecall(path: string, env?: NodeJS.ProcessEnv): string;
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
