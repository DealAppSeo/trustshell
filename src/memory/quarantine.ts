/**
 * quarantine — immune system v0 for local memory.
 *
 * WHAT IT DOES
 *   - Every note carries a taint label: provenance trusted | untrusted | verified, plus a source.
 *   - Anything not explicitly vouched for by the operator (`remember --trusted`) is UNTRUSTED and is
 *     stored QUARANTINED: `recall` leaves it out (and says how many it left out) unless the caller
 *     asks for quarantined notes explicitly. Notes saved before taint labels are untrusted too.
 *   - A quarantined note is released only by a check that PASSES, or by the operator vouching for it
 *     at the CLI, and the release records which:
 *       ground    the whole note is found, VERIFIED, in the source document RECORDED WHEN THE NOTE WAS
 *                 STORED (its sha256 is kept with the row). The document given at release must be that
 *                 same document. No recorded document = NOT_CHECKED. Local, no network.
 *       hal       the DEFAULT classify endpoint labels the note `pass` by votes, with two named
 *                 deciders that both said TRUE (POST /api/v1/classify). The only network path; it
 *                 lives in quarantine-hal.ts so nothing local imports network code.
 *       operator  `trustshell quarantine release <id> --trusted`: the operator's word, recorded as
 *                 such (provenance trusted, not verified). CLI only; never over MCP.
 *   - Text that looks like an injection (src/lib/ingest.ts, the existing detector) is held with that
 *     reason, is never printed, and nothing releases it.
 *
 * WHAT IT DOES NOT DO (v0)
 *   - No sandboxed execution: it holds TEXT apart; it does not run anything in isolation.
 *   - No adaptive learning: the detector is the fixed regex set in ingest.ts, not a model.
 *   - It does not quarantine anything outside this package's local memory (an agent's own context,
 *     tool results it never stores here). Keyed values (`remember KEY VALUE`) carry no taint label.
 *   - A ground release says the note's text is in the document recorded at ingest, not that the
 *     document is true, nor that whoever recorded it told the truth about where it came from.
 *     A hal release says two checkers agreed, not that the note is safe to act on.
 *   - The release functions are OPERATOR surfaces. Exposing them to an agent as tools lets that agent
 *     release what it wrote; the MCP server here deliberately has no release tool.
 */
import { createHash } from 'node:crypto';
import { ingest } from '../lib/ingest';
import { groundQuote, splitPages, type GroundResult } from '../lib/ground';
import { refusedValue } from '../cli/remember';
import { SEALED_NO_KEY, SEALED_WRONG_KEY } from './encrypt';
import {
  INJECTION_PREFIX,
  getNote,
  heldAsInjection,
  insertMemory,
  listQuarantinedRows,
  markReleased,
  memoryDbPath,
  setQuarantineReason,
  type MemoryRow,
  type Provenance,
} from './local-store';

export type { Provenance } from './local-store';
export { INJECTION_PREFIX } from './local-store';

export const UNCHECKED_REASON = 'untrusted: not yet checked';

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

export type ReleaseOutcome =
  | { released: true; id: number; check: 'ground' | 'hal' | 'operator'; released_by: string }
  | { released: false; id: number; status: 'NOT_FOUND' | 'NOT_QUARANTINED' | 'HELD' | 'NOT_CHECKED'; reason: string };

/** sha256 of a source document, line endings normalized so a CRLF copy of the same file matches. */
export function sourceDigest(text: string): string {
  return createHash('sha256').update(String(text ?? '').replace(/\r\n?/g, '\n'), 'utf8').digest('hex');
}

function toRecord(row: MemoryRow): QuarantineRecord {
  const quarantined = Boolean(row.quarantined);
  return {
    id: row.id,
    provenance: row.provenance ?? 'untrusted',
    source: row.source ?? 'legacy',
    quarantined,
    reason: row.quarantine_reason ?? null,
    released_by: row.released_by ?? null,
    released_at: row.released_at ?? null,
    created_at: row.created_at,
    source_recorded: Boolean(row.source_sha256),
    body: quarantined && heldAsInjection(row) ? null : row.body,
  };
}

/**
 * Store a note that was not vouched for by the operator. It is quarantined. If it looks like an
 * injection it is quarantined with that reason, and nothing will release it. A secret-shaped note is
 * refused and nothing is written (the same rule as `remember`).
 *
 * `sourceText`, when given, is the document the note came from. Only its sha256 is kept; a later
 * ground release must present that same document. Without it, a ground release is NOT_CHECKED.
 */
export function rememberUntrusted(
  text: string,
  opts: { source: string; sourceText?: string | null },
  env: NodeJS.ProcessEnv = process.env,
): QuarantineRecord {
  if (refusedValue(text)) throw new Error('remember refused');
  const source = String(opts.source ?? '').trim() || 'unspecified';
  const screen = ingest(text);
  const reason = screen.ingest === 'clean' ? UNCHECKED_REASON : `${INJECTION_PREFIX}: ${screen.excerpt}`;
  const row = insertMemory(memoryDbPath(env), 'note', text, undefined, env, {
    provenance: 'untrusted',
    source,
    quarantined: true,
    reason,
    sourceSha256: typeof opts.sourceText === 'string' ? sourceDigest(opts.sourceText) : null,
  });
  return toRecord(row);
}

