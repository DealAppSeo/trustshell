import { REPID_ENGINE_URL } from './repid-engine';

/**
 * The public agent leaderboard, and where a given RepID would sit in it.
 *
 * ── WHY A COMPARISON HERE NEEDED CHECKING FIRST ─────────────────────────────
 *
 * Placing one of your agents against this board only means something if the two
 * numbers are the same number. They come from different endpoints:
 * `/api/v1/leaderboard/agents` returns `repid_total`, and `lib/agent-repid.ts`
 * reads `repid` from `/api/v1/agents/:id/card`. Two plausible-looking fields on
 * one concept is exactly the shape that produces a confident, wrong ranking.
 *
 * MEASURED 2026-09-23 against production, same agent both ways:
 *   leaderboard  trinity-nexus            repid_total = 1978
 *   card         848da285-93c5-…-ebed09   repid       = 1978
 * Same scale, so the comparison below is legitimate. Re-run that pair before
 * trusting this file if either endpoint changes.
 *
 * ── WHAT THE BOARD ACTUALLY CONTAINS, WHICH THE UI MUST SAY ─────────────────
 *
 * Twelve agents [MEASURED 2026-09-23: `total_agents: 12`] — the Trinity fleet,
 * not every agent in existence. "You rank 6th" would be false; "6th of 13 on
 * this board" is true. `standingAmong` therefore returns `outOf` and the caller
 * is expected to render it, which is why there is no bare-number accessor.
 *
 * ── ON THE DUPLICATE SHAPE IN components/live-trust-scores.tsx ──────────────
 *
 * That component declares its own `AgentRow`/`AgentsResponse` for the same
 * endpoint. It is NOT repointed here on purpose: it fetches the models board in
 * the same `Promise.all` behind one shared error state, so moving it is a change
 * to the home page rather than a type substitution. Naming the duplication is
 * the honest half — if this response shape changes, both files need the edit.
 */

/** One row of the public board. Fields beyond these exist; these are the ones used. */
export type LeaderboardEntry = {
  /** A SLUG (`trinity-nexus`), not the uuid a browser-local agent carries. */
  agentId: string;
  repid: number;
  model: string | null;
};

export type LeaderboardLookup =
  | { state: 'LOADED'; entries: LeaderboardEntry[]; totalAgents: number; lastUpdated: string | null }
  | { state: 'NOT_CHECKED'; reason: 'no_engine' | 'unreachable' }
  | { state: 'FAILED'; reason: 'bad_response' };

/** Plain language per non-loaded outcome — the state alone is not actionable. */
export const LEADERBOARD_LOOKUP_DETAIL: Record<
  Extract<LeaderboardLookup, { state: 'NOT_CHECKED' | 'FAILED' }>['reason'],
  string
> = {
  no_engine:
    'The scoring engine URL is not configured for this deploy, so the board was never requested.',
  unreachable:
    "Couldn't reach the scoring engine just now. The standings are unchanged — this is a lookup failure, not an empty board.",
  bad_response:
    'The engine answered with a shape this page does not recognise, so nothing is shown rather than a guess.',
};

/**
 * Fetch the public board. Keyless and read-only; trustshell.dev is on the
 * engine's CORS allowlist, so this runs client-side.
 *
 * THREE OUTCOMES, NEVER TWO. An empty array is not a legitimate "no agents" —
 * it is indistinguishable from a response we failed to understand, and rendering
 * an empty board would read as "nobody has scored yet". A 200 whose `agents` is
 * not an array is `bad_response`, not zero entries.
 */
export async function fetchLeaderboard(): Promise<LeaderboardLookup> {
  if (!REPID_ENGINE_URL) return { state: 'NOT_CHECKED', reason: 'no_engine' };

  let res: Response;
  try {
    res = await fetch(`${REPID_ENGINE_URL}/api/v1/leaderboard/agents`, {
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    return { state: 'NOT_CHECKED', reason: 'unreachable' };
  }
  if (!res.ok) return { state: 'NOT_CHECKED', reason: 'unreachable' };

  let body: Record<string, unknown>;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    return { state: 'FAILED', reason: 'bad_response' };
  }

  const rows = body.agents;
  if (!Array.isArray(rows)) return { state: 'FAILED', reason: 'bad_response' };

  const entries: LeaderboardEntry[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    // A row without a numeric score is DROPPED, never defaulted to 0 — a 0 here
    // would be a claim that the agent earned nothing, and it would also sink to
    // the bottom of the board as though that had been measured.
    if (typeof r.agent_id !== 'string' || typeof r.repid_total !== 'number') continue;
    entries.push({
      agentId: r.agent_id,
      repid: r.repid_total,
      model: typeof r.model === 'string' ? r.model : null,
    });
  }
  if (entries.length === 0) return { state: 'FAILED', reason: 'bad_response' };

  entries.sort((a, b) => b.repid - a.repid);

  return {
    state: 'LOADED',
    entries,
    totalAgents: typeof body.total_agents === 'number' ? body.total_agents : entries.length,
    lastUpdated: typeof body.last_updated === 'string' ? body.last_updated : null,
  };
}

/**
 * Where a RepID would sit on this board, as a position AND the size of the field.
 *
 * Standard competition ranking: position is one more than the number of entries
 * STRICTLY above, so a tie takes the better of the two places. `outOf` counts the
 * board plus the agent being placed, because that agent is not already on it —
 * reporting `outOf` as the board size alone would describe a 13-way comparison
 * as a 12-way one.
 *
 * Returns `null` for an empty board rather than "1st of 1", which is arithmetically
 * true and tells the reader nothing except something they would believe.
 */
export function standingAmong(
  repid: number,
  entries: readonly LeaderboardEntry[],
): { position: number; outOf: number } | null {
  if (entries.length === 0) return null;
  if (!Number.isFinite(repid)) return null;
  const above = entries.filter((e) => e.repid > repid).length;
  return { position: above + 1, outOf: entries.length + 1 };
}

/** `1st`, `2nd`, `3rd`, `4th`… for rendering a position. */
export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}
