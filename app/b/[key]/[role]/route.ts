import { BELT_HTML, BELT_ROLES, type BeltRole } from '../../../../lib/belt-pages';
import { shareKeyMatches } from '../../../../lib/belt-share';

/**
 * An unlisted C-level belt page: /b/<key>/cmo, /b/<key>/cto or /b/<key>/cfo. Nothing links here.
 * A missing setting, a wrong key and an unknown role all get the same 404, so a visitor cannot tell
 * which part was wrong.
 */
export const dynamic = 'force-dynamic';

const HEADERS = {
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'private, no-store',
};

const notFound = () => new Response('Not found', { status: 404, headers: { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8' } });

export async function GET(_req: Request, { params }: { params: Promise<{ key: string; role: string }> }) {
  const { key, role } = await params;
  if (!shareKeyMatches(key, process.env.BELTS_SHARE_KEY)) return notFound();
  if (!(BELT_ROLES as readonly string[]).includes(role)) return notFound();
  return new Response(BELT_HTML[role as BeltRole], { status: 200, headers: { ...HEADERS, 'Content-Type': 'text/html; charset=utf-8' } });
}
