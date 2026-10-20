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
 *  - Deny by default. Only plain claim lines (printable ASCII, starting with a letter, no Markdown or
 *    HTML, one sentence) are read; nothing is rendered or normalised before a decision. Any line that
 *    is not plain, or not read end to end, blocks every verdict in the text. See plainLineProblem.
 *  - A claim no template can check is NOT_CHECKED with the reason written next to it. Never SUPPORTED.
 *  - A claim that conflicts with a field is CONTRADICTED, and the reason names both values.
 *  - A successful run supports "this workflow run succeeded" and nothing wider: not "all tests
 *    pass", not "all checks pass", not "the fix works". Those stay NOT_CHECKED.
 *  - An outcome is compared only when its own line ties it to the inspected run by citing its commit or
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
import { type CommitChecks } from './commit-checks';
export declare const ACTION_EVIDENCE_SCHEMA: "dev.trustshell.action-evidence/0.1-draft";
/**
 * Claim text larger than this is refused, in UTF-8 bytes: no agent message or PR description is a
 * megabyte. One constant for `--claims-file` and the MCP `inspect_run`, so the two cannot drift.
 */
export declare const MAX_CLAIMS_FILE_BYTES: number;
export type ClaimStatus = 'SUPPORTED' | 'CONTRADICTED' | 'NOT_CHECKED';
export type TemplateId = 'gha.run_succeeded' | 'ci.all_checks_pass' | 'ci.tests_pass' | 'ci.build_unscoped' | 'git.head_sha' | 'gha.run_id' | 'gha.run_attempt' | 'excluded.completion' | 'excluded.security' | 'excluded.no_bugs' | 'excluded.readiness' | 'excluded.fix' | 'excluded.local_run' | 'excluded.test_count' | 'excluded.coverage' | 'excluded.deployment' | 'excluded.performance' | 'excluded.review' | 'unmapped' | 'excluded.markup' | 'truncated';
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
    /**
     * Guided mode only (`--guided`, EXPERIMENTAL): every check GitHub reported for `head_sha`. Its
     * presence is what makes a record guided: claims are then mapped with binding and these checks.
     */
    commit_checks?: CommitChecks;
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
/**
 * Guided mode (`--guided`, EXPERIMENTAL) reads every check on the commit, so the "only this one run"
 * line no longer holds; what guided mode adds to the list instead.
 */
export declare const GUIDED_DOES_NOT_PROVE: string[];
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
/**
 * JSON for a terminal, or for a file a terminal may print. JSON.stringify escapes only
 * U+0000-U+001F, so a C1 control (U+009B is CSI), a bidi override or an invisible character from a
 * workflow name reached stdout raw (XC1 N10). Those are written as \uXXXX escapes instead. The
 * parsed value is identical, so the record's digest does not change.
 */
export declare function terminalSafeJson(value: unknown, space?: number): string;
/** Normalise one claim for storage: {@link canonicalText}, whitespace collapsed, cut at MAX_CLAIM_TEXT. */
export declare function normalizeClaimText(s: string): string;
/** A line longer than this is not certifiable: one claim fits in one sentence. */
export declare const MAX_LINE = 200;
/**
 * Why a line cannot be certified, or null if it is a plain claim line. PURE, linear.
 *
 * DENY BY DEFAULT. Four review rounds (XC1, 2026-10-19) kept finding Markdown that a hand-written
 * reader got wrong: comments, code, link definitions, soft line breaks, normalisation order. The
 * bypass count did not converge, because re-implementing what a reader of rendered Markdown sees
 * has no end of edge cases. So nothing is rendered or normalised here. A line is certifiable only if
 * it is ALREADY plain text:
 *
 *   - printable ASCII only (no control, no tab, nothing that would need normalising);
 *   - it starts with a letter (no list marker, heading, quote, number or indentation);
 *   - no Markdown or HTML character at all (see MARKUP);
 *   - one sentence (no ". ", "! " or "; " followed by more text);
 *   - at most MAX_LINE characters;
 *   - its own paragraph: GitHub joins consecutive lines into one, so adjacent non-blank lines block
 *     the text (mapClaims), and only a line of spaces or tabs counts as blank (readClaims).
 *
 * Anything else is listed, as written, and is NOT_CHECKED. A PR description in Markdown is therefore
 * not certified; write the claims as plain lines to have them checked.
 */
export declare function plainLineProblem(line: string): string | null;
/** One non-blank input line: its 1-based number, the text shown, and why it is not certifiable, if it is not. */
interface ReadLine {
    lineNo: number;
    text: string;
    problem: string | null;
}
/**
 * Split input into its non-blank lines (line endings \n, \r\n or \r) and judge each against the
 * plain-line grammar. PURE, linear. A plain line is kept exactly as written; any other line is shown
 * with control and invisible characters removed, which is display only and decides nothing.
 */
export declare function readClaims(text: string): {
    lines: ReadLine[];
    dropped: number;
};
/** The shortest cited SHA that can SUPPORT a commit match: 12 hex characters, 48 bits (XC1 Z2). */
export declare const MIN_SUPPORTING_SHA = 12;
/**
 * Options for {@link mapClaims}. Both are guided mode (`--guided`, EXPERIMENTAL); {@link buildRecord}
 * sets them from the observation, so a record can always be re-derived from its own contents.
 */
export interface MapOptions {
    /** A line that cites nothing is about the inspected run, when nothing in the text points elsewhere. */
    bindToRun?: boolean;
    /** Every check on the run's head commit, for ci.all_checks_pass. */
    commitChecks?: CommitChecks;
}
/**
 * Map free claim text onto an observation. PURE: same text and observation, same entries, same order.
 *
 * DENY BY DEFAULT, over the WHOLE input. A verdict is given only when every line is a plain claim
 * line (see {@link plainLineProblem}) that the templates read end to end. One line that is not (a
 * Markdown line, a cross mark, "is false.", a question) blocks every verdict in the text, because
 * nothing here can tell what that line does to the others. Everything is still listed. Within a
 * readable text, each line's own citations decide which run it is about (see {@link Anchor}).
 */
export declare function mapClaims(text: string, o: Observation, opts?: MapOptions): ClaimEntry[];
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
    guided?: boolean;
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
export {};
