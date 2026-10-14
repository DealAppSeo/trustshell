/**
 * quarantine — immune system v0 for local memory.
 *
 * WHAT IT DOES
 *   - Every note carries a taint label: provenance trusted | untrusted | verified, plus a source.
 *   - Anything not written by the operator is UNTRUSTED and is stored QUARANTINED: `recall` leaves it
 *     out (and says how many it left out) unless the caller asks for quarantined notes explicitly.
 *   - A quarantined note is released only by a check that PASSES, and the release records which check:
 *       ground  the whole note is found, VERIFIED, in the source document it came from (groundQuote,
 *               local, no network);
 *       hal     the classify endpoint labels the note `pass` (POST /api/v1/classify). This is the
 *               only path that touches the network, only when the caller asks for it, and it lives
 *               in quarantine-hal.ts so nothing local imports network code.
 *   - Text that looks like an injection (src/lib/ingest.ts, the existing detector) is held with that
 *     reason and NO check can release it.
 *
 * WHAT IT DOES NOT DO (v0)
 *   - No sandboxed execution: it holds TEXT apart; it does not run anything in isolation.
 *   - No adaptive learning: the detector is the fixed regex set in ingest.ts, not a model.
 *   - It does not quarantine anything outside this package's local memory (an agent's own context,
 *     tool results it never stores here).
 *   - A ground release says the note's text is in the cited source, not that the source is true.
 *     A hal release says two checkers agreed, not that the note is safe to act on.
 */
import { ingest } from '../lib/ingest';
import { groundQuote, splitPages, type GroundResult } from '../lib/ground';
import { refusedValue } from '../cli/remember';
import { SEALED_NO_KEY, SEALED_WRONG_KEY } from './encrypt';
import {
  getNote,
  insertMemory,
  listQuarantinedRows,
  markReleased,
  memoryDbPath,
  setQuarantineReason,
  type MemoryRow,
  type Provenance,
} from './local-store';

export type { Provenance } from './local-store';

export const UNCHECKED_REASON = 'untrusted: not yet checked';
export const INJECTION_PREFIX = 'injection-looking text';

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

export type ReleaseOutcome =
  | { released: true; id: number; check: 'ground' | 'hal'; released_by: string }
  | { released: false; id: number; status: 'NOT_FOUND' | 'NOT_QUARANTINED' | 'HELD' | 'NOT_CHECKED'; reason: string };

function isInjectionReason(reason: string | null | undefined): boolean {
  return typeof reason === 'string' && reason.startsWith(INJECTION_PREFIX);
}

function toRecord(row: MemoryRow): QuarantineRecord {
  const reason = row.quarantine_reason ?? null;
  return {
    id: row.id,
    provenance: row.provenance ?? 'trusted',
    source: row.source ?? 'legacy',
    quarantined: Boolean(row.quarantined),
    reason,
    released_by: row.released_by ?? null,
    released_at: row.released_at ?? null,
    created_at: row.created_at,
    body: isInjectionReason(reason) ? null : row.body,
  };
}

/**
 * Store a note that did NOT come from the operator. It is quarantined. If it looks like an injection
 * it is quarantined with that reason, and no check will release it. A secret-shaped note is refused
 * and nothing is written (the same rule as `remember`).
 */
export function rememberUntrusted(
  text: string,
  opts: { source: string },
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
  });
  return toRecord(row);
}

/** Every note still in quarantine, oldest first. */
export function listQuarantined(env: NodeJS.ProcessEnv = process.env): QuarantineRecord[] {
  return listQuarantinedRows(memoryDbPath(env), env).map(toRecord);
}

/** One note's taint record (quarantined or not), or null when there is no such note. */
export function explainQuarantine(id: number, env: NodeJS.ProcessEnv = process.env): QuarantineRecord | null {
  const row = getNote(memoryDbPath(env), id, env);
  return row ? toRecord(row) : null;
}

/** Shared gate before any check runs: the note must exist, be quarantined, be readable, not be injection. */
export function preflight(id: number, env: NodeJS.ProcessEnv): { row: MemoryRow } | ReleaseOutcome {
  const row = getNote(memoryDbPath(env), id, env);
  if (!row) return { released: false, id, status: 'NOT_FOUND', reason: `no note with id ${id}` };
  if (!row.quarantined) {
    return { released: false, id, status: 'NOT_QUARANTINED', reason: `note ${id} is not quarantined (provenance ${row.provenance})` };
  }
  if (isInjectionReason(row.quarantine_reason)) {
    return {
      released: false,
      id,
      status: 'HELD',
      reason: `${row.quarantine_reason}; injection-looking text is never released by a check`,
    };
  }
  if (row.body === SEALED_NO_KEY || row.body === SEALED_WRONG_KEY) {
    return { released: false, id, status: 'NOT_CHECKED', reason: 'the note is encrypted and cannot be read here, so it was not checked' };
  }
  return { row };
}

/**
 * Release by grounding: the WHOLE note must be found, VERIFIED, in `sourceText` (on `page` when given).
 * Local and deterministic; no network. Anything but VERIFIED keeps the note in quarantine and
 * records why.
 */
export function releaseByGround(
  id: number,
  sourceText: string,
  opts: { page?: number | null; sourceLabel?: string } = {},
  env: NodeJS.ProcessEnv = process.env,
): ReleaseOutcome & { ground?: GroundResult } {
  const pre = preflight(id, env);
  if (!('row' in pre)) return pre;
  const pages = splitPages(String(sourceText ?? ''));
  const result = groundQuote({ quote: pre.row.body, page: opts.page ?? null }, pages);
  const label = opts.sourceLabel ? ` ${opts.sourceLabel}` : '';
  if (result.status !== 'VERIFIED') {
    const reason = `ground ${result.status} ${result.reason}${label}`;
    setQuarantineReason(memoryDbPath(env), id, reason);
    return { released: false, id, status: result.status === 'VETO' ? 'HELD' : 'NOT_CHECKED', reason, ground: result };
  }
  const releasedBy = `ground VERIFIED ${result.reason} page ${result.found_on_page}${label}`;
  markReleased(memoryDbPath(env), id, releasedBy);
  return { released: true, id, check: 'ground', released_by: releasedBy, ground: result };
}

/** Exit contract for `trustshell quarantine release`: 0 released, 1 held by a failed check, 2 not checked / not found. */
export function releaseExitCode(r: ReleaseOutcome): number {
  if (r.released) return 0;
  if (r.status === 'HELD') return 1;
  return 2;
}
