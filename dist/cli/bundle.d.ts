type IO = {
    out: (s: string) => void;
    err: (s: string) => void;
};
export declare const BUNDLE_USAGE = "trustshell bundle export <file> [--force]\ntrustshell bundle verify <file> [--signer <fingerprint>] [--json]\ntrustshell bundle context <file> [--signer <fingerprint>]\ntrustshell bundle import <file> [--signer <fingerprint>] [--force] [--json]";
export interface BundleArgs {
    verb: 'export' | 'verify' | 'import' | 'context';
    file: string;
    signer?: string;
    force: boolean;
    json: boolean;
}
/** PURE. A flag that does not belong to the verb is refused, never ignored. */
export declare function parseBundleArgs(argv: string[]): BundleArgs | {
    error: string;
};
export declare function runBundle(argv: string[], io: IO, env?: NodeJS.ProcessEnv): number;
export {};
