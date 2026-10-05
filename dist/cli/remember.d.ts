/**
 * True when a value carries a secret shape and must not be stored. Uses the same detector as the
 * outbound scrubber (containsSecret), so a key the checkers would never see is not written to
 * disk either: until 2026-10-05 this list was narrower and stored `sk-…` and `AKIA…` keys.
 * Personal data such as an email is NOT refused: local memory is the place for it.
 */
export declare function refusedValue(value: string): boolean;
export declare function rememberNote(text: string, env?: NodeJS.ProcessEnv): void;
/**
 * Save one value under key in the same local file.
 * A secret-shaped value is refused and nothing is written. No network.
 */
export declare function rememberKey(key: string, value: string, env?: NodeJS.ProcessEnv): boolean;
