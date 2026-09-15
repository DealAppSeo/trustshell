/**
 * S3 — public provider count. T4 type names (`Grounding`, `providersUsed`) so
 * copy cannot print "6" when the field is empty. Does not import #156.
 *
 * Engine `/api/v1/hal/stats` used to report the CONFIGURED provider set as the
 * live quorum (the "6"). Measured voices are `quorum_health.answering_providers`
 * when `basis === 'measured'`. Anything else is 503 + reason, not a default.
 */

/** T4 grounding: `hal` only when a measured quorum spoke. */
export type Grounding = 'none' | 'hal' | 'payment';

export type PublicProviderCount =
  | {
      ok: true;
      status: 200;
      providersUsed: number;
      grounding: Grounding;
      source: string;
      reason?: undefined;
    }
  | {
      ok: false;
      status: 503;
      providersUsed: null;
      grounding: 'none';
      reason: string;
    };

export function publicProviderCount(raw: unknown): PublicProviderCount {
  if (!raw || typeof raw !== 'object') {
    return {
      ok: false,
      status: 503,
      providersUsed: null,
      grounding: 'none',
      reason: 'engine body missing',
    };
  }
  const health = (raw as { quorum_health?: { basis?: unknown; answering_providers?: unknown } })
    .quorum_health;
  const basis = health?.basis;
  const answering = health?.answering_providers;
  if (basis !== 'measured' || typeof answering !== 'number' || !Number.isFinite(answering) || answering < 0) {
    return {
      ok: false,
      status: 503,
      providersUsed: null,
      grounding: 'none',
      reason:
        basis === 'configured'
          ? 'quorum_health.basis=configured; configured count is not a measured quorum'
          : 'engine did not report a measured answering_providers count',
    };
  }
  return {
    ok: true,
    status: 200,
    providersUsed: answering,
    grounding: answering > 0 ? 'hal' : 'none',
    source: 'hal/stats.quorum_health.answering_providers',
  };
}

/** Copy helper: never invents a number. Empty → "unavailable", never "6". */
export function formatProvidersUsed(r: { providersUsed: number | null }): string {
  if (r.providersUsed == null) return 'unavailable';
  return String(r.providersUsed);
}
