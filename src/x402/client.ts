import { X402Challenge, X402Payment } from './types';
import { constructPaymentAndSign } from './payment';

export class X402Client {
  private walletPrivateKey: string;
  private rpcUrl?: string;

  constructor(opts: { walletPrivateKey: string; rpcUrl?: string }) {
    this.walletPrivateKey = opts.walletPrivateKey;
    this.rpcUrl = opts.rpcUrl;
  }

  /**
   * Make an x402-paid HTTP call. On 402 response, construct payment,
   * settle on-chain, and retry with the X-PAYMENT header.
   */
  async fetch(url: string, init?: RequestInit): Promise<Response> {
    const response = await fetch(url, init);
    if (response.status === 402) {
      const challenge: X402Challenge = await response.json();
      const payment = await this.constructPayment(challenge);
      
      // Merge X-PAYMENT header into existing headers
      const headers = new Headers(init?.headers);
      headers.set('X-PAYMENT', Buffer.from(JSON.stringify(payment)).toString('base64'));
      
      const retryInit: RequestInit = {
        ...init,
        headers
      };
      return fetch(url, retryInit);
    }
    return response;
  }

  /**
   * Lower-level helper to construct payment for a known 402 challenge.
   */
  async constructPayment(challenge: X402Challenge): Promise<X402Payment> {
    return constructPaymentAndSign(challenge, this.walletPrivateKey, this.rpcUrl);
  }
}
