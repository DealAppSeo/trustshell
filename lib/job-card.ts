/**
 * THE AGENT'S JOB CARD: its role, its belt and what it may and may not do, sent with every run.
 *
 * Until 2026-10-07 an agent was never told any of this. A person could give it the CMO role and
 * the CMO belt on /agents, a real grant was minted, and the model answering on /run still received
 * only the owner's rules and the question. Asked "what can you do for me?" it could only guess.
 * Now /run and /pai fetch the agent's live grants and send this card ahead of the rules.
 *
 * WHAT IT IS BUILT FROM, AND NOTHING ELSE. Only grants that are live (the engine computes that
 * against the whole chain) and name this agent as the grantee. Tool lines come from lib/belts.ts,
 * the same list the role picker shows. A tool id the belt list does not know is listed by its id
 * rather than described from a guess. No grants means no card, and the prompt is unchanged.
 *
 * WHAT IT DOES NOT DO: enforce anything. The card tells the model its limits; the engine's grant
 * check and the owner's wallet are what hold them.
 */
import { BELTS, BELT_ROLES, type BeltRole } from './belts';
import type { ListedGrant } from './repid-engine';

const TOOL_PREFIX = 'read:tool:';
export const MAX_JOB_CARD_CHARS = 2000;

const ROLE_TITLES: Record<string, string> = { ceo: 'PAI (CEO)', cto: 'CTO', cmo: 'CMO', cfo: 'CFO' };

function isBeltRole(r: string): r is BeltRole {
  return (BELT_ROLES as readonly string[]).includes(r);
}

export interface JobCard {
  role: string | null;
  tools: Array<{ id: string; name: string; use: string | null }>;
  /** The belt's gated tools: listed so the agent can say what needs the owner's OK. */
  needsOk: string[];
  /** Earliest expiry across the grants the card is built from (ISO). */
  until: string | null;
  text: string;
}

/** Build the card for `agentId` from its grants. Null when it holds no live grant. */
export function jobCard(agentId: string, agentName: string, grants: readonly ListedGrant[]): JobCard | null {
  const mine = grants.filter((g) => g.live && g.grantee_agent_id === agentId);
  if (mine.length === 0) return null;

  const role = mine.map((g) => (g.role ?? '').toLowerCase()).find((r) => r) ?? null;
  const belt = role && isBeltRole(role) ? BELTS[role] : null;

  const ids = Array.from(
    new Set(mine.flatMap((g) => g.capabilities.filter((c) => c.startsWith(TOOL_PREFIX)).map((c) => c.slice(TOOL_PREFIX.length)))),
  );
  const other = Array.from(new Set(mine.flatMap((g) => g.capabilities.filter((c) => !c.startsWith(TOOL_PREFIX)))));
  const known = new Map((belt?.starter ?? []).map((t) => [t.id, t]));
  const tools = ids.map((id) => {
    const t = known.get(id);
    return { id, name: t?.name ?? id, use: t?.use ?? null };
  });
  const needsOk = (belt?.gated ?? []).map((g) => g.name);
  const until = mine.map((g) => g.expires_at).filter(Boolean).sort()[0] ?? null;

  const lines: string[] = ['## Your job'];
  const title = role ? ROLE_TITLES[role] ?? role : null;
  lines.push(
    title
      ? `You are ${agentName}, working as ${title} for your owner.${belt ? ` ${belt.purpose}` : ''}`
      : `You are ${agentName}. Your owner has given you the permissions below.`,
  );
  if (tools.length > 0) {
    lines.push('', `Tools you may use, read-only${until ? `, until ${until.slice(0, 10)}` : ''}:`);
    for (const t of tools) lines.push(`- ${t.name}${t.use ? `: ${t.use}` : ''}`);
  }
  if (other.length > 0) lines.push('', `Other permissions: ${other.join(', ')}.`);
  if (needsOk.length > 0) lines.push('', `These need your owner's OK first, and you do not have it: ${needsOk.join(', ')}.`);
  lines.push(
    '',
    'You may not spend, post in public, or use any tool not listed here unless your owner approves it. If asked what you can do, answer from this card.',
  );

  let text = lines.join('\n');
  if (text.length > MAX_JOB_CARD_CHARS) text = text.slice(0, MAX_JOB_CARD_CHARS - 1) + '…';
  return { role, tools, needsOk, until, text };
}
