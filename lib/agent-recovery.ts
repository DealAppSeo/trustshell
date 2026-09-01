import { REPID_ENGINE_URL } from './repid-engine';
import type { Agent } from './db';

/**
 * GETTING AN AGENT BACK WHEN THE BACKUP FILE IS ALSO GONE.
 *
 * The last resort, and it is a genuinely lesser one than lib/portable.ts — it rebuilds an agent
 * from `GET /api/v1/agents/:id/card`, which is public and therefore carries only public fields.
 * Two things do not come back, ever:
 *
 *   apiKey        the engine returns it once at registration and cannot reissue it. Without it
 *                 the agent answers prompts but earns no RepID — the run page already has an
 *                 honest notice for exactly this state, so recovery lands somewhere explained
 *                 rather than somewhere broken.
 *   constitution  never leaves the engine on a public endpoint. Whoever recovers an agent by id
 *                 is not necessarily its owner, and the rules an agent was given are not public
 *                 information. It has to be retyped.
 *
 * `recoverable` on the result carries both facts to the UI so the page states them BEFORE the
 * person commits, not after. Recovery that quietly produces a half-agent is how somebody spends
 * an afternoon wondering why their score stopped moving.
 *
 * ANYONE CAN DO THIS FOR ANY AGENT ID, and that is a property of the endpoint, not a hole opened
 * here: the card is public by design (middleware/auth.ts bypasses it) and exposes no secret. What
 * comes back is a local bookmark to a public profile. It confers nothing — it cannot sign, cannot
 * score, and cannot claim ownership, which is what /bind exists for.
 */

/** The engine's own validation, run locally so a mistyped id fails instantly and offline. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RecoverReason = 'invalid_id' | 'not_found' | 'unreachable';

export const RECOVER_ERRORS: Record<RecoverReason, string> = {
  invalid_id:
    "That doesn't look like an agent ID. It's a UUID — 36 characters with four dashes, shown under the agent's name on its run page.",
  not_found:
    'No agent with that ID exists on this engine. Check for a missing character, and check you copied it from this deployment.',
  unreachable:
    "Couldn't reach the engine to look that ID up. Nothing was changed here. Try again in a moment.",
};

export type RecoveredAgent = {
  agent: Agent;
  /** What the public card could not give back, for the page to say before the person commits. */
  missing: { apiKey: true; constitution: true };
  /** Public reputation, shown so the person can confirm this is the agent they meant. */
  repid: number | null;
};

export type RecoverResult =
  | { ok: true; recovered: RecoveredAgent }
  | { ok: false; reason: RecoverReason };

export async function recoverAgent(rawId: string): Promise<RecoverResult> {
  const id = rawId.trim();
  if (!UUID_RE.test(id)) return { ok: false, reason: 'invalid_id' };

  let res: Response;
  try {
    res = await fetch(`${REPID_ENGINE_URL}/api/v1/agents/${id}/card`);
  } catch {
    return { ok: false, reason: 'unreachable' };
  }

  if (res.status === 404) return { ok: false, reason: 'not_found' };
  if (!res.ok) return { ok: false, reason: 'unreachable' };

  let card: Record<string, unknown>;
  try {
    card = (await res.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: 'unreachable' };
  }

  const name = typeof card.name === 'string' && card.name ? card.name : null;
  // A card with no name is a shape we do not understand; inventing "Recovered agent" would put a
  // label nobody chose next to an id nobody can verify.
  if (!name) return { ok: false, reason: 'not_found' };

  const created = millis(card.created_at);
  const lastActive = millis(card.last_active_at);

  return {
    ok: true,
    recovered: {
      agent: {
        id,
        name,
        description: typeof card.description === 'string' ? card.description : undefined,
        createdAt: created ?? Date.now(),
        totalPrompts: typeof card.total_decisions === 'number' ? card.total_decisions : 0,
        lastUsedAt: lastActive ?? created ?? Date.now(),
        // Left undefined on purpose — see the header. The run page detects this and says so.
        apiKey: undefined,
      },
      missing: { apiKey: true, constitution: true },
      repid: typeof card.repid === 'number' ? card.repid : null,
    },
  };
}

function millis(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}
