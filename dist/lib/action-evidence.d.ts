/**
 * `trustshell check <run-url> --claims <file|text>` — map what an agent SAID onto what GitHub REPORTS.
 * ------------------------------------------------------------------
 * GitHub already shows a green check. What it does not show is whether the sentence an agent
 * wrote ("all tests pass, fixed in abc1234, production ready") is the sentence the run supports.
 * This file builds one minimal record that keeps those apart:
 *
 *   observation     what `check` read from api.github.com, field by field (PLATFORM_REPORTED)
 *   claims[]        each claim, the deterministic template that read it, and one of three
 *                   statuses: SUPPORTED, CONTRADICTED, NOT_CHECKED
 *   assurance       what kind of evidence this is, and what it is not
 *   does_not_prove  the sentences a reader must not lose
 *
 * NO LLM, NO NETWORK BEYOND `check`. Claim mapping is regular expressions over the claim text and
 * equality over observation fields. The only egress is `runCheck`'s, which is api.github.com.
 *
 * THE RULES THIS FILE EXISTS TO KEEP, each enforced below and pinned in tests/action-evidence.test.ts:
 *  - Never claim more than the evidence proves. Each claim is atomic, with its own verdict.
 *  - A claim no template can check is NOT_CHECKED with the reason written next to it. Never SUPPORTED.
 *  - A claim that conflicts with a field is CONTRADICTED, and the reason names both values.
 *  - A successful run supports "this workflow run succeeded" and nothing wider: not "all tests
 *    pass", not "all checks pass", not "the fix works". Those stay NOT_CHECKED.
 *  - An outcome is compared only when the text ties it to the inspected run by citing its commit or
 *    run id, and cites nothing that does not match.
 *  - A run that has not finished, or whose jobs were not all read, decides no outcome.
 *  - SUPPORTED is narrow. Its `scope` says exactly what matched and what that match does not cover.
 *  - The observation is GitHub reporting on its own run. It is labelled PLATFORM_REPORTED and is
 *    never presented as an independent grade.
 *  - No attestation is read, so cryptographic_integrity is NOT_CHECKED. The type allows nothing else,
 *    so it cannot be set to anything stronger without code that actually verifies one.
 *  - Text from outside (the claims, and names GitHub returns for someone else's repo) is never
 *    spliced into generated sentences. Those sentences interpolate only digits and hex.
 */
import { type CheckJob, type CheckResult, type CheckVerdict } from './check';
export declare const ACTION_EVIDENCE_SCHEMA: "dev.trustshell.action-evidence/0.1-draft";
export type ClaimStatus = 'SUPPORTED' | 'CONTRADICTED' | 'NOT_CHECKED';
export type TemplateId = 'gha.run_succeeded' | 'ci.all_checks_pass' | 'ci.tests_pass' | 'ci.build_unscoped' | 'git.head_sha' | 'gha.run_id' | 'gha.run_attempt' | 'excluded.completion' | 'excluded.security' | 'excluded.no_bugs' | 'excluded.readiness' | 'excluded.fix' | 'excluded.local_run' | 'excluded.test_count' | 'excluded.coverage' | 'excluded.deployment' | 'excluded.performance' | 'excluded.review' | 'unmapped' | 'truncated';
export interface Observation {
    platform: 'github-actions';
    host: 'api.github.com';
    /** Canonical run URL, rebuilt from the parsed parts rather than echoed from input. */
    url: string;
    owner: string;
    repo: string;
    run_id: number;
    run_attempt: number | null;
    workflow: {
        name: string;
        path: string;
    };
    head_sha: string;
    status: string;
    conclusion: string | null;
    /** `check`'s own verdict and result rows, unchanged. */
    check: {
        verdict: CheckVerdict;
        results: CheckResult['checks'];
    };
    jobs: {
        http_status: number;
        total: number;
        items: CheckJob[];
    };
    fetchedAt: string;
    freshness: 'LIVE';
}
export interface ClaimEntry {
    /** One atomic claim: the exact span a template matched, normalised (see {@link normalizeClaimText}). */
    claim: string;
    /** The sentence the claim came from, normalised. Equal to `claim` for an unmapped sentence. */
    sentence: string;
    template: TemplateId;
    status: ClaimStatus;
    /** JSON Pointers (RFC 6901) into this record: the observation fields the status rests on. */
    evidence_fields: string[];
    /** What the status covers — and, for SUPPORTED, what it does not. */
    scope: string;
    /** The concrete comparison, or why nothing was compared. */
    reason: string;
}
export interface ActionEvidenceRecord {
    schema: typeof ACTION_EVIDENCE_SCHEMA;
    observation: Observation;
    claims: ClaimEntry[];
    assurance: {
        /** No attestation is read in this version, so this is the only value the type permits. */
        cryptographic_integrity: 'NOT_CHECKED';
        /** A GitHub API answer is the platform describing its own run, not an independent grader. */
        observation: 'PLATFORM_REPORTED';
    };
    does_not_prove: string[];
}
export interface RecordDigest {
    algorithm: 'sha-256';
    canonicalization: 'RFC 8785';
    value: string;
}
/** SHA-256 over the RFC 8785 canonical form of the record. Detects later edits; says nothing about authorship. */
export declare function digestRecord(record: ActionEvidenceRecord): RecordDigest;
export declare const RECORD_DOES_NOT_PROVE: string[];
/** A clause longer than this is stored cut, with an ellipsis. Templates still read all of it. */
export declare const MAX_CLAIM_TEXT = 300;
/** Sentences after this many are not read one by one; a single NOT_CHECKED entry says how many. */
export declare const MAX_CLAIMS = 200;
/**
 * One pass over the code points: an unpaired surrogate becomes U+FFFD (it has no UTF-8 form, and
 * RFC 8785 refuses it), an invisible or reordering character is removed, and a C0/C1 control (a
 * terminal escape starts with one) becomes a space. Newlines survive only when asked for.
 */
