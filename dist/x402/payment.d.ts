import { X402Challenge, X402Payment } from './types';
/**
 * Construct and sign an on-chain x402 payment from a challenge.
 */
export declare function constructPaymentAndSign(challenge: X402Challenge, privateKey: string, rpcUrl?: string): Promise<X402Payment>;
//# sourceMappingURL=payment.d.ts.map