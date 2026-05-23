import { X402Challenge, X402Payment } from './types';

/**
 * Construct and sign an on-chain x402 payment from a challenge.
 * Currently stubbed pending V1 implementation.
 */
export async function constructPaymentAndSign(
  challenge: X402Challenge,
  privateKey: string,
  rpcUrl?: string
): Promise<X402Payment> {
  throw new Error('NOT_IMPLEMENTED — see ROADMAP.md');
}
