/**
 * `trustshell check` — verify a GitHub Actions run from the public API.
 * ------------------------------------------------------------------
 * The one command that needs NO account, NO key and NO backend: it asks
 * api.github.com what it can confirm about a run, prints that, and is explicit
 * about what it cannot confirm.
 *
 * EGRESS: `api.github.com` and nothing else. No telemetry, no upload, no
 * TrustShell backend. The whole point is that a sceptic can run it against
 * someone else's repo and owe nobody an account.
 *
 * This logic lives here, not in `bin/check.js`, for one mechanical reason:
 * `package.json` `files[]` publishes `dist/` only, so anything under `bin/` is
 * absent from the npm tarball. `npx @hyperdag/trustshell check <url>` — the
 * command the launch invite tells people to run — can only work if the code is
 * reachable from `dist/`. `bin/check.js` is kept as a thin shim over this.
 */
/** What GitHub could confirm. Three outcomes, never two — INCONCLUSIVE is not a pass. */
export type CheckVerdict = 'COMPLETE' | 'INCONSISTENT' | 'FAILED' | 'INCONCLUSIVE';
export interface ParsedRun {
    owner: string;
    repo: string;
    runId: string;
}
export interface CheckResult {
    verdict: CheckVerdict;
    source: string;
    freshness: 'LIVE';
    host: 'api.github.com';
    owner: string;
    repo: string;
    branch: string;
    sha: string;
    title: string;
    /** Whether the request was made with a token. Anonymous is the supported default. */
    authenticated: boolean;
    checks: {
        ok: boolean | null;
        label: string;
        detail: string;
    }[];
    does_not_prove: string[];
}
/** Parse a GitHub Actions run URL. PURE — no I/O, so URL handling is testable. */
export declare function parseRun(url: string): ParsedRun | null;
/**
 * The sentences this command refuses to let a reader forget. A card that only
 * says "✓ passed" is the failure this whole product exists to prevent.
 */
export declare const DOES_NOT_PROVE: string[];
/** Render the human card. PURE — takes a result, returns text. */
export declare function formatCheckCard(r: CheckResult): string;
/**
 * Ask GitHub about a run.
 *
 * Throws {@link CheckError} for a usage problem or an unreachable API; every
 * other outcome is a verdict, including the ones that are bad news.
 */
export declare class CheckError extends Error {
    readonly usage: boolean;
    constructor(message: string, usage?: boolean);
}
export declare function runCheck(url: string, env?: NodeJS.ProcessEnv): Promise<CheckResult>;
/**
 * Verdict → process exit code. PURE.
 *
 * INCONCLUSIVE is deliberately NOT 0. `bin/check.js` exited 0 for every verdict
 * it could compute, which made "we could not read the jobs" and "every job
 * passed" the same observable outcome for any script branching on it — the
 * exact NOT_CHECKED-scored-as-PASS defect this repo keeps paying for.
 */
export declare function checkExitCode(verdict: CheckVerdict): number;
