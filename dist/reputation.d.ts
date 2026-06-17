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
export declare const IDENTITY_REGISTRY_ABI: string[];
export declare const REPUTATION_REGISTRY_ABI: string[];
/**
 * Query the on-chain ReputationRegistry for an agent's RepID summary (count + weighted score).
 *
 * Requires `ethers@^6` — install separately. For HTTP-based reads use `client.getRepID(agentId)`.
 *
 * @param agentAddressOrId - ERC-8004 token ID (number/bigint/numeric-string) or agent wallet address.
 * @param options - RPC, registry addresses, optional pre-built provider.
 */
export declare function getRepID(agentAddressOrId: string | number | bigint, options?: ReadOptions): Promise<RepIDSummary>;
/**
 * Fetch paginated on-chain reputation history for an agent.
 *
 * Requires `ethers@^6` — install separately.
 */
export declare function getReputationHistory(agentAddressOrId: string | number | bigint, options?: HistoryOptions): Promise<FeedbackItem[]>;
/**
 * Decode a specific ERC-8004 ReputationRegistry attestation from a tx hash.
 *
 * Requires `ethers@^6` — install separately.
 */
export declare function getAttestation(txHash: string, options?: ReadOptions): Promise<AttestationDetails>;
//# sourceMappingURL=reputation.d.ts.map