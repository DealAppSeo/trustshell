import { X402Challenge, X402Payment } from './types';
export declare class X402Client {
    private walletPrivateKey;
    private rpcUrl?;
    constructor(opts: {
        walletPrivateKey: string;
        rpcUrl?: string;
    });
    /**
     * Make an x402-paid HTTP call. On 402 response, construct payment,
     * settle on-chain, and retry with the X-PAYMENT header.
     */
    fetch(url: string, init?: RequestInit): Promise<Response>;
    /**
     * Lower-level helper to construct payment for a known 402 challenge.
     */
    constructPayment(challenge: X402Challenge): Promise<X402Payment>;
}
export interface PayAndEscrowOptions {
    contractId: string;
    privateKey: string;
    facilitatorChallenge: X402Challenge;
    engineUrl?: string;
    rpcUrl?: string;
}
export declare function payAndEscrow(opts: PayAndEscrowOptions): Promise<any>;
export declare function escrowWithPaymentFlow(opts: {
    contractId: string;
    privateKey: string;
    engineUrl?: string;
    rpcUrl?: string;
}): Promise<any>;
//# sourceMappingURL=client.d.ts.map