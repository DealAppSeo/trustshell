/**
 * Read-only ERC-8004 ReputationRegistry helpers for the landing site.
 * Uses public Base Sepolia RPC — no Railway, no keys, no writes.
 */

import { ethers } from 'ethers';

export const BASE_SEPOLIA_RPC = 'https://sepolia.base.org';
export const REPUTATION_REGISTRY = '0x8004B663056A597Dffe9eCcC1965A193B7388713';

const REPUTATION_REGISTRY_ABI = [
  'function getSummary(uint256 agentId, address[] calldata clientAddresses, string calldata tag1, string calldata tag2) view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)',
  'function getClients(uint256 agentId) view returns (address[] memory)',
] as const;

/**
 * Fallback minted squad — token IDs verified on-chain 2026-06-25.
 * Used only when the live `/api/v1/agents/minted` endpoint is unreachable
 * (e.g. not yet deployed), so the leaderboard never breaks. Once the endpoint
 * is live the full minted roster is read dynamically and grows as agents mint.
 */
export const MINTED_SQUAD_AGENTS = [
  { name: 'trinity-sophia', displayName: 'SOPHIA', tokenId: 3747 },
  { name: 'trinity-apm', displayName: 'APM', tokenId: 6655 },
  { name: 'trinity-veritas', displayName: 'VERITAS', tokenId: 5864 },
  { name: 'trinity-shofet', displayName: 'SHOFET', tokenId: 5863 },
] as const;

/** Base URL for the public repid-engine endpoints (no keys, read-only). */
const REPID_ENGINE_URL =
  process.env.NEXT_PUBLIC_REPID_ENGINE_URL ??
  'https://repid-engine-production.up.railway.app';

/** Shape of one agent in the public `/api/v1/agents/minted` response. */
interface MintedAgentApi {
  name?: string;
  display_name?: string;
  agent_id?: string;
  erc8004_token_id?: number | string | null;
  current_repid?: number | null;
  tier?: string | null;
}

/** Minimal agent descriptor the leaderboard needs (name + on-chain token). */
export interface MintedAgent {
  name: string;
  displayName: string;
  tokenId: number;
}

export type RepidTier =
  | 'PROBATIONARY'
  | 'EARNING'
  | 'ESTABLISHED'
  | 'AUTONOMOUS'
  | 'VETERAN';

export interface AgentRepIDEntry {
  name: string;
  displayName: string;
  tokenId: number;
  repid: number | null;
  tier: RepidTier | null;
  feedbackCount: number;
  source: 'on-chain' | 'no-on-chain-writes';
  basescanUrl: string;
}

export function repidToTier(score: number): RepidTier {
  if (score >= 8000) return 'VETERAN';
  if (score >= 5000) return 'AUTONOMOUS';
  if (score >= 1000) return 'ESTABLISHED';
  if (score >= 500) return 'EARNING';
  return 'PROBATIONARY';
}

function scaleRepID(raw: bigint, decimals: number): number {
  if (decimals === 0) return Number(raw);
  const divisor = 10 ** decimals;
  return Number(raw) / divisor;
}

export async function fetchAgentRepID(
  tokenId: number,
  options?: { rpcUrl?: string; registryAddress?: string }
): Promise<{ repid: number | null; feedbackCount: number; source: 'on-chain' | 'no-on-chain-writes' }> {
  const provider = new ethers.JsonRpcProvider(options?.rpcUrl ?? BASE_SEPOLIA_RPC);
  const registry = options?.registryAddress ?? REPUTATION_REGISTRY;
  const contract = new ethers.Contract(registry, REPUTATION_REGISTRY_ABI, provider);

  let clients: string[] = [];
  try {
    clients = await contract.getClients(tokenId);
  } catch {
    return { repid: null, feedbackCount: 0, source: 'no-on-chain-writes' };
  }

  if (!clients.length) {
    return { repid: null, feedbackCount: 0, source: 'no-on-chain-writes' };
  }

  const result = await contract.getSummary(tokenId, [...clients], 'hyperdag_repid', '');
  const feedbackCount = Number(result[0]);
  const repid = scaleRepID(BigInt(result[1]), Number(result[2]));

  return { repid, feedbackCount, source: 'on-chain' };
}

