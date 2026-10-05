/** Shared with remember refusal. Token bodies are assumed to be at least 8 characters. */
export declare const PREFIXED_TOKEN: RegExp;
/**
 * True when the value carries a CREDENTIAL shape (not merely personal data). `remember` refuses
 * these: local memory is plain text on disk, and a key stored there is a key on disk.
 */
export declare function containsSecret(value: string): boolean;
export declare function redact(value: string): string;
