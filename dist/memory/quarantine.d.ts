import { type GroundResult } from '../lib/ground';
import { type MemoryRow, type Provenance } from './local-store';
export type { Provenance } from './local-store';
export { INJECTION_PREFIX } from './local-store';
export declare const UNCHECKED_REASON = "untrusted: not yet checked";
/** The record a reader sees. The body is withheld for injection-looking notes. */
export interface QuarantineRecord {
    id: number;
    provenance: Provenance;
    source: string;
    quarantined: boolean;
    reason: string | null;
    released_by: string | null;
    released_at: string | null;
    created_at: string;
    /** Whether a source document was recorded when the note was stored (needed for a ground release). */
    source_recorded: boolean;
    /** null when withheld: injection-looking text is described, never reproduced. */
    body: string | null;
}
/** What `list` returns: the taint record WITHOUT the text. Read one note's text with explain. */
export type QuarantineListItem = Omit<QuarantineRecord, 'body'>;
export type ReleaseOutcome = {
    released: true;
    id: number;
    check: 'ground' | 'hal' | 'operator';
    released_by: string;
} | {
    released: false;
    id: number;
    status: 'NOT_FOUND' | 'NOT_QUARANTINED' | 'HELD' | 'NOT_CHECKED';
    reason: string;
};
/** sha256 of a source document, line endings normalized so a CRLF copy of the same file matches. */
export declare function sourceDigest(text: string): string;
/**
 * Store a note that was not vouched for by the operator. It is quarantined. If it looks like an
 * injection it is quarantined with that reason, and nothing will release it. A secret-shaped note is
 * refused and nothing is written (the same rule as `remember`).
 *
 * `sourceText`, when given, is the document the note came from. Only its sha256 is kept; a later
 * ground release must present that same document. Without it, a ground release is NOT_CHECKED.
 */
export declare function rememberUntrusted(text: string, opts: {
    source: string;
    sourceText?: string | null;
}, env?: NodeJS.ProcessEnv): QuarantineRecord;
/** Every note still in quarantine, oldest first. The text is not included: use explainQuarantine. */
export declare function listQuarantined(env?: NodeJS.ProcessEnv): QuarantineListItem[];
/** One note's taint record (quarantined or not), or null when there is no such note. */
export declare function explainQuarantine(id: number, env?: NodeJS.ProcessEnv): QuarantineRecord | null;
/** Shared gate before any release: the note must exist, be quarantined, be readable, not be injection. */
export declare function preflight(id: number, env: NodeJS.ProcessEnv): {
    row: MemoryRow;
} | ReleaseOutcome;
/**
 * Release by grounding: the WHOLE note must be found, VERIFIED, in the source document recorded when
 * the note was stored (on `page` when given). `sourceText` must be that document: its sha256 is
 * compared with the recorded one first, so a caller cannot ground a note against text it chose now
 * (the note itself, say). No recorded document, or a different one, is NOT_CHECKED. Local and
 * deterministic; no network. Anything but VERIFIED keeps the note in quarantine and records why.
 */
export declare function releaseByGround(id: number, sourceText: string, opts?: {
    page?: number | null;
    sourceLabel?: string;
}, env?: NodeJS.ProcessEnv): ReleaseOutcome & {
    ground?: GroundResult;
};
/**
 * The operator vouches for a quarantined note (`trustshell quarantine release <id> --trusted`). Not a
 * check: provenance becomes `trusted`, and released_by says it was the operator's word. Injection-
 * looking text is still never released. CLI only: the MCP server has no release tool.
 */
export declare function releaseByOperator(id: number, env?: NodeJS.ProcessEnv): ReleaseOutcome;
/** Exit contract for `trustshell quarantine release`: 0 released, 1 held by a failed check, 2 not checked / not found. */
export declare function releaseExitCode(r: ReleaseOutcome): number;