export declare function cleanCodePoints(s: string, keepNewlines?: boolean): string;
/**
 * Replace unpaired surrogates with U+FFFD and change nothing else. Applied to every string GitHub
 * returns before it enters the record: one unpaired surrogate in a workflow name otherwise made the
 * RFC 8785 digest throw, so any repository could make every --claims check of its runs fail (XC1 L1).
 */
export declare function wellFormed(s: string): string;
/** Normalise one claim for storage: {@link canonicalText}, whitespace collapsed, cut at MAX_CLAIM_TEXT. */
export declare function normalizeClaimText(s: string): string;
/**
 * Split free text into claim sentences. PURE, and one pass over the lines.
 *
 * Skipped, because a reader of the rendered text does not see them as claims: fenced code, HTML
 * comment BLOCKS, headings, and unticked task-list items (`- [ ] tests pass` is a to-do). Kept but
 * marked: blockquoted lines, which are someone else's words.
 *
 * The rules follow CommonMark, because the failure to avoid is hiding text a reader can see (XC1
 * H1, H2):
 *  - A fence opens on a line of 3+ backticks or tildes, indented at most 3 spaces. A backtick
 *    fence's info string may not contain a backtick, so "```x``` more text" is prose, not a fence.
 *    It closes on the same character, at least as long, with nothing else on the line.
 *  - A comment is removed only as an HTML block: a line that starts with `<!--`, through the line
 *    holding `-->`. Text after the `-->` is kept. A `<!--` anywhere else (in a code span,
 *    mid-sentence) is text, and so is an opener with no `-->` anywhere after it.
 */
export declare function splitClaims(text: string): {
    clauses: string[];
    full: string[];
    quoted: boolean[];
    dropped: number;
};
/**
 * Map free claim text onto an observation. PURE: same text and observation, same entries, same order.
 *
 * Each sentence is judged on its own: its citations decide which run it is about (see
 * {@link Anchor}), and a sentence the templates did not read end to end decides nothing (see
 * {@link gateOf}). A green run is never evidence for a sentence about another commit, another
 * workflow, or nothing in particular.
 */
export declare function mapClaims(text: string, o: Observation): ClaimEntry[];
/** Build the observation from `check`'s result. PURE. */
export declare function observationFromCheck(r: CheckResult, fetchedAt: string): Observation;
/** Assemble the record. PURE. */
export declare function buildRecord(observation: Observation, claimText: string): ActionEvidenceRecord;
/**
 * The attempt a run URL names (`…/actions/runs/123/attempts/2`), if any. `parseRun` accepts such a
 * URL but the run endpoint always answers for the LATEST attempt, so a record built from it would
 * silently describe a different attempt from the one asked for.
 */
export declare function urlAttempt(url: string): number | null;
/**
 * Fetch the run through `check` (api.github.com only) and build the record.
 * Throws {@link CheckError} for a usage problem, an unreachable API, or a record that would
 * describe a different run or attempt from the one the URL names.
 */
export declare function inspectRunClaims(url: string, claimText: string, opts?: {
    env?: Record<string, string | undefined>;
    now?: () => Date;
}): Promise<{
    record: ActionEvidenceRecord;
    digest: RecordDigest;
}>;
export interface ClaimTally {
    SUPPORTED: number;
    CONTRADICTED: number;
    NOT_CHECKED: number;
}
export declare function tallyClaims(claims: ClaimEntry[]): ClaimTally;
/**
 * Record → process exit code. PURE. Same codes as `check <runUrl>`:
 *   1  a claim is CONTRADICTED, or the run itself FAILED / is INCONSISTENT
 *   3  anything NOT_CHECKED (including an INCONCLUSIVE run) — never 0
 *   0  every claim SUPPORTED on a COMPLETE run
 * A text with nothing checkable in it is therefore 3, not 0: "we compared nothing" is not a pass.
 */
export declare function claimsExitCode(record: ActionEvidenceRecord): number;
