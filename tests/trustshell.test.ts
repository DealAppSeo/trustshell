/**
 * TrustShell SDK Tests (S-BUILD Phase 1)
 * Mock fetch to avoid live calls.
 */

import { TrustShell, TrustShellError, buildX402Payment } from '../src/lib/trustshell';

describe('TrustShell', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('constructor', () => {
    it('uses default API URL when none provided', () => {
      const shell = new TrustShell();
      // @ts-ignore access private for test
      expect((shell as any).baseUrl).toContain('repid-engine-production');
    });

    it('uses custom API URL when provided', () => {
      const shell = new TrustShell({ apiUrl: 'https://example.com' });
      // @ts-ignore
      expect((shell as any).baseUrl).toBe('https://example.com');
    });
  });

  describe('score()', () => {
    it('scores a response and returns trust score 0-100 (inverts risk)', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          hal_score: 0.13,
          hal_verdict: 'PASS',
          hal_flagged_hallucination: false,
          hal_signals: {
            harm_probability: 0.05,
            epistemic_uncertainty: 0.2,
            evidence_quality: 0.85,
            scope_appropriateness: 0.9,
            certainty_at_claim: 0.8,
          },
          provider_used: 'openai',
          model_used: 'gpt-4o',
        }),
      } as any);

      const shell = new TrustShell();
      const result = await shell.score('The capital of France is Paris.');

      expect(result.trustScore).toBe(87); // 1-0.13 = 0.87 * 100
      expect(result.halScore).toBe(0.13);
      expect(result.verdict).toBe('PASS');
      expect(result.flaggedHallucination).toBe(false);
      expect(result.provider).toBe('openai');
    });

    it('handles 401 unauthorized', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' } as any);

      const shell = new TrustShell({ apiKey: 'bad' });
      await expect(shell.score('test')).rejects.toThrow(TrustShellError);
    });

    it('handles timeout', async () => {
      global.fetch = jest.fn(() => new Promise((_, reject) => {
        const err = new Error('AbortError');
        err.name = 'AbortError';
        reject(err);
      })) as any;

      const shell = new TrustShell({ timeout: 1 });
      await expect(shell.score('test')).rejects.toThrow('timed out');
    });
  });

  describe('verify()', () => {
    it('returns agent RepID and tier', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ repid: 720, tier: 'ESTABLISHED' }),
      } as any);

      const shell = new TrustShell();
      const res = await shell.verify('agent-123');
      expect(res.repid).toBe(720);
      expect(res.tier).toBe('ESTABLISHED');
    });
  });

  describe('audit()', () => {
    it('returns VALID chain status', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'VALID', total_entries: 742 }),
      } as any);

      const shell = new TrustShell();
      const res = await shell.audit();
      expect(res.chainStatus).toBe('VALID');
      expect(res.totalEntries).toBe(742);
    });
  });

  // --- E2E-gap methods (this branch) ---

  describe('register()', () => {
    it('POSTs signup fields and returns agent_id + one-time api_key', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          agent_id: 'agent-uuid-1',
          api_key: 'ts_live_secret_shown_once',
          repid: 200,
          tier: 'PROBATIONARY',
          erc8004_token_id: 42,
        }),
      });
      global.fetch = fetchMock as any;

      const shell = new TrustShell();
      const res = await shell.register({ agentName: 'my-agent', description: 'a test agent' });

      expect(res.agentId).toBe('agent-uuid-1');
      expect(res.apiKey).toBe('ts_live_secret_shown_once');
      expect(res.repid).toBe(200);
      expect(res.tier).toBe('PROBATIONARY');
      expect(res.erc8004TokenId).toBe(42);

      // Verify it hit the right endpoint with snake_case body.
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toContain('/api/v1/agents/register');
      const body = JSON.parse(init.body);
      expect(body.agent_name).toBe('my-agent');
      expect(body.description).toBe('a test agent');
    });

    it('throws TrustShellError on non-2xx', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: async () => ({ error: 'Duplicate registration' }),
      } as any);
      const shell = new TrustShell();
      await expect(shell.register({ agentName: 'dup' })).rejects.toThrow(TrustShellError);
    });
  });

  describe('registerHuman()', () => {
    it('returns agentId, privateId and repId', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          agentId: 'human-uuid-1',
          privateId: 'human-1699-abc',
          repId: 200,
          tier: 'PROBATIONARY',
        }),
      } as any);

      const shell = new TrustShell();
      const res = await shell.registerHuman();
      expect(res.agentId).toBe('human-uuid-1');
      expect(res.privateId).toBe('human-1699-abc');
      expect(res.repId).toBe(200);
    });
  });

  describe('listServices()', () => {
    it('maps snake_case rows and computes a price range', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              id: 'svc-1',
              provider_agent_id: 'prov-1',
              service_type: 'verification',
              service_name: 'Verify-a-claim',
              description: 'Checks a factual claim',
              base_price_usdc_raw: 100000,
              min_repid_to_purchase: 500,
              active: true,
            },
            {
              id: 'svc-2',
              provider_agent_id: 'prov-2',
              service_type: 'cross_validation',
              service_name: 'Cross-validate',
              description: null,
              base_price_usdc_raw: 250000,
              min_repid_to_purchase: 1000,
              active: true,
            },
          ],
          count: 2,
          limit: 50,
          offset: 0,
        }),
      });
      global.fetch = fetchMock as any;

      const shell = new TrustShell();
      const page = await shell.listServices({ type: 'verification' });

      expect(page.services).toHaveLength(2);
      expect(page.services[0].id).toBe('svc-1');
      expect(page.services[0].serviceType).toBe('verification');
      expect(page.services[0].basePriceUsdcRaw).toBe(100000);
      expect(page.count).toBe(2);
      expect(page.priceRangeUsdcRaw).toEqual({ min: 100000, max: 250000 });

      const [url] = fetchMock.mock.calls[0];
      expect(url).toContain('/api/v1/services');
      expect(url).toContain('type=verification');
    });
  });

  describe('getService()', () => {
    it('throws 404 when the service is missing', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Service not found' }),
      } as any);
      const shell = new TrustShell();
      await expect(shell.getService('missing')).rejects.toThrow(TrustShellError);
    });
  });

  describe('getContractStatus() + pollUntilSettled()', () => {
    it('reads a contract and normalizes fields', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'contract-1',
          status: 'escrowed',
          provider_agent_id: 'prov-1',
          buyer_agent_id: 'buyer-1',
          agreed_price_usdc_raw: 100000,
          x402_payment_id: 'settle-1',
        }),
      } as any);

      const shell = new TrustShell();
      const s = await shell.getContractStatus('contract-1');
      expect(s.status).toBe('escrowed');
      expect(s.settlementId).toBe('settle-1');
      expect(s.buyerAgentId).toBe('buyer-1');
    });

    it('polls until a terminal status is reached', async () => {
      const statuses = ['pending', 'escrowed', 'fulfilled'];
      let i = 0;
      global.fetch = jest.fn().mockImplementation(async () => ({
        ok: true,
        json: async () => ({
          id: 'contract-1',
          status: statuses[Math.min(i++, statuses.length - 1)],
          provider_agent_id: 'prov-1',
          buyer_agent_id: 'buyer-1',
          agreed_price_usdc_raw: 100000,
        }),
      })) as any;

      const shell = new TrustShell();
      const final = await shell.pollUntilSettled('contract-1', { intervalMs: 1, timeoutMs: 5000 });
      expect(final.status).toBe('fulfilled');
    });

    it('throws 408 on poll timeout', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'c', status: 'escrowed', provider_agent_id: 'p',
          buyer_agent_id: 'b', agreed_price_usdc_raw: 1,
        }),
      } as any);
      const shell = new TrustShell();
      await expect(
        shell.pollUntilSettled('c', { intervalMs: 5, timeoutMs: 10 }),
      ).rejects.toThrow(/timed out/);
    });
  });
});

