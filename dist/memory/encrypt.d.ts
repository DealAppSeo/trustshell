/** Every sealed body starts with this, so a reader can tell a sealed row from a plain one. */
export declare const SEALED_PREFIX = "tsenc:v1:";
/** Shown in place of a sealed note that cannot be opened. Never the ciphertext. */
export declare const SEALED_NO_KEY = "[encrypted note: set TRUSTSHELL_MEMORY_KEY to read it]";
export declare const SEALED_WRONG_KEY = "[encrypted note: TRUSTSHELL_MEMORY_KEY does not open it]";
export declare function encryptionEnabled(env?: NodeJS.ProcessEnv): boolean;
export declare function isSealed(body: string): boolean;
/** The memory password, or null when unset or blank. */
export declare function memoryPassword(env?: NodeJS.ProcessEnv): string | null;
/** A new random salt for one memory file. */
export declare function newSalt(): Buffer;
/** 32-byte key from the password and that file's salt. Slow on purpose (scrypt). */
export declare function deriveKey(password: string, salt: Buffer): Buffer;
/** Seal one body. The output is ASCII and always starts with {@link SEALED_PREFIX}. */
export declare function seal(body: string, key: Buffer): string;
/** Open one sealed body. Throws NOT_CHECKED on a malformed body, a wrong key or tampering. */
export declare function unseal(body: string, key: Buffer): string;
/**
 * Seal a body for writing when the flag is on, else return it unchanged. `salt` is the memory
 * file's salt. With the flag on and no password this THROWS: nothing is written in plain text.
 */
export declare function encryptMemory(body: string, env?: NodeJS.ProcessEnv, salt?: Buffer): string;
/**
 * Read a stored body. Plain text comes back unchanged. A sealed body opens with the password,
 * whatever the flag says; without one, or with the wrong one, the caller gets a placeholder line,
 * never the ciphertext.
 */
export declare function decryptMemory(body: string, env?: NodeJS.ProcessEnv, salt?: Buffer): string;
