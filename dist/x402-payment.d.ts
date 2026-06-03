export interface OutboundPaymentPayload {
    v?: number;
    r?: string;
    s?: string;
    from: string;
    to: string;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: string;
    is_simulated?: boolean;
    txHash: string;
}
export declare function constructPaymentAndSign(challenge: any, privateKey: string, rpcUrl?: string): Promise<OutboundPaymentPayload>;
