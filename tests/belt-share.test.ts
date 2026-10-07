/**
 * The C-level belt pages are UNLISTED (Sean, 2026-10-06): only someone with the whole address sees
 * one. The key in that address is the deployment's BELTS_SHARE_KEY setting and is never in this
 * public repository, so the guessable public/belts/*.html files are gone.
 *
 * Every refusal is the same 404, so a visitor cannot tell a wrong key from a wrong role, or either
 * from a deployment with no key set at all.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { GET } from '../app/b/[key]/[role]/route';
import { BELT_HTML, BELT_ROLES } from '../lib/belt-pages';
import { MIN_SHARE_KEY_LENGTH, shareKeyMatches } from '../lib/belt-share';

const ROOT = join(__dirname, '..');
const KEY = 'k'.repeat(MIN_SHARE_KEY_LENGTH) + '-test-only';

async function get(key: string, role: string, configured: string | undefined) {
  const before = process.env.BELTS_SHARE_KEY;
  if (configured === undefined) delete process.env.BELTS_SHARE_KEY;
  else process.env.BELTS_SHARE_KEY = configured;
  try {
    return await GET(new Request(`https://example.test/b/${key}/${role}`), { params: Promise.resolve({ key, role }) });
  } finally {
    if (before === undefined) delete process.env.BELTS_SHARE_KEY;
    else process.env.BELTS_SHARE_KEY = before;
  }
}

describe('an unlisted belt page', () => {
  it('opens with the whole address, says noindex, and keeps the address out of referrers and caches', async () => {
    for (const role of BELT_ROLES) {
      const res = await get(KEY, role, KEY);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
      expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
      expect(res.headers.get('referrer-policy')).toBe('no-referrer');
      expect(res.headers.get('cache-control')).toBe('private, no-store');
      const body = await res.text();
      expect(body).toBe(BELT_HTML[role]);
      expect(body).toContain('<meta name="robots" content="noindex, nofollow">');
      expect(body).toContain('<meta name="referrer" content="no-referrer">');
    }
  });

  it.each([
    ['no key set on the deployment', KEY, 'cfo', undefined],
    ['an empty key set', KEY, 'cfo', ''],
    ['a key set but too short to be safe', 'short', 'cfo', 'short'],
    ['a wrong key', KEY.slice(0, -1) + 'X', 'cfo', KEY],
    ['the right key with a character missing', KEY.slice(0, -1), 'cfo', KEY],
    ['an unknown role', KEY, 'ceo', KEY],
    ['the old file name', KEY, 'cfo.html', KEY],
  ])('refuses %s with the same 404', async (_name, key, role, configured) => {
    const res = await get(key, role, configured);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('Not found');
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });

  it('compares the whole key, and fails closed without one', () => {
    expect(shareKeyMatches(KEY, KEY)).toBe(true);
    expect(shareKeyMatches(KEY, undefined)).toBe(false);
    expect(shareKeyMatches('', '')).toBe(false);
    expect(shareKeyMatches(KEY + 'x', KEY)).toBe(false);
  });
});

describe('nothing guessable is left', () => {
  it('the old public/belts pages are gone', () => {
    expect(existsSync(join(ROOT, 'public/belts'))).toBe(false);
  });

  it('no page, component or public file links to the unlisted address or the old files', () => {
    const files = (dir: string): string[] =>
      existsSync(dir)
        ? readdirSync(dir).flatMap((f) => {
            const p = join(dir, f);
            return statSync(p).isDirectory() ? files(p) : /\.(tsx?|html|txt|json|xml)$/.test(f) ? [p] : [];
          })
        : [];
    const linking = [...files(join(ROOT, 'app')), ...files(join(ROOT, 'components')), ...files(join(ROOT, 'public'))]
      .filter((f) => !f.includes(join('app', 'b', '[key]')))
      .filter((f) => /["'`(]\/b\/|belts\/c[fmt]o\.html/.test(readFileSync(f, 'utf8')));
    expect(linking).toEqual([]);
  });

  it('the key is never written into the repository', () => {
    const route = readFileSync(join(ROOT, 'app/b/[key]/[role]/route.ts'), 'utf8');
    expect(route).toContain('process.env.BELTS_SHARE_KEY');
    expect(route).not.toMatch(/BELTS_SHARE_KEY\s*(\?\?|\|\|)/);
  });
});
