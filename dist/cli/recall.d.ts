export declare function recallNotes(env?: NodeJS.ProcessEnv, opts?: {
    includeQuarantined?: boolean;
}): string;
/** The value for key, or NOT_CHECKED. Never an empty string. No network. */
export declare function recallKey(key: string, env?: NodeJS.ProcessEnv): string;
