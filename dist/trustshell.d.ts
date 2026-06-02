/**
 * @hyperdag/trustshell
 * Trust scoring SDK for AI — add HAL evaluation to any LLM app in 3 lines.
 *
 * From S-SDK1 spec + S-BUILD implementation.
 */
export interface TrustShellConfig {
    apiKey?: string;
    apiUrl?: string;
    timeout?: number;
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
    chainStatus: 'VALID' | 'CHAIN_BREAK';
    totalEntries: number;
    firstBreakId: string | null;
    verifiedAt: string;
}
export declare class TrustShellError extends Error {
    status: number;
    constructor(message: string, status: number);
}
export declare class TrustShell {
    private config;
    private baseUrl;
    constructor(config?: TrustShellConfig);
    private getHeaders;
    score(response: string, options?: ScoreOptions): Promise<ScoreResult>;
    verify(agentId: string): Promise<VerifyResult>;
    audit(table?: string): Promise<AuditResult>;
}
export default TrustShell;