/** Every note still in quarantine, oldest first. The text is not included: use explainQuarantine. */
export function listQuarantined(env: NodeJS.ProcessEnv = process.env): QuarantineListItem[] {
  return listQuarantinedRows(memoryDbPath(env), env).map((row) => {
    const { body: _withheld, ...item } = toRecord(row);
    return item;
  });
}

/** One note's taint record (quarantined or not), or null when there is no such note. */
export function explainQuarantine(id: number, env: NodeJS.ProcessEnv = process.env): QuarantineRecord | null {
  const row = getNote(memoryDbPath(env), id, env);
  return row ? toRecord(row) : null;
}

/** Shared gate before any release: the note must exist, be quarantined, be readable, not be injection. */
export function preflight(id: number, env: NodeJS.ProcessEnv): { row: MemoryRow } | ReleaseOutcome {
  const row = getNote(memoryDbPath(env), id, env);
  if (!row) return { released: false, id, status: 'NOT_FOUND', reason: `no note with id ${id}` };
  if (!row.quarantined) {
    return { released: false, id, status: 'NOT_QUARANTINED', reason: `note ${id} is not quarantined (provenance ${row.provenance})` };
  }
  if (heldAsInjection(row)) {
    const why = row.quarantine_reason?.startsWith(INJECTION_PREFIX)
      ? row.quarantine_reason
      : `${INJECTION_PREFIX}: instruction-smuggling detected when the note was read`;
    if (why !== row.quarantine_reason) setQuarantineReason(memoryDbPath(env), id, why);
    return { released: false, id, status: 'HELD', reason: `${why}; injection-looking text is never released` };
  }
  if (row.body === SEALED_NO_KEY || row.body === SEALED_WRONG_KEY) {
    return { released: false, id, status: 'NOT_CHECKED', reason: 'the note is encrypted and cannot be read here, so it was not checked' };
  }
  return { row };
}

/**
 * Release by grounding: the WHOLE note must be found, VERIFIED, in the source document recorded when
 * the note was stored (on `page` when given). `sourceText` must be that document: its sha256 is
 * compared with the recorded one first, so a caller cannot ground a note against text it chose now
 * (the note itself, say). No recorded document, or a different one, is NOT_CHECKED. Local and
 * deterministic; no network. Anything but VERIFIED keeps the note in quarantine and records why.
 */
export function releaseByGround(
  id: number,
  sourceText: string,
  opts: { page?: number | null; sourceLabel?: string } = {},
  env: NodeJS.ProcessEnv = process.env,
): ReleaseOutcome & { ground?: GroundResult } {
  const pre = preflight(id, env);
  if (!('row' in pre)) return pre;
  const label = opts.sourceLabel ? ` ${opts.sourceLabel}` : '';
  const recorded = pre.row.source_sha256;
  if (!recorded) {
    const reason =
      'ground not-checked no_recorded_source: no source document was recorded when this note was stored, so there is nothing to ground it against';
    setQuarantineReason(memoryDbPath(env), id, reason);
    return { released: false, id, status: 'NOT_CHECKED', reason };
  }
  if (sourceDigest(sourceText) !== recorded) {
    const reason = `ground not-checked source_mismatch: this is not the document recorded when the note was stored${label}`;
    setQuarantineReason(memoryDbPath(env), id, reason);
    return { released: false, id, status: 'NOT_CHECKED', reason };
  }
  const pages = splitPages(String(sourceText ?? ''));
  const result = groundQuote({ quote: pre.row.body, page: opts.page ?? null }, pages);
  if (result.status !== 'VERIFIED') {
    const reason = `ground ${result.status} ${result.reason}${label}`;
    setQuarantineReason(memoryDbPath(env), id, reason);
    return { released: false, id, status: result.status === 'VETO' ? 'HELD' : 'NOT_CHECKED', reason, ground: result };
  }
  const releasedBy = `ground VERIFIED ${result.reason} page ${result.found_on_page} in the source recorded at ingest${label}`;
  markReleased(memoryDbPath(env), id, releasedBy);
  return { released: true, id, check: 'ground', released_by: releasedBy, ground: result };
}

/**
 * The operator vouches for a quarantined note (`trustshell quarantine release <id> --trusted`). Not a
 * check: provenance becomes `trusted`, and released_by says it was the operator's word. Injection-
 * looking text is still never released. CLI only: the MCP server has no release tool.
 */
export function releaseByOperator(id: number, env: NodeJS.ProcessEnv = process.env): ReleaseOutcome {
  const pre = preflight(id, env);
  if (!('row' in pre)) return pre;
  const releasedBy = 'operator vouched (--trusted): not a check';
  markReleased(memoryDbPath(env), id, releasedBy, undefined, 'trusted');
  return { released: true, id, check: 'operator', released_by: releasedBy };
}

/** Exit contract for `trustshell quarantine release`: 0 released, 1 held by a failed check, 2 not checked / not found. */
export function releaseExitCode(r: ReleaseOutcome): number {
  if (r.released) return 0;
  if (r.status === 'HELD') return 1;
  return 2;
}
