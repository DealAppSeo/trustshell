import type { Agent } from './db';

/**
 * The key a Revoke click can authenticate with: the GRANTOR agent's own API key, and only if this
 * browser holds it.
 *
 * Why only that. The engine does not let anyone revoke keyless: POST /api/v1/grants/:id/revoke is in
 * no keyless allow-list (repid-engine src/middleware/auth.ts at fb1e350b), so no key is a 401, and a
 * key bound to a different agent than `requested_by` is a 403. The Revoke button used to send no key
 * at all (lib/repid-engine.ts revokeGrant takes an optional key; this caller never passed one), so
 * for every person it could only fail, behind a control that read as working. GiveRole already
 * revokes with the agent's stored key (components/give-role.tsx); this makes the /grants page do the
 * same thing.
 *
 * The agent is matched by id, the same field the engine matches `requested_by` against. A name is
 * never accepted in its place. Agents created before 2026-07-30 never stored a key (the backend
 * returns it once at register), and an agent created in another browser is not in this one's store;
 * both come back null, and the caller says so instead of sending a request that cannot succeed.
 */
export function revokeKeyFor(agents: Agent[], grantorId: string): string | null {
  const key = agents.find((a) => a.id === grantorId)?.apiKey?.trim();
  return key ? key : null;
}
