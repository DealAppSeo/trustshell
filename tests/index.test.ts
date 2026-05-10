import { 
  TrustShell, 
  TrustShellAuthError, 
  TrustShellRateLimitError, 
  TrustShellNetworkError,
  TrustShellInvalidInputError,
  TrustShellTimeoutError
} from '../src/index';

describe('TrustShell SDK', () => {
  const config = {
    agentId: 'test-agent',
    apiKey: 'test-key',
    llmProvider: 'anthropic'
  };

  beforeEach(() => {
    jest.resetAllMocks();
    (global as any).fetch = jest.fn();
  });

  describe('Constructor', () => {
    it('throws if agentId is missing', () => {
      expect(() => new TrustShell({ apiKey: 'key' } as any)).toThrow(TrustShellInvalidInputError);
    });

    it('throws if apiKey is missing', () => {
      expect(() => new TrustShell({ agentId: 'id' } as any)).toThrow(TrustShellInvalidInputError);
    });

    it('sets default engineUrl', () => {
      const shell = new TrustShell(config);
      expect((shell as any).engineUrl).toBe('https://repid-engine-production.up.railway.app');
    });

    it('accepts engineUrl override', () => {
      const shell = new TrustShell({ ...config, engineUrl: 'https://test.api' });
      expect((shell as any).engineUrl).toBe('https://test.api');
    });
  });

  describe('evaluate/report', () => {
    it('sends correct payload to score-event endpoint', async () => {
      const mockResponse = {
        hal_approved: true,
        hal_score: 0.1,
        delta: 5,
        new_score: 1005,
        tier: 'EARNING_AUTONOMY',
        vdr_count: 10,
        proof_job_id: 'job-123'
      };

      (global as any).fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const shell = new TrustShell(config);
      const result = await shell.evaluate('test decision', 0.9);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/agents/test-agent/score-event'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"decision_text":"test decision"')
        })
      );
      expect(result.proof_job_id).toBe('job-123');
    });

    it('throws TrustShellAuthError on 401', async () => {
      (global as any).fetch.mockResolvedValueOnce({
        ok: false,
        status: 401
      });

      const shell = new TrustShell(config);
      await expect(shell.evaluate('test', 0.9)).rejects.toThrow(TrustShellAuthError);
    });

    it('throws TrustShellRateLimitError on 429', async () => {
      (global as any).fetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({ 'Retry-After': '60' })
      });

      const shell = new TrustShell(config);
      try {
        await shell.evaluate('test', 0.9);
      } catch (e: any) {
        expect(e).toBeInstanceOf(TrustShellRateLimitError);
        expect(e.retryAfter).toBe(60);
      }
    });
  });

  describe('waitForProof', () => {
    it('polls until verified', async () => {
      (global as any).fetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'pending' }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'verified', proof: '0xabc' }) });

      const shell = new TrustShell(config);
      const result = await shell.waitForProof('job-123', { intervalMs: 1 });

      expect(result.status).toBe('verified');
      expect(result.proof).toBe('0xabc');
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('throws TrustShellTimeoutError on timeout', async () => {
      (global as any).fetch.mockResolvedValue({ ok: true, json: async () => ({ status: 'pending' }) });

      const shell = new TrustShell(config);
      await expect(shell.waitForProof('job-123', { timeoutMs: 10, intervalMs: 1 }))
        .rejects.toThrow(TrustShellTimeoutError);
    });
  });
});
