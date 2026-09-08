/**
 * `trustshell inspect` — verify an append-only tool-call log.
 * -----------------------------------------------------------
 * `check` answers "did it really pass?" from OUTSIDE evidence — what GitHub can
 * confirm. `inspect` answers it from INSIDE evidence — what the agent actually
 * did. Neither can do the other's job.
 *
 * EGRESS: none. This reads a local file and computes hashes. It opens no socket,
 * needs no account and no key.
 *
 * WHY A CHAIN. Each line's `prev` is the previous line's `hash`, so removing or
 * editing any line breaks every line after it. An unchained log proves only that
 * somebody wrote a file.
 *
 * OUTPUTS ARE HASHED, NEVER STORED. `output_sha256` only, mirroring the org's
 * existing `tool_call_log`. A local audit log that quietly accumulates verbatim
 * command output is a secret leak waiting to happen; a hash still proves the
 * output has not changed.
 */
/**
 * Four outcomes. INTACT and BROKEN are verdicts; UNCHAINED and NO_LOG are both
 * NOT CHECKED, and both exit 3 — the same code `check` uses for INCONCLUSIVE.
 * A script must never be able to read "we could not verify" as "verified".
 */
export type InspectVerdict = 'INTACT' | 'BROKEN' | 'UNCHAINED' | 'NO_LOG';
export interface SessionEntry {
    seq: number;
    ts: string;
    tool: string;
    input_sha256: string;
    output_sha256: string;
    prev: string | null;
    hash: string;
}
export interface ChainBreak {
    line: number;
    seq: number | null;
    reason: string;
}
export interface InspectResult {
    verdict: InspectVerdict;
    format: 'trustshell' | 'claude-code';
    path: string;
    entries: number;
    first_ts: string | null;
    last_ts: string | null;
    tools: {
        tool: string;
        calls: number;
    }[];
    breaks: ChainBreak[];
    does_not_prove: string[];
}
/**
 * The canonical bytes a line's `hash` covers. Field ORDER is part of the
 * contract — a JSON object whose keys were serialised in a different order
 * hashes differently, so this builds the string explicitly rather than calling
 * JSON.stringify on a record and hoping key order is stable.
 */
export declare function canonicalBytes(e: Omit<SessionEntry, 'hash'>): string;
/** PURE. The hash a well-formed entry must carry. */
export declare function entryHash(e: Omit<SessionEntry, 'hash'>): string;
/** The sentences an `inspect` card refuses to let a reader forget. */
export declare function inspectLimits(verdict: InspectVerdict): string[];
/**
 * PURE. Verify the native format from raw file text.
 *
 * `seq` and `prev` are both read from the PRECEDING LINE — there is no counter
 * held in memory across the walk and no sidecar file. The log IS the state. A
 * sidecar counter is a second thing that can disagree with the log, which is the
 * exact defect this product is about.
 */
export declare function verifyChain(text: string, path: string): InspectResult;
/**
 * The next line to append, derived from the file's own last line. ONE read gives
 * both `seq` and `prev`. Returns the entry; the caller writes it.
 */
export declare function nextEntry(text: string, fields: {
    ts: string;
    tool: string;
    input_sha256: string;
    output_sha256: string;
}): SessionEntry;
/**
 * PURE. Read a foreign log through an adapter.
 *
 * ALWAYS UNCHAINED. A log we did not chain proves nothing about its own
 * integrity, however well-formed it looks. The adapter can report what the
 * transcript SAYS happened; it cannot report INTACT, and pretending otherwise
 * would turn a summary into a false attestation.
 *
 * `--from symphony` is deliberately absent: that logger writes to Postgres, so
 * pointing `inspect` at it would make a local, no-account, no-egress command
 * open a database connection.
 */
export declare function readClaudeCode(text: string, path: string): InspectResult;
/** INTACT 0 · BROKEN 1 · UNCHAINED and NO_LOG 3, because 3 means NOT CHECKED. */
export declare function inspectExitCode(v: InspectVerdict): number;
export declare function noLog(path: string): InspectResult;
export declare function formatInspectCard(r: InspectResult): string;
