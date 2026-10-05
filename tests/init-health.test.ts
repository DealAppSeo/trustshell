/**
 * TrustShell.init() probes /health before handing back a client. Measured on the published
 * 1.5.0 (2026-10-05): the probe cost 0.71 s against 0.18 s for the first real call, and it had
 * NO timeout, so a backend that accepted the connection and never answered hung init() for good.
 * Now the probe has its own short deadline, and a caller who does not need it can skip it.
 * A skipped probe is reported as not checked, never as reachable.
 */
import { TrustShell, HEALTH_TIMEOUT_MS } from '../src/lib/trustshell';

const realFetch = (globalThis as { fetch?: unknown }).fetch;
afterEach(() => {
  (globalThis as { fetch?: unknown }).fetch = realFetch;
  jest.useRealTimers();
});

describe('TrustShell.init health probe', () => {
  it('a backend that never answers does not hang init: it ends at the deadline, not ok', async () => {
    const seen: (AbortSignal | undefined)[] = [];
    (globalThis as { fetch?: unknown }).fetch = jest.fn((_url: string, init?: RequestInit) => {
      seen.push(init?.signal ?? undefined);
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    });
    const started = Date.now();
    const { client, health } = await TrustShell.init({ apiUrl: 'http://localhost:9', healthTimeoutMs: 50 });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(client).toBeInstanceOf(TrustShell);
    expect(health.ok).toBe(false);
    expect(health.error).toMatch(/no answer within 50 ms/);
    expect(seen[0]).toBeDefined();
  });

  it('the default deadline is short, a few seconds, not the 30 s request timeout', () => {
    expect(HEALTH_TIMEOUT_MS).toBeGreaterThan(0);
    expect(HEALTH_TIMEOUT_MS).toBeLessThanOrEqual(5000);
  });

  it('healthCheck: false makes no request and reports not checked, never ok', async () => {
    const fetchMock = jest.fn();
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
    const { client, health } = await TrustShell.init({ apiUrl: 'http://localhost:9', healthCheck: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(client).toBeInstanceOf(TrustShell);
    expect(health).toEqual({ ok: false, checked: false, status: 'not-checked' });
  });

  it('a healthy backend is unchanged: one GET /health, ok true, its status', async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({ status: 'healthy' }) }));
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
    const { health } = await TrustShell.init({ apiUrl: 'http://localhost:9' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0] as unknown[])[0]).toBe('http://localhost:9/health');
    expect(health).toEqual({ ok: true, checked: true, status: 'healthy' });
  });

  it('a network error is still reported as an error, not a hang', async () => {
    (globalThis as { fetch?: unknown }).fetch = jest.fn(async () => {
      throw new Error('connect ECONNREFUSED');
    });
    const { health } = await TrustShell.init({ apiUrl: 'http://localhost:9' });
    expect(health).toEqual({ ok: false, checked: true, error: 'connect ECONNREFUSED' });
  });
});
