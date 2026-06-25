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

/** Canonical minted squad agents — token IDs verified on-chain 2026-06-25. */
export const MINTED_SQUAD_AGENTS = [
  { name: 'trinity-sophia', displayName: 'SOPHIA', tokenId: 3747 },
  { name: 'trinity-apm', displayName: 'APM', tokenId: 6655 },
  { name: 'trinity-veritas', displayName: 'VERITAS', tokenId: 5864 },
  { name: 'trinity-shofet', displayName: 'SHOFET', tokenId: 5863 },
] as const;

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

export async function fetchSquadLeaderboard(
  options?: { rpcUrl?: string; registryAddress?: string }
): Promise<AgentRepIDEntry[]> {
  const entries = await Promise.all(
    MINTED_SQUAD_AGENTS.map(async (agent) => {
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

  return entries.sort((a, b) => (b.repid ?? -1) - (a.repid ?? -1));
}