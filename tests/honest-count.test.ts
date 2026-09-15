/**
 * S3 — a live public count cannot say "6" when the field is empty.
 * Synthetic fixtures only. No RPC.
 */
import { formatProvidersUsed, publicProviderCount } from '../lib/honest-count';

describe('S3 public provider count (T4 types)', () => {
  it('returns the measured answering count, not the configured 6/8', () => {
    const r = publicProviderCount({
      quorum_providers: 8,
      quorum_health: { basis: 'measured', answering_providers: 2, configured_providers: 8 },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.providersUsed).toBe(2);
      expect(r.grounding).toBe('hal');
      expect(r.providersUsed).not.toBe(6);
      expect(r.providersUsed).not.toBe(8);
    }
  });

  it('503 + reason when the engine falls back to the configured set (the old "6")', () => {
    const r = publicProviderCount({
      quorum_providers: 6,
      quorum_health: { basis: 'configured', answering_providers: 0, configured_providers: 6 },
    });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(503);
    expect(r.providersUsed).toBeNull();
    expect(r.reason).toMatch(/configured/);
    expect(formatProvidersUsed(r)).toBe('unavailable');
    expect(formatProvidersUsed(r)).not.toBe('6');
  });

  it('503 + reason when the field is empty — copy cannot say 6', () => {
    const r = publicProviderCount({});
    expect(r.ok).toBe(false);
    expect(r.status).toBe(503);
    expect(r.providersUsed).toBeNull();
    expect(formatProvidersUsed(r)).toBe('unavailable');
    expect(formatProvidersUsed(r)).not.toBe('6');
  });
});
