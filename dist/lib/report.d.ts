/**
 * `trustshell report` — put the inside and outside evidence side by side.
 * ------------------------------------------------------------------------
 * `inspect` says what the agent's own log supports. `check` says what GitHub can
 * confirm. `report` states what the two TOGETHER support, and names where they
 * disagree.
 *
 * EGRESS: none, and this is enforced rather than promised — `report` takes its
 * external evidence as a FILE the operator already produced with `check --json`.
 * It has no fetch, no client and no URL parameter. That is why "what left my
 * machine" stays answerable by reading one row of the egress table.
 */
import type { InspectResult } from './inspect';
import type { Profile } from './profile';
/**
 * CONFIRMED 0 · INCONSISTENT 1 · UNSUPPORTED 3.
 *
 * The word is INCONSISTENT, never "contradicted". Two records disagreeing is a
 * fact about the records. "Contradicted" reads as a finding about the agent's
 * honesty, which this tool cannot establish and must not imply.
 */
export type ReportVerdict = 'CONFIRMED' | 'INCONSISTENT' | 'UNSUPPORTED';
/** The subset of `check --json` output this consumes. Deliberately narrow. */
export interface EvidenceDoc {
    verdict?: string;
    owner?: string;
    repo?: string;
    branch?: string;
    sha?: string;
    title?: string;
    host?: string;
    authenticated?: boolean;
}
export interface ReportInput {
    session: InspectResult | null;
    evidence: EvidenceDoc | null;
    profile: Profile;
}
export interface ReportResult {
    verdict: ReportVerdict;
    reason: string;
    session: {
        present: boolean;
        verdict: string | null;
        entries: number;
        path: string | null;
    };
    evidence: {
        present: boolean;
        verdict: string | null;
        repo: string | null;
        sha: string | null;
    };
    /** Included ONLY when the matching share_* flag is true. Absent otherwise — not empty-string. */
    identity?: string;
    context?: string;
    withheld: string[];
    does_not_prove: string[];
}
/**
 * PURE. The whole decision, in one readable table of cases.
 *
 * CONFIRMED is the narrowest case on purpose: it needs BOTH an intact local
 * chain and an external run that actually completed. Everything we cannot
 * establish lands on UNSUPPORTED, which exits 3 — the NOT CHECKED code shared
 * with `check`'s INCONCLUSIVE and `inspect`'s UNCHAINED.
 */
export declare function decide(session: InspectResult | null, evidence: EvidenceDoc | null): {
    verdict: ReportVerdict;
    reason: string;
};
export declare function reportLimits(v: ReportVerdict): string[];
/**
 * Build the report. Identity and context are included ONLY when the matching
 * share flag is true, and every omission is NAMED in `withheld` rather than
 * silently dropped — a reader must be able to tell "nothing was set" from
 * "something was set and not shared".
 */
export declare function buildReport(input: ReportInput): ReportResult;
export declare function reportExitCode(v: ReportVerdict): number;
export declare function formatReportCard(r: ReportResult): string;
