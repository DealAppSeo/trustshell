import { EventEmitter } from 'events';
import { FeedbackItem, AttestationDetails } from './reputation';
export interface TrustShellConfig {
    agentId?: string;
    apiKey?: string;
    apiUrl?: string;
    engineUrl?: string;
    timeout?: number;
    llmProvider?: string;
    llmModel?: string;
    profile?: 'conservative' | 'balanced' | 'pro';
    rpcUrl?: string;
}
export interface ScoreOptions {
    prompt?: string;
    provider?: string;
    model?: string;
}
export interface ScoreResult {
    trustScore: number;
    halScore: number;
    signals: {
        harmProbability: number;
        epistemicUncertainty: number;
        evidenceQuality: number;
        scopeAppropriateness: number;
        certaintyAtClaim: number;
    };
    verdict: 'PASS' | 'FLAG' | 'VETO';
    flaggedHallucination: boolean;
    provider: string;
    model: string;
    proofHash?: string;
    sessionId?: string;
}
export interface VerifyResult {
    repid: number;
    tier: string;
    lastAnchorTx: string | null;
    latestProofHash: string | null;
    provenanceChain: any[];
}
export interface AuditResult {
    chainStatus: 'VALID' | 'CHAIN_BREAK' | 'BROKEN';
    totalEntries: number;
    firstBreakId: string | null;
    verifiedAt: string;
    entries?: number;
    hashes?: string[];
    brokenAt?: {
        index: number;
        expected: string;
        actual: string;
    };
}
export declare class TrustShellError extends Error {
    status: number;
    constructor(message: string, status: number);
}
export declare class TrustShell extends EventEmitter {
    private config;
    private baseUrl;
    constructor(config?: TrustShellConfig);
    static init(config?: TrustShellConfig): TrustShell;
    init(config: TrustShellConfig): void;
    private getHeaders;
    score(response: string, options?: ScoreOptions): Promise<ScoreResult>;
    verifyOutput(response: string, options?: ScoreOptions): Promise<ScoreResult>;
    verify(agentId: string): Promise<VerifyResult>;
    audit(tableOrSessionId?: string): Promise<AuditResult>;
    executeA2A(options: {
        requestor_agent_id: string;
        provider_agent_id: string;
        prediction_topic: string;
        privateKey: string;
    }): Promise<{
        ok: boolean;
        tip_id: string;
        content: string;
        is_simulated: boolean;
        txHash?: string;
    }>;
    getRepID(agentId?: string | number): Promise<{
        value: number;
        count: number;
        decimals: number;
    }>;
    presentProof(agentId?: string | number): Promise<{
        id: number;
        agentId: string;
        proofType: string;
        tierProven: string;
        merkleRoot: string | null;
        zkCommitment: string | null;
        easSchema: string | null;
        easAttestationUid: string | null;
        createdAt: string;
    }>;
    getReputationHistory(agentId?: string | number, options?: any): Promise<FeedbackItem[]>;
    getAttestation(txHash: string, options?: any): Promise<AttestationDetails>;
    payAndEscrow(contractId: string, privateKey: string): Promise<any>;
    getLLMTrustScore(provider: string): Promise<number | null>;
    evaluate(text: string, certainty: number, options?: any): Promise<any>;
    report(decision: any): Promise<any>;
}
export default TrustShell;