/**
 * Fetch the dynamic list of minted agents from the public engine endpoint.
 * Returns the minted roster (name/displayName/tokenId) so new agents appear
 * automatically as they mint. Returns `null` on 404/error/timeout so callers
 * can fall back to the hard-coded {@link MINTED_SQUAD_AGENTS}.
 */
export async function fetchMintedAgents(
  options?: { engineUrl?: string }
): Promise<MintedAgent[] | null> {
  const base = options?.engineUrl ?? REPID_ENGINE_URL;
  try {
    const res = await fetch(`${base}/api/v1/agents/minted`, {
      signal: AbortSignal.timeout(8000),
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return null; // 404 (not deployed yet) or any non-2xx → fall back
    const json = (await res.json()) as { agents?: MintedAgentApi[] };
    if (!Array.isArray(json.agents)) return null;

    const mapped = json.agents
      .map((a): MintedAgent | null => {
        const tokenId = Number(a.erc8004_token_id);
        if (!a.erc8004_token_id || !Number.isFinite(tokenId)) return null; // no on-chain token → not leaderboard-able
        return {
          name: a.name ?? a.agent_id ?? `agent-${tokenId}`,
          displayName: (a.display_name ?? a.name ?? `#${tokenId}`).toUpperCase(),
          tokenId,
        };
      })
      .filter((a): a is MintedAgent => a !== null);

    return mapped.length > 0 ? mapped : null;
  } catch {
    return null; // network/timeout → fall back
  }
}

/** Where the leaderboard roster came from — the live engine, or the fallback. */
export type RosterSource = 'engine-minted' | 'fallback-squad';

export interface Leaderboard {
  entries: AgentRepIDEntry[];
  rosterSource: RosterSource;
}

/**
 * Build the leaderboard: read the dynamic minted roster from the engine (so new
 * agents appear as they mint), then read each agent's RepID live from chain.
 * Falls back to the hard-coded {@link MINTED_SQUAD_AGENTS} if the engine's
 * `/api/v1/agents/minted` endpoint is unreachable, so the ship never breaks.
 */
export async function fetchLeaderboard(
  options?: { rpcUrl?: string; registryAddress?: string; engineUrl?: string }
): Promise<Leaderboard> {
  const dynamicAgents = await fetchMintedAgents({ engineUrl: options?.engineUrl });
  const rosterSource: RosterSource = dynamicAgents ? 'engine-minted' : 'fallback-squad';
  const agents: readonly MintedAgent[] = dynamicAgents ?? MINTED_SQUAD_AGENTS;

  const entries = await Promise.all(
    agents.map(async (agent) => {
      const { repid, feedbackCount, source } = await fetchAgentRepID(agent.tokenId, options);
      return {
        name: agent.name,
        displayName: agent.displayName,
        tokenId: agent.tokenId,
        repid,
        tier: repid != null ? repidToTier(repid) : null,
        feedbackCount,
        source,
        basescanUrl: `https://sepolia.basescan.org/token/${REPUTATION_REGISTRY}?a=${agent.tokenId}`,
      };
    })
  );

  entries.sort((a, b) => (b.repid ?? -1) - (a.repid ?? -1));
  return { entries, rosterSource };
}

/** Back-compat: entries-only leaderboard (roster source is discarded). */
export async function fetchSquadLeaderboard(
  options?: { rpcUrl?: string; registryAddress?: string; engineUrl?: string }
): Promise<AgentRepIDEntry[]> {
  const { entries } = await fetchLeaderboard(options);
  return entries;
}