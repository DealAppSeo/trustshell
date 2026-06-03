import { OutboundPaymentPayload } from './x402-payment';
export interface X402ClientConfig {
    walletPrivateKey: string;
    rpcUrl?: string;
}
export declare class X402Client {
    private walletPrivateKey;
    private rpcUrl?;
    constructor(opts: X402ClientConfig);
    /**
     * Make an x402-paid HTTP call. On 402 response, construct payment,
     * settle on-chain, and retry with the X-PAYMENT header.
     */
    fetch(url: string, init?: RequestInit): Promise<Response>;
    /**
     * Lower-level helper to construct payment for a known 402 challenge.
     */
    constructPayment(challenge: any): Promise<OutboundPaymentPayload>;
}
export interface PayAndEscrowOptions {
    contractId: string;
    privateKey: string;
    facilitatorChallenge: any;
    engineUrl?: string;
    rpcUrl?: string;
}
export declare function payAndEscrow(opts: PayAndEscrowOptions): Promise<any>;
export interface EscrowOptions {
    contractId: string;
    privateKey: string;
    engineUrl?: string;
    rpcUrl?: string;
}
export declare function escrowWithPaymentFlow(opts: EscrowOptions): Promise<any>;
