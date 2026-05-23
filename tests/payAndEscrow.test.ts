import { payAndEscrow, escrowWithPaymentFlow } from '../src/x402/client';
import { constructPaymentAndSign } from '../src/x402/payment';
import { X402Challenge } from '../src/x402/types';
import { ethers } from 'ethers';

describe('payAndEscrow', () => {
  const testPrivateKey = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const testChallenge: X402Challenge = {
    x402Version: 1,
    error: 'Payment Required',
    accepts: [{
      scheme: 'exact',
      network: 'base-sepolia',
      maxAmountRequired: '10000',
      amount: '10000',
      asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      payTo: '0xf6eE1768868c3266868edcA78bC41C50309cb22A',
      resource: '/api/v1/contracts/test-id/escrow',
      description: 'Service Contract test-id Escrow payment'
    }]
  };

  it('constructs valid EIP-712 X-PAYMENT for challenge', async () => {
    const payment = await constructPaymentAndSign(testChallenge, testPrivateKey);
    expect(payment.v).toBeDefined();
    expect(payment.r).toBeDefined();
    expect(payment.s).toBeDefined();
    expect(payment.from?.toLowerCase()).toBe(new ethers.Wallet(testPrivateKey).address.toLowerCase());
    expect(payment.to).toBe(testChallenge.accepts[0].payTo);
    expect(payment.value).toBe('10000');
  });

  it('handles simulated challenge bypass', async () => {
    const simChallenge = { ...testChallenge, is_simulated: true };
    const payment = await constructPaymentAndSign(simChallenge, testPrivateKey);
    expect(payment.is_simulated).toBe(true);
    expect(payment.txHash).toBe('0xSimulatedPaymentHash');
  });

  it('handles 402 challenge then succeeds', async () => {
    let step = 0;
    global.fetch = jest.fn().mockImplementation((url, init) => {
      step++;
      if (step === 1) {
        // Return 402
        return Promise.resolve({
          status: 402,
          ok: false,
          json: () => Promise.resolve(testChallenge)
        });
      } else {
        // Return 200
        expect(init?.headers?.['X-PAYMENT']).toBeDefined();
        return Promise.resolve({
          status: 200,
          ok: true,
          json: () => Promise.resolve({ status: 'escrowed', id: 'test-id' })
        });
      }
    }) as any;

    const result = await escrowWithPaymentFlow({
      contractId: 'test-id',
      privateKey: testPrivateKey,
      engineUrl: 'http://localhost:3000'
    });

    expect(result.status).toBe('escrowed');
    expect(result.id).toBe('test-id');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('handles legacy 200 response (no payment needed)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: () => Promise.resolve({ status: 'escrowed', id: 'legacy-id' })
    }) as any;

    const result = await escrowWithPaymentFlow({
      contractId: 'legacy-id',
      privateKey: testPrivateKey,
      engineUrl: 'http://localhost:3000'
    });

    expect(result.status).toBe('escrowed');
    expect(result.id).toBe('legacy-id');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