describe('buildX402Payment()', () => {
  // A throwaway well-known test private key (Hardhat account #0). NOT a real funded key.
  const TEST_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
  const TEST_TO = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

  it('produces a base64 header that decodes to a signed EIP-3009 authorization', async () => {
    const header = await buildX402Payment({
      privateKey: TEST_KEY,
      to: TEST_TO,
      amount: 100000,
    });

    expect(typeof header).toBe('string');
    const decoded = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
    // Facilitator expects these fields (src/services/x402-facilitator.ts).
    expect(decoded.from.toLowerCase()).toBe('0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266'); // account #0
    expect(decoded.to).toBe(TEST_TO);
    expect(decoded.value).toBe('100000');
    expect(decoded.validAfter).toBe(0);
    expect(typeof decoded.validBefore).toBe('number');
    expect(decoded.nonce).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(decoded.signature).toMatch(/^0x[0-9a-f]{130}$/i);
  });

  it('never includes the private key in the header payload', async () => {
    const header = await buildX402Payment({ privateKey: TEST_KEY, to: TEST_TO, amount: 1 });
    const decoded = Buffer.from(header, 'base64').toString('utf8');
    expect(decoded).not.toContain(TEST_KEY);
    expect(decoded).not.toContain(TEST_KEY.slice(2));
  });
});
