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
    /**
     * The run facts the verdict above was computed from, as GitHub sent them. Additive, so that
     * `check --claims` can map a claim onto a FIELD rather than onto the card's sentences. A field
     * GitHub did not send is null or '', never guessed.
     */
    run: {
        id: number | null;
        attempt: number | null;
        workflow: string;
        workflow_path: string;
        status: string;
        conclusion: string | null;
    };
    /** What the jobs endpoint returned. `items` holds the jobs actually read, which may be fewer than `total`. */
    jobs: {
        http_status: number;
        total: number;
        items: CheckJob[];
    };
}
export interface CheckJob {
    name: string;
    status: string;
    conclusion: string | null;
    head_sha: string;
    run_attempt: number | null;
}
/** Parse a GitHub Actions run URL. PURE — no I/O, so URL handling is testable. */
export declare function parseRun(url: string): ParsedRun | null;
/**
 * The sentences this command refuses to let a reader forget. A card that only
 * says "✓ passed" is the failure this whole product exists to prevent.
 */
export declare const DOES_NOT_PROVE: string[];
/**
 * One GitHub GET for other read-only modules (`check --claims --guided` reads every check on a
 * commit), with the same rule as `check`: the token in `GITHUB_TOKEN` is optional, only raises the
 * rate limit, and a rejected one falls back to anonymous. `path` starts with `/repos/`.
 */
export declare function githubGet(path: string, env?: Record<string, string | undefined>): Promise<{
    ok: boolean;
    status: number;
    body: any;
}>;
/**
 * Pluralise a counted noun. The card is the artefact people are shown; "1 jobs"
 * on a tool whose subject is careful claims reads as carelessness about the
 * rest.
 */
export declare function plural(n: number, singular: string, pluralForm?: string): string;
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
export declare function runCheck(url: string, env?: Record<string, string | undefined>): Promise<CheckResult>;
/**
 * Verdict → process exit code. PURE.
 *
 * INCONCLUSIVE is deliberately NOT 0. `bin/check.js` exited 0 for every verdict
 * it could compute, which made "we could not read the jobs" and "every job
 * passed" the same observable outcome for any script branching on it — the
 * exact NOT_CHECKED-scored-as-PASS defect this repo keeps paying for.
 */
export declare function checkExitCode(verdict: CheckVerdict): number;
