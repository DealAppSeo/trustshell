export interface ReadOptions {
    provider?: any;
    rpcUrl?: string;
    identityRegistryAddress?: string;
    reputationRegistryAddress?: string;
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
export declare function resolveAgentId(agentAddressOrId: string | number | bigint, provider: any, options?: ReadOptions): Promise<bigint>;
export declare function getRepID(agentAddressOrId: string | number | bigint, options?: ReadOptions): Promise<RepIDSummary>;
export declare function getReputationHistory(agentAddressOrId: string | number | bigint, options?: HistoryOptions): Promise<FeedbackItem[]>;
export declare function getAttestation(txHash: string, options?: ReadOptions): Promise<AttestationDetails>;
