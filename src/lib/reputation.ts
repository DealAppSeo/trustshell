/**
 * ERC-8004 on-chain reputation reads.
 *
 * These functions read directly from the deployed IdentityRegistry / ReputationRegistry contracts
 * (Base Sepolia chain 84532). They require the `ethers` package at runtime.
 *
 * `ethers` is an OPTIONAL PEER DEPENDENCY — it is not bundled. Install it separately:
 *   npm install ethers@^6
 *
 * For ethers-free environments use client.getRepID(agentId) (HTTP-based read via the backend).
 *
 * Re-exported through src/lib/index.ts so the first-class import works:
 *   import { getRepID, getReputationHistory, getAttestation } from '@hyperdag/trustshell';
 */

import { TrustShellError } from './trustshell';

export interface ReadOptions {
  /** An already-constructed ethers Provider. If omitted, a JsonRpcProvider is created from rpcUrl. */
  provider?: any;
  /** RPC URL for Base Sepolia. Defaults to 'https://sepolia.base.org'. */
  rpcUrl?: string;
  /** Override for the ERC-8004 IdentityRegistry address. */
  identityRegistryAddress?: string;
  /** Override for the ERC-8004 ReputationRegistry address. */
  reputationRegistryAddress?: string;
  /** Override for the repid-engine API URL (used for agent address→token-ID resolution). */
  engineUrl?: string;
}

export interface RepIDSummary {
  count: number;
  value: bigint;
  decimals: number;
}

export interface HistoryOptions extends ReadOptions {
  clientAddresses?: string[];
  tag1?: string;
  tag2?: string;
  includeRevoked?: boolean;
  limit?: number;
}

export interface FeedbackItem {
  clientAddress: string;
  feedbackIndex: number;
  value: bigint;
  decimals: number;
  tag1: string;
  tag2: string;
  isRevoked: boolean;
}

export interface AttestationDetails {
  txHash: string;
  blockNumber: number;
  agentId: string;
  clientAddress: string;
  feedbackIndex: number;
  value: bigint;
  decimals: number;
  tag1: string;
  tag2: string;
  endpoint: string;
  feedbackURI: string;
  feedbackHash: string;
}

export const IDENTITY_REGISTRY_ABI: string[] = [
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function getAgentWallet(uint256 agentId) view returns (address)',
  'function getMetadata(uint256 agentId, string memory metadataKey) view returns (bytes)',
];

export const REPUTATION_REGISTRY_ABI: string[] = [
  'function getSummary(uint256 agentId, address[] calldata clientAddresses, string calldata tag1, string calldata tag2) view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)',
  'function readAllFeedback(uint256 agentId, address[] calldata clientAddresses, string calldata tag1, string calldata tag2, bool includeRevoked) view returns (address[] memory clients, uint64[] memory feedbackIndexes, int128[] memory values, uint8[] memory valueDecimals, string[] memory tag1s, string[] memory tag2s, bool[] memory revokedStatuses)',
  'function readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex) view returns (int128 value, uint8 valueDecimals, string memory tag1, string memory tag2, bool isRevoked)',
  'function getClients(uint256 agentId) view returns (address[] memory)',
  'event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)',
];

/**
 * Load ethers lazily so the SDK loads cleanly when ethers is not installed.
 * Throws TrustShellError(424) with an actionable install instruction if absent.
 */
async function requireEthers(): Promise<any> {
  try {
    // Variable-specifier dynamic import avoids bundler static analysis of 'ethers'.
    const ethersPkg = 'ethers';
    const mod: any = await import(/* @vite-ignore */ ethersPkg);
    return mod.ethers ?? mod;
  } catch {
    throw new TrustShellError(
      'ethers is not installed. The on-chain reputation helpers (getRepID, getReputationHistory, ' +
      'getAttestation) require ethers@^6. Install it: npm install ethers@^6\n' +
      'For ethers-free environments use client.getRepID(agentId) (HTTP-based read).',
      424,
    );
  }
}

async function resolveAgentId(
  agentAddressOrId: string | number | bigint,
  provider: any,
  options?: ReadOptions,
): Promise<bigint> {
  if (typeof agentAddressOrId === 'number' || typeof agentAddressOrId === 'bigint') {
    return BigInt(agentAddressOrId);
  }
  if (typeof agentAddressOrId === 'string' && /^\d+$/.test(agentAddressOrId)) {
    return BigInt(agentAddressOrId);
  }
  const address = String(agentAddressOrId).toLowerCase();
  const engineUrl = options?.engineUrl || 'https://repid-engine-production.up.railway.app';
  try {
    const res = await fetch(`${engineUrl}/api/v1/agents`);
    if (res.ok) {
      const agents: any[] = await res.json();
      const matched = agents.find(
        (a) =>
          (a.erc8004_address && a.erc8004_address.toLowerCase() === address) ||
          (a.id && a.id.toLowerCase() === address),
      );
      if (matched && matched.erc8004_token_id) {
        return BigInt(matched.erc8004_token_id);
      }
    }
  } catch {
    // fall through
  }
  try {
    return BigInt(agentAddressOrId);
  } catch {
    throw new Error(`Could not resolve agent address/ID: ${agentAddressOrId}`);
  }
}

