import { type GroundResult } from '../lib/ground';
import { type MemoryRow, type Provenance } from './local-store';
export type { Provenance } from './local-store';
export declare const UNCHECKED_REASON = "untrusted: not yet checked";
export declare const INJECTION_PREFIX = "injection-looking text";
/** The record a reader sees. The body is withheld for injection-flagged notes. */
export interface QuarantineRecord {
    id: number;
    provenance: Provenance;
    source: string;
    quarantined: boolean;
    reason: string | null;
    released_by: string | null;
    released_at: string | null;
    created_at: string;
    /** null when withheld: injection-looking text is described, never reproduced. */
    body: string | null;
}
export type ReleaseOutcome = {
    released: true;
    id: number;
    check: 'ground' | 'hal';
    released_by: string;
} | {
    released: false;
    id: number;
    status: 'NOT_FOUND' | 'NOT_QUARANTINED' | 'HELD' | 'NOT_CHECKED';
    reason: string;
};
/**
 * Store a note that did NOT come from the operator. It is quarantined. If it looks like an injection
 * it is quarantined with that reason, and no check will release it. A secret-shaped note is refused
 * and nothing is written (the same rule as `remember`).
 */
export declare function rememberUntrusted(text: string, opts: {
    source: string;
}, env?: NodeJS.ProcessEnv): QuarantineRecord;
/** Every note still in quarantine, oldest first. */
export declare function listQuarantined(env?: NodeJS.ProcessEnv): QuarantineRecord[];
/** One note's taint record (quarantined or not), or null when there is no such note. */
export declare function explainQuarantine(id: number, env?: NodeJS.ProcessEnv): QuarantineRecord | null;
/** Shared gate before any check runs: the note must exist, be quarantined, be readable, not be injection. */
export declare function preflight(id: number, env: NodeJS.ProcessEnv): {
    row: MemoryRow;
} | ReleaseOutcome;
/**
 * Release by grounding: the WHOLE note must be found, VERIFIED, in `sourceText` (on `page` when given).
 * Local and deterministic; no network. Anything but VERIFIED keeps the note in quarantine and
 * records why.
 */
export declare function releaseByGround(id: number, sourceText: string, opts?: {
    page?: number | null;
    sourceLabel?: string;
}, env?: NodeJS.ProcessEnv): ReleaseOutcome & {
    ground?: GroundResult;
};
/** Exit contract for `trustshell quarantine release`: 0 released, 1 held by a failed check, 2 not checked / not found. */
export declare function releaseExitCode(r: ReleaseOutcome): number;
