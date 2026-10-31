export type Fact = 'true' | 'false' | 'not_measured';
export type Rpc = (method: string, params: unknown[]) => Promise<unknown>;
export declare const CORE_FACTS: readonly ["raterIsPayer", "paidIsBoundWallet", "paymentBeforeFeedback", "raterNotOwnerOrOperator"];
export declare const FACTS: readonly ["raterIsPayer", "paidIsBoundWallet", "paymentBeforeFeedback", "raterNotOwnerOrOperator", "paidIsBoundWalletAtPayment", "paidIsBoundWalletNow", "paymentAfterRegistration", "noReturnTransfer"];
export type FactName = (typeof FACTS)[number];
export interface GroundingNetwork {
    identity: string;
    reputation: string;
    /** Tokens whose Transfer counts as payment. Anything else is not a payment, however it looks. */
    stablecoins: string[];
    rpc: string;
}
/**
 * Official ERC-8004 deployments, read from the chain 2026-10-31. USDC is the only payment token.
 * The default RPCs are Base's own: on 2026-10-31 they answered receipts and eth_call at old blocks,
 * where publicnode answered null (Sepolia) or asked for a token (mainnet).
 */
export declare const GROUNDING_NETWORKS: Record<string, GroundingNetwork>;
export interface GroundingResult {
    feedbackTx: string;
    network: string;
    agentId: string | null;
    rater: string | null;
    paymentTx: string | null;
    /** Where paymentTx came from: given by the caller, the feedbackHash, or the proofOfPayment in the committed file. */
    paymentSource: 'given' | 'feedbackHash' | 'file' | null;
    payee: string | null;
    amount: string | null;
    facts: Record<FactName, Fact>;
    detail: Partial<Record<FactName, string>>;
    grounded: 'yes' | 'no' | 'not_measured';
}
/** A JSON-RPC error. `reverted` separates "the call reverted" (an answer) from "we could not ask". */
export declare class RpcError extends Error {
    readonly reverted: boolean;
    constructor(message: string, reverted: boolean);
}
export declare function httpRpc(url: string, timeoutMs?: number): Rpc;
export type Tape = Array<[string, {
    result?: unknown;
    error?: string;
    resultaat?: unknown;
    fout?: string;
}]>;
/** Wraps an Rpc and writes every call and its answer to `tape`. */
export declare function recordingRpc(inner: Rpc, tape: Tape): Rpc;
/** Answers only from a tape. A call not on it throws a non-revert error, so its fact is not_measured. */
export declare function replayRpc(tape: Tape): Rpc;
/** Reads a feedbackURI. The caller owns the fetch policy (scripts/verify-feedback-write.ts: public https only). */
export type FileFetcher = (uri: string) => Promise<{
    status: number;
    body: Uint8Array;
} | {
    error: string;
}>;
export declare function groundFeedback(rpc: Rpc, networkId: string, feedbackTx: string, opts?: {
    paymentTx?: string;
    fetchFile?: FileFetcher;
}): Promise<GroundingResult>;
export declare function verdict(facts: Record<FactName, Fact>): GroundingResult['grounded'];