/**
 * Query the on-chain ReputationRegistry for an agent's RepID summary (count + weighted score).
 *
 * Requires `ethers@^6` — install separately. For HTTP-based reads use `client.getRepID(agentId)`.
 *
 * @param agentAddressOrId - ERC-8004 token ID (number/bigint/numeric-string) or agent wallet address.
 * @param options - RPC, registry addresses, optional pre-built provider.
 */
export async function getRepID(
  agentAddressOrId: string | number | bigint,
  options?: ReadOptions,
): Promise<RepIDSummary> {
  const ethers = await requireEthers();
  const provider =
    options?.provider || new ethers.JsonRpcProvider(options?.rpcUrl || 'https://sepolia.base.org');
  const agentId = await resolveAgentId(agentAddressOrId, provider, options);
  const reputationAddress =
    options?.reputationRegistryAddress || '0x8004B663056A597Dffe9eCcC1965A193B7388713';
  const contract = new ethers.Contract(reputationAddress, REPUTATION_REGISTRY_ABI, provider);
  let clients: string[] = [];
  try {
    clients = await contract.getClients(agentId);
  } catch {
    // ignore — no clients yet
  }
  if (clients.length === 0) {
    return { count: 0, value: 0n, decimals: 0 };
  }
  const result = await contract.getSummary(agentId, [...clients], 'hyperdag_repid', '');
  return {
    count: Number(result[0]),
    value: BigInt(result[1]),
    decimals: Number(result[2]),
  };
}

/**
 * Fetch paginated on-chain reputation history for an agent.
 *
 * Requires `ethers@^6` — install separately.
 */
export async function getReputationHistory(
  agentAddressOrId: string | number | bigint,
  options?: HistoryOptions,
): Promise<FeedbackItem[]> {
  const ethers = await requireEthers();
  const provider =
    options?.provider || new ethers.JsonRpcProvider(options?.rpcUrl || 'https://sepolia.base.org');
  const agentId = await resolveAgentId(agentAddressOrId, provider, options);
  const reputationAddress =
    options?.reputationRegistryAddress || '0x8004B663056A597Dffe9eCcC1965A193B7388713';
  const contract = new ethers.Contract(reputationAddress, REPUTATION_REGISTRY_ABI, provider);
  const clientsFilter = options?.clientAddresses ? [...options.clientAddresses] : [];
  const tag1 = options?.tag1 || '';
  const tag2 = options?.tag2 || '';
  const includeRevoked = options?.includeRevoked !== false;
  const result = await contract.readAllFeedback(agentId, clientsFilter, tag1, tag2, includeRevoked);
  const [clients, feedbackIndexes, values, valueDecimals, tag1s, tag2s, revokedStatuses] = result;
  const list: FeedbackItem[] = [];
  const len: number = clients.length;
  for (let i = 0; i < len; i++) {
    list.push({
      clientAddress: clients[i],
      feedbackIndex: Number(feedbackIndexes[i]),
      value: BigInt(values[i]),
      decimals: Number(valueDecimals[i]),
      tag1: tag1s[i],
      tag2: tag2s[i],
      isRevoked: revokedStatuses[i],
    });
  }
  if (options?.limit && options.limit > 0) {
    return list.slice(-options.limit);
  }
  return list;
}

/**
 * Decode a specific ERC-8004 ReputationRegistry attestation from a tx hash.
 *
 * Requires `ethers@^6` — install separately.
 */
export async function getAttestation(
  txHash: string,
  options?: ReadOptions,
): Promise<AttestationDetails> {
  const ethers = await requireEthers();
  const provider =
    options?.provider || new ethers.JsonRpcProvider(options?.rpcUrl || 'https://sepolia.base.org');
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) {
    throw new Error(`Transaction receipt not found for hash: ${txHash}`);
  }
  const reputationInterface = new ethers.Interface(REPUTATION_REGISTRY_ABI);
  const newFeedbackTopic = reputationInterface.getEvent('NewFeedback').topicHash;
  for (const log of receipt.logs) {
    if (log.topics[0] === newFeedbackTopic) {
      const parsedLog = reputationInterface.parseLog({ topics: log.topics, data: log.data });
      if (parsedLog) {
        return {
          txHash,
          blockNumber: receipt.blockNumber,
          agentId: parsedLog.args.agentId.toString(),
          clientAddress: parsedLog.args.clientAddress,
          feedbackIndex: Number(parsedLog.args.feedbackIndex),
          value: BigInt(parsedLog.args.value),
          decimals: Number(parsedLog.args.valueDecimals),
          tag1: parsedLog.args.tag1,
          tag2: parsedLog.args.tag2,
          endpoint: parsedLog.args.endpoint,
          feedbackURI: parsedLog.args.feedbackURI,
          feedbackHash: parsedLog.args.feedbackHash,
        };
      }
    }
  }
  throw new Error(`NewFeedback event not found in transaction: ${txHash}`);
}
