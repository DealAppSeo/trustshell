/**
 * TrustShell SDK Tests (S-BUILD Phase 1)
 * Mock fetch to avoid live calls.
 */

import { TrustShell, TrustShellError } from '../src/lib/trustshell';

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
});
