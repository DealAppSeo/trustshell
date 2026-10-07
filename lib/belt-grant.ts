/**
 * Turn "give this agent the CTO role with these tools" into the grant the engine mints.
 *
 * A belt grant is a `cold` (read-only, theta_cold = 0) grant from the person's PAI to one of their
 * agents, with one `read:tool:<id>` capability per tool and the role as its ceiling. It carries no
 * spend, so a new agent with no collateral can give one.
 *
 * Only STARTER tools can be granted here. A tool on the "Needs your OK first" list spends money,
 * acts in public or cannot be undone, and is refused before anything is sent, so a stale or edited
 * form can never slip one into a grant.
 *
 * What a belt grant is NOT yet: a gate. It is a record anyone can check
 * (`POST /grants/:id/authorize`), and nothing asks it before a tool runs. The page says so.
 */
import { BELTS, type BeltRole } from './belts';
import type { GrantClass, Caveat } from './repid-engine';

export const BELT_GRANT_DAYS = [7, 30, 90] as const;
export type BeltGrantDays = (typeof BELT_GRANT_DAYS)[number];

const PREFIX = 'read:tool:';

export const beltCapability = (toolId: string) => `${PREFIX}${toolId}`;

/** The tool ids a grant carries, read back from its capabilities. */
export function beltToolsOf(capabilities: readonly string[]): string[] {
  return capabilities.filter((c) => c.startsWith(PREFIX)).map((c) => c.slice(PREFIX.length));
}

export interface BeltGrantRequest {
  grantorAgentId: string;
  granteeAgentId: string;
  grantClass: GrantClass;
  capabilities: string[];
  caveats: Caveat[];
  ttlSeconds: number;
  role: BeltRole;
  idempotencyKey: string;
}

export function buildBeltGrant(input: {
  grantorId: string;
  granteeId: string;
  role: BeltRole;
  toolIds: readonly string[];
  days: number;
  idempotencyKey: string;
}): { ok: true; request: BeltGrantRequest } | { ok: false; reason: string } {
  const belt = BELTS[input.role];
  if (!belt) return { ok: false, reason: `"${input.role}" is not a role with a belt.` };
  if (!input.grantorId || !input.granteeId) return { ok: false, reason: 'Choose who gives the role and who gets it.' };
  if (input.grantorId === input.granteeId) return { ok: false, reason: 'An agent cannot give a role to itself. Choose a different agent.' };
  if (!(BELT_GRANT_DAYS as readonly number[]).includes(input.days)) return { ok: false, reason: `Choose ${BELT_GRANT_DAYS.join(', ')} days.` };

  const starter = new Set(belt.starter.map((t) => t.id));
  const ids = [...new Set(input.toolIds)];
  if (ids.length === 0) return { ok: false, reason: 'Choose at least one tool.' };
  const notStarter = ids.filter((id) => !starter.has(id));
  if (notStarter.length > 0) {
    return { ok: false, reason: `Not in the ${belt.title} starter belt, so not given here: ${notStarter.join(', ')}.` };
  }

  return {
    ok: true,
    request: {
      grantorAgentId: input.grantorId,
      granteeAgentId: input.granteeId,
      grantClass: 'cold',
      capabilities: ids.map(beltCapability),
      caveats: [],
      ttlSeconds: input.days * 86400,
      role: input.role,
      idempotencyKey: input.idempotencyKey,
    },
  };
}
