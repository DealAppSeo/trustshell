import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// =========================================================================
// RATE-LIMIT SPECIFICATION (Audit Remediation, Sprint 2, 2026-06-05)
// =========================================================================
// Endpoint           | Limit (Reqs) | Window (Secs) | Target Use Case
// -------------------|--------------|---------------|-----------------------
// /api/verify-proof  | 60           | 60            | Proof checking API
// /api/dashboard     | 120          | 60            | Admin panel analytics
// /api/landing       | 30           | 60            | Landing page metrics
// =========================================================================

interface RateLimitConfig {
  limit: number;
  windowMs: number;
}

const LIMITS: Record<string, RateLimitConfig> = {
  '/api/verify-proof': { limit: 60, windowMs: 60 * 1000 },
  '/api/dashboard': { limit: 120, windowMs: 60 * 1000 },
  '/api/landing': { limit: 30, windowMs: 60 * 1000 },
};

// Simple transient Edge Memory store for local dry-runs.
// Note: Next.js Edge runtime runs in multiple instances. For production,
// the XC team should wire this stub to an external Redis/Upstash instance:
//   const redis = new Redis({ url: UPSTASH_REDIS_REST_URL, token: ... });
const localMemoryStore = new Map<string, { count: number; expiresAt: number }>();

export function middleware(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1';
  const path = request.nextUrl.pathname;

  // Find matching rate-limit configuration for endpoint
  const matchedRoute = Object.keys(LIMITS).find(r => path.startsWith(r));
  if (!matchedRoute) {
    return NextResponse.next();
  }

  const { limit, windowMs } = LIMITS[matchedRoute]!;
  const key = `${ip}:${matchedRoute}`;
  const now = Date.now();

  const record = localMemoryStore.get(key);

  if (!record || now > record.expiresAt) {
    // Window expired or no record exists
    localMemoryStore.set(key, {
      count: 1,
      expiresAt: now + windowMs,
    });
    
    const response = NextResponse.next();
    response.headers.set('X-RateLimit-Limit', String(limit));
    response.headers.set('X-RateLimit-Remaining', String(limit - 1));
    response.headers.set('X-RateLimit-Reset', String(Math.ceil((now + windowMs) / 1000)));
    return response;
  }

  if (record.count >= limit) {
    // Rate limit breached
    return new NextResponse(
      JSON.stringify({
        success: false,
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Please wait before retrying. Limit is ${limit} requests per minute.`,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(record.expiresAt / 1000)),
        },
      }
    );
  }

  // Increment request count
  record.count += 1;
  localMemoryStore.set(key, record);

  const response = NextResponse.next();
  response.headers.set('X-RateLimit-Limit', String(limit));
  response.headers.set('X-RateLimit-Remaining', String(limit - record.count));
  response.headers.set('X-RateLimit-Reset', String(Math.ceil(record.expiresAt / 1000)));
  return response;
}

// Config matching all public API endpoints
export const config = {
  matcher: ['/api/verify-proof', '/api/dashboard', '/api/landing'],
};
