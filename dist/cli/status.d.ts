/** True only when the caller set TRUSTSHELL_API_URL to a non-empty value. */
export declare function trustshellApiUrlSet(env: NodeJS.ProcessEnv): boolean;
/** can_bind is true only when readiness exact_true.HUMAN_AGENT_BIND_ENABLED is boolean true. */
export declare function bindCell(body: unknown): string;
/** One Honesty A line. A missing count is NOT_CHECKED, not a blended score. */
export declare function honestyLine(body: unknown): string;
/** Counted first_pass for verify --json. Missing is omitted, never 0. */
export declare function firstPassObject(body: unknown): {
    true: number;
    false: number;
    not_checked: number;
} | undefined;
/** verify --json post_hal. A missing column is omitted. A non-verdict is NOT_CHECKED, never 0. */
export declare function postHalValue(body: unknown): 'TRUE' | 'FALSE' | 'NOT_CHECKED' | undefined;
/**
 * Print counted first_pass fields. A NOT_CHECKED body or a missing column is
 * NOT_CHECKED, not 0. post-HAL is printed only when post_hal_verdict is present.
 */
export declare function firstPassLines(body: unknown): string[];
type HalVerdict = 'PASS' | 'FLAG' | 'VETO' | 'NOT_CHECKED';
/** One line after verify: family, host, and the verdict from this check. Missing columns are NOT_CHECKED. */
export declare function familyHostVerdictLine(body: unknown, verdict: HalVerdict): string;
/**
 * One extra line after verify. A counted body prints the real row count.
 * Timeout, non-200, or a missing status is NOT_CHECKED, never rows=0.
 */
/** verify --json row count. A missing status or rows array is omitted, never 0. */
export declare function honestyRowsValue(body: unknown): number | undefined;
export declare function honestyRowsLine(body: unknown): string;
export type ReceiptResult = 'skipped' | 'written' | 'unwritten' | '204' | 'columns-missing' | 'receipt-missing' | 'insert-error' | 'NOT_CHECKED';
/** A receipt id from a response. Missing, blank, and 0 are NOT_CHECKED. */
export declare function receiptIdToken(value: unknown): string;
export interface HalReceiptPost {
    status: ReceiptResult;
    receiptId: string;
}
/** Human line for a receipt result. OFFLINE prints nothing. Missing is never 0. */
export declare function receiptHumanLine(result: ReceiptResult): string | null;
/**
 * verify --json field. true when the receipt was written, false when the write
 * said it was not, NOT_CHECKED when the receipt is missing. Never 0.
 */
export declare function receiptWrittenValue(result: ReceiptResult): true | false | 'NOT_CHECKED';
/**
 * POST {family, host, verdict} after a live verify quorum.
 * OFFLINE skips. A body without family and host is columns-missing.
 * 404 or a receipt-missing token is receipt-missing. An insert-error token is insert-error.
 * Timeout or any other failure is NOT_CHECKED.
 */
export declare function postHalReceipt(opts: {
    env: NodeJS.ProcessEnv;
    fetchImpl: typeof fetch;
    body: unknown;
    verdict: HalVerdict;
}): Promise<HalReceiptPost>;
/** The honesty-a body, or null when the check cannot be counted. */
export declare function loadHonestyBody(opts: {
    env: NodeJS.ProcessEnv;
    fetchImpl: typeof fetch;
}): Promise<unknown | null>;
/** The first-pass lines from honesty-a. A missing column is NOT_CHECKED, never 0. */
export declare function firstPassText(opts: {
    env: NodeJS.ProcessEnv;
    fetchImpl: typeof fetch;
}): Promise<string>;
export declare function buildStatusReport(opts: {
    env: NodeJS.ProcessEnv;
    fetchImpl: typeof fetch;
}): Promise<string>;
/** JSON view of the human status lines. A missing first_pass is omitted, never 0. */
export declare function statusJsonFromText(text: string): Record<string, string>;
export {};
