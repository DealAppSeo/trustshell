import { X402Challenge } from './types';

export class X402PaymentRequiredError extends Error {
  public readonly challenge: X402Challenge;

  constructor(challenge: X402Challenge) {
    super(challenge.error || 'Payment Required');
    this.name = 'X402PaymentRequiredError';
    this.challenge = challenge;
  }
}

export class X402SettlementFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'X402SettlementFailedError';
  }
}
