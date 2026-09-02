import { REPID_ENGINE_URL } from './repid-engine';

/**
 * THE NUMBER THIS PRODUCT IS ABOUT, ON THE PAGE THAT LISTS THE THINGS THAT EARN IT.
 *
 * `/agents` tells a visitor their agent earns "portable, on-chain RepID" and then shows them
 * one figure: `Prompts: 3`. That is a count of how many times they clicked. The RepID — the
 * entire reason the agent exists — appeared nowhere, so the page made a promise and then
 * withheld the only evidence for it.
 *
 * The engine has had the answer the whole time. `GET /api/v1/agents/:id/card` is public,
 * keyless, and returns `repid`, `total_decisions` and a provenance breakdown
 * [MEASURED 2026-09-02 against production: agent 848da285 → repid 1752, 6619 decisions,
 * "90% of gains externally verifiable"].
 *
 * ── WHY THIS RETURNS A STATE AND NEVER A BARE NUMBER ────────────────────────
 *
 * XC's standing brief: *"No surface may show a stale number as if it were current. Every panel
 * that renders a number renders one of three states — LIVE / NOT CHECKED / FAILED. A dash that
 * means 'we did not look' is a lie and is treated as a defect here."*
 *
 * So there is no shape of this function that returns `number` on its own. A caller cannot
 * render the figure without also holding the reason it is trustworthy, because the two are the
 * same value.
 *
 * ── THE 404 DECISION, WHICH IS THE ONE WORTH ARGUING ABOUT ──────────────────
 *
 * A 404 means the engine has no such agent. The tempting reading is `MEASURED, repid 0` — we
 * asked, we got a definitive answer. That is wrong, and wrong in this codebase's signature
 * direction: a RepID of 0 asserts that the agent earned nothing THROUGH ITS BEHAVIOUR, which
 * is a claim about conduct. The truth is that the agent never reached the ledger at all, and
 * those are different facts about the agent's honesty.
 *
 * It resolves to `NOT_CHECKED` carrying its real reason. That state's own header says it
 * "renders as an ABSENCE, which is what it is" — and an absence is exactly right here. No
 * number is claimed in either direction.
 *
 * ── WHY `unregistered` IS SEPARATE FROM `unreachable` ───────────────────────
 *
 * Both land on NOT_CHECKED, and collapsing them would still be honest about the number while
 * being useless about the cause. "This agent was never registered with the engine" is a
 * permanent fact the person can act on (recreate it); "the engine could not be reached" is a
 * transient one (try later). A single blurred message would send half the readers to the wrong
 * remedy.
 */

/** Provenance is the answer to "is this score real", so it is carried, never flattened. */
export type RepIdProvenance = {
  /** Share of RepID GAINS that something outside the agent can vouch for, 0–1. */
  verifiableShareOfGains: number;
  /** The engine's own one-line summary — its wording, not ours. */
  summary: string;
  /** True when the engine computed this from a sample rather than the full history. */
  sampled: boolean;
};

export type RepIdLookup =
  | {
      state: 'MEASURED';
      repid: number;
      decisions: number;
      lastActiveAt: string | null;
      provenance: RepIdProvenance | null;
    }
  | { state: 'NOT_CHECKED'; reason: 'unregistered' | 'unreachable' | 'no_engine' }
  | { state: 'FAILED'; reason: 'bad_response' };

/** Plain language for each non-measured outcome. The state alone is not actionable. */
export const REPID_LOOKUP_DETAIL: Record<
  Extract<RepIdLookup, { state: 'NOT_CHECKED' | 'FAILED' }>['reason'],
  string
> = {
  unregistered:
    'This agent was never registered with the scoring engine, so it has no RepID yet. Recreate it on this page to start earning one.',
  unreachable: "Couldn't reach the scoring engine just now. The score is unchanged — this is a lookup failure, not a loss.",
  no_engine: 'No scoring engine is configured for this deployment, so RepID cannot be read here.',
  bad_response: 'The engine answered with something this page could not read. Treat the score as unknown rather than unchanged.',
};

export async function fetchAgentRepId(agentId: string): Promise<RepIdLookup> {
  if (!REPID_ENGINE_URL) return { state: 'NOT_CHECKED', reason: 'no_engine' };

  let res: Response;
  try {
    res = await fetch(`${REPID_ENGINE_URL}/api/v1/agents/${agentId}/card`);
  } catch {
    return { state: 'NOT_CHECKED', reason: 'unreachable' };
  }

  // The engine's own 404 for an id it has never seen. A definite answer that the agent is
  // absent — see the header for why that is not a zero.
  if (res.status === 404) return { state: 'NOT_CHECKED', reason: 'unregistered' };
  if (!res.ok) return { state: 'NOT_CHECKED', reason: 'unreachable' };

  let card: Record<string, unknown>;
  try {
    card = (await res.json()) as Record<string, unknown>;
  } catch {
    return { state: 'FAILED', reason: 'bad_response' };
  }

  // A 200 whose body has no `repid` is not a zero-scoring agent, it is a response shape we do
  // not understand — the one case that must read FAILED rather than as an absence, because
  // something is genuinely broken rather than merely missing.
  if (typeof card.repid !== 'number') return { state: 'FAILED', reason: 'bad_response' };

  return {
    state: 'MEASURED',
    repid: card.repid,
    decisions: typeof card.total_decisions === 'number' ? card.total_decisions : 0,
    lastActiveAt: typeof card.last_active_at === 'string' ? card.last_active_at : null,
    provenance: readProvenance(card.provenance),
  };
}

function readProvenance(raw: unknown): RepIdProvenance | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const share = p.verifiable_share_of_gains;
  const summary = p.summary;
  // Both or neither. A share with no summary is a bare percentage with nothing behind it,
  // which is the kind of number this file exists to stop rendering.
  if (typeof share !== 'number' || typeof summary !== 'string') return null;
  return { verifiableShareOfGains: share, summary, sampled: p.sampled === true };
}

/**
 * Why an agent's RepID cannot move, when that is knowable locally.
 *
 * The engine issues an agent's API key ONCE at registration. An agent restored from a public
 * card (lib/agent-recovery.ts) or created before 2026-07-30 has none, so it answers prompts and
 * posts no score events. Its RepID is then permanently static, and a page that shows the figure
 * without saying so presents a frozen number as a live one — the same defect as a stale panel,
 * arrived at from the other direction.
 */
export function earningBlockedReason(agent: { apiKey?: string }): string | null {
  return agent.apiKey
    ? null
    : 'This agent has no API key, so its runs are not scored and its RepID cannot change. Recreate it to start earning again.';
}
