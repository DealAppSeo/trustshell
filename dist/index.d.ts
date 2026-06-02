import { EventEmitter } from 'events';
import { TrustShellConfig, Decision, RepIDResult, AgentRepID } from './types';
import { ReadOptions, HistoryOptions, RepIDSummary, FeedbackItem, AttestationDetails } from './reputation';
export declare class TrustShell extends EventEmitter {
    private config;
    private engineUrl;
    constructor(config: TrustShellConfig);
    evaluate(text: string, certainty: number, options?: Partial<Decision>): Promise<RepIDResult>;
    report(decision: Decision): Promise<RepIDResult>;
    getRepID(agentAddressOrId?: string | number | bigint, options?: ReadOptions): Promise<AgentRepID | RepIDSummary>;
    getLLMTrustScore(provider: string): Promise<number | null>;
    payAndEscrow(contractId: string, privateKey: string): Promise<any>;
    getReputationHistory(agentAddressOrId?: string | number | bigint, options?: HistoryOptions): Promise<FeedbackItem[]>;
    getAttestation(txHash: string, options?: ReadOptions): Promise<AttestationDetails>;
}
export * from './types';
export * from './x402/client';
export * from './x402/types';
export * from './x402/errors';
export * from './x402/payment';
export * from './reputation';
//# sourceMappingURL=index.d.ts.map