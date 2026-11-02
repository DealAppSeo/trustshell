import { type Signer } from '../lib/install-key';
import { type Candidate } from './airlock';
/** The only approval source the gate accepts. An approval read from a worker's outbox is never trusted. */
export declare const TRUSTED_APPROVAL_SOURCES: readonly string[];
export declare const REVOKED_REASON = "mission token revoked";
export interface Approval {
    approver: string;
    source: string;
    approved_sha256: string[];
}
export interface PromotionRequest {
    mission_id: string;
    token: string;
    worker_identity: string;
    approval: Approval | null;
    candidates: Candidate[];
}
export interface Decision {
    mission_id: string;
    seq: number;
    name: string;
    sha256: string | null;
    decision: 'promote' | 'refuse';
    reasons: string[];
    token_sha256: string;
    approver: string | null;
    at: string;
}
export interface SignedDecision {
    decision: Decision;
    signature: string;
}
export declare class Promoter {
    private readonly o;
    readonly signer: Signer;
    private readonly key;
    private readonly missions;
    private seq;
    constructor(o: {
        keyDir: string;
        stateDir: string;
        quarantineDir: string;
        storeDir: string;
        canaries: string[];
    });
    private get revocationFile();
    /** Revoked token hashes, from disk, so a restarted promoter still refuses them. */
    revoked(): string[];
    revoke(tokenSha256: string): void;
    registerMission(missionId: string, tokenSha256: string): void;
    decide(req: PromotionRequest): SignedDecision[];
    private decideOne;
}
export declare function verifyDecision(sd: SignedDecision, promoter: Signer): boolean;
