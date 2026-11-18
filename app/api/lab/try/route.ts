import { NextResponse } from 'next/server';
import { tryRun, verifyReceipt } from '@/lib/try-door';

// The try-door's only server code. Public, no key, no account. It reads api.github.com (nothing else) for the
// run URL the visitor sent. Never cached: a verdict served from a cache would be a verdict about an old read.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MAX_BODY_BYTES = 64 * 1024;
const NO_STORE = { headers: { 'cache-control': 'no-store' } };

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: 'too large' }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('shape');
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'send a JSON object' }, { status: 400 });
  }
  // A verdict is data, not an HTTP failure: a NOT_CHECKED comes back as 200 with the reason in the body.
  if (body.action === 'verify') return NextResponse.json(await verifyReceipt(body.record, body.digest), NO_STORE);
  return NextResponse.json(await tryRun(body.url, body.claim), NO_STORE);
}
