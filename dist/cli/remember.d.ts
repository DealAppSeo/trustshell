/** True when a value carries a secret shape and must not be stored. */
export declare function refusedValue(value: string): boolean;
export declare function rememberNote(text: string, env?: NodeJS.ProcessEnv): void;
/**
 * Save one value under key in the same local file.
 * A secret-shaped value is refused and nothing is written. No network.
 */
export declare function rememberKey(key: string, value: string, env?: NodeJS.ProcessEnv): boolean;
