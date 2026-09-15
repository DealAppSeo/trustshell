import { NextResponse } from 'next/server';
import { formatProvidersUsed, publicProviderCount } from '@/lib/honest-count';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ENGINE =
  process.env.NEXT_PUBLIC_REPID_ENGINE_URL ??
  'https://repid-engine-production.up.railway.app';

/**
 * Public measured HAL quorum size, or honest 503.
 * T4 field names: `providersUsed`, `grounding`. Never defaults to 6.
 */
export async function GET() {
  const headers = { 'cache-control': 'no-store, max-age=0, must-revalidate' };
  try {
    const res = await fetch(`${ENGINE}/api/v1/hal/stats`, {
      signal: AbortSignal.timeout(8000),
      headers: { accept: 'application/json' },
    });
    if (!res.ok) {
      return NextResponse.json(
        {
          error: 'provider_count_unavailable',
          reason: `engine HTTP ${res.status}`,
          providersUsed: null,
          grounding: 'none',
          display: 'unavailable',
        },
        { status: 503, headers },
      );
    }
    const raw: unknown = await res.json();
    const counted = publicProviderCount(raw);
    if (!counted.ok) {
      return NextResponse.json(
        {
          error: 'provider_count_unavailable',
          reason: counted.reason,
          providersUsed: null,
          grounding: counted.grounding,
          display: formatProvidersUsed(counted),
        },
        { status: 503, headers },
      );
    }
    return NextResponse.json(
      {
        providersUsed: counted.providersUsed,
        grounding: counted.grounding,
        source: counted.source,
        display: formatProvidersUsed(counted),
        as_of: new Date().toISOString(),
      },
      { status: 200, headers },
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'engine unreachable';
    return NextResponse.json(
      {
        error: 'provider_count_unavailable',
        reason,
        providersUsed: null,
        grounding: 'none',
        display: 'unavailable',
      },
      { status: 503, headers },
    );
  }
}
