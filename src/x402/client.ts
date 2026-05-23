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

export interface PayAndEscrowOptions {
  contractId: string;
  privateKey: string;
  facilitatorChallenge: X402Challenge;
  engineUrl?: string;
  rpcUrl?: string;
}

export async function payAndEscrow(opts: PayAndEscrowOptions): Promise<any> {
  const payment = await constructPaymentAndSign(opts.facilitatorChallenge, opts.privateKey, opts.rpcUrl);
  const xPaymentHeader = Buffer.from(JSON.stringify(payment)).toString('base64');
  const engineUrl = opts.engineUrl || 'https://repid-engine-production.up.railway.app';

  const response = await fetch(`${engineUrl}/api/v1/contracts/${opts.contractId}/escrow`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-PAYMENT': xPaymentHeader,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    let errorJson;
    try {
      errorJson = JSON.parse(text);
    } catch {
      throw new Error(`Escrow failed with status ${response.status}: ${text}`);
    }
    throw new Error(errorJson.message || errorJson.error || `Escrow failed: ${text}`);
  }

  return response.json();
}

export async function escrowWithPaymentFlow(opts: {
  contractId: string;
  privateKey: string;
  engineUrl?: string;
  rpcUrl?: string;
}): Promise<any> {
  const engineUrl = opts.engineUrl || 'https://repid-engine-production.up.railway.app';
  const challengeRes = await fetch(`${engineUrl}/api/v1/contracts/${opts.contractId}/escrow`, {
    method: 'POST',
  });

  if (challengeRes.status !== 402) {
    if (challengeRes.ok) return challengeRes.json();
    const text = await challengeRes.text();
    throw new Error(`Unexpected status ${challengeRes.status}: ${text}`);
  }

  const challenge = await challengeRes.json() as X402Challenge;
  return payAndEscrow({
    contractId: opts.contractId,
    privateKey: opts.privateKey,
    facilitatorChallenge: challenge,
    engineUrl,
    rpcUrl: opts.rpcUrl
  });
}
