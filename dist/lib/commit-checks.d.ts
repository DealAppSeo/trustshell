export interface CommitChecks {
    head_sha: string;
    /** When the first read started; `retrieved_at` is when the last one ended (XC1 F5). */
    started_at: string;
    retrieved_at: string;
    /**
     * How the base branch (whose required checks apply) and the change's files were found (XC1 F1/F2):
     *   associated  the pull requests GitHub associates with this commit (their bases, their whole diffs)
     *   head        a pull-request run whose PR GitHub does not associate (a fork), found by its head branch
     *   push        a push or other non-PR run: the branch it ran on, and this commit's own diff
     *   unresolved  a pull-request run whose PR could not be found: required checks and files are unknown
     */
    base: {
        how: 'associated' | 'head' | 'push' | 'unresolved';
        branches: string[];
    };
    /** The latest run of each check run, with the id of the app that ran it. */
    check_runs: {
        total_count: number;
        items: {
            name: string;
            status: string;
            conclusion: string | null;
            app_id: number | null;
        }[];
    };
    statuses: {
        total_count: number;
        items: {
            context: string;
            state: string;
        }[];
    };
    /** One suite per app and event. Installed apps that never act leave queued suites with no runs. */
    suites: {
        total_count: number;
        items: {
            app: string;
            status: string;
            conclusion: string | null;
            runs: number;
        }[];
    } | null;
    /** Failed check runs a later attempt replaced, plus statuses that failed and later passed. */
    superseded_failures: number | null;
    /**
     * Checks the base branch requires, from its rulesets and its classic branch protection. `app_id`
     * pins a check to one app: only that app's check run meets it, never a status.
     */
    required: {
        context: string;
        app_id: number | null;
    }[] | null;
    /** Rules on the base branch that gate merging on something this does not read (required workflows, code scanning, deployments). */
    unsupported_rules: string[] | null;
    /** Whether the change edits .github/workflows. */
    workflows_changed: boolean | null;
    /** Every API path read, with its HTTP status, in order. */
    sources: {
        path: string;
        status: number;
    }[];
}
/**
 * Read every check on `sha` in `owner/repo`. Never throws for an API answer: a failed read becomes
 * `null` (or an empty, incomplete list), which makes the claim NOT_CHECKED. The network error of an
 * unreachable API does propagate, as it does for `check`.
 */
export declare function fetchCommitChecks(owner: string, repo: string, sha: string, env?: Record<string, string | undefined>, now?: () => Date, run?: {
    event: string | null;
    head_branch: string | null;
    head_owner: string | null;
}): Promise<CommitChecks>;
