/**
 * receipt-redirect.test.ts — trustshell.dev/receipt/:id may only ever send a reader to the engine's
 * public receipt, for an id the engine actually resolves. XC1 review of #555:
 *   - `:id` had no pattern, so `..` / encoded traversal could land on other engine paths;
 *   - the target host came from an env var.
 * Matched with Next's OWN custom-route matcher (getPathMatch, strict, as Next builds redirects), so
 * this is what the deployed site does, not an approximation of it. A path that does not match falls
 * through to the site's 404.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import nextConfig, { RECEIPT_ENGINE_ORIGIN } from '../next.config';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getPathMatch } = require('next/dist/shared/lib/router/utils/path-match');

const UUID = '467eecf9-762a-4772-90d2-d36c6d8dc739';

/** Where Next would redirect `pathname`, or null when no redirect matches (the site's 404). */
async function redirectFor(pathname: string): Promise<{ to: string; permanent: boolean } | null> {
  for (const r of await nextConfig.redirects!()) {
    const params = getPathMatch(r.source, { strict: true, removeUnnamedParams: true })(pathname);
    if (params) return { to: r.destination.replace(':id', String(params.id)), permanent: Boolean(r.permanent) };
  }
  return null;
}

describe('trustshell.dev/receipt/:id', () => {
  it.each([
    [`/receipt/${UUID}`, `/api/v1/receipt/${UUID}`],
    [`/receipt/${UUID}.json`, `/api/v1/receipt/${UUID}.json`],
    ['/receipt/latest', '/api/v1/receipt/latest'],
    ['/receipt/latest.json', '/api/v1/receipt/latest.json'],
  ])('%s redirects (307, not permanent) to the engine receipt', async (path, enginePath) => {
    expect(await redirectFor(path)).toEqual({ to: `https://repid-engine-production.up.railway.app${enginePath}`, permanent: false });
  });

  it.each([
    ['dot-dot', '/receipt/..'],
    ['dot-dot as the id, then another segment', '/receipt/../api/v1/kernel/receipt/x'],
    ['percent-encoded traversal', '/receipt/%2e%2e%2fapi%2fv1%2fkernel%2freceipt%2fx'],
    ['mixed-case encoded traversal', '/receipt/%2E%2E%2F%2E%2E%2Fadmin'],
    ['a protocol-relative host', '//evil.com'],
    ['a protocol-relative host after the prefix', '/receipt//evil.com'],
    ['an encoded protocol-relative host', '/receipt/%2F%2Fevil.com'],
    ['a second path segment', `/receipt/${UUID}/extra`],
    ['a uuid with junk appended', `/receipt/${UUID}x`],
    ['a non-uuid id', '/receipt/not-a-contract'],
    ['an empty id', '/receipt/'],
  ])('%s (%s) matches nothing: the site 404s, never a redirect elsewhere', async (_why, path) => {
    expect(await redirectFor(path)).toBeNull();
  });

  it('the target host is pinned in code, not read from the environment', async () => {
    expect(RECEIPT_ENGINE_ORIGIN).toBe('https://repid-engine-production.up.railway.app');
    for (const r of await nextConfig.redirects!()) expect(r.destination.startsWith(`${RECEIPT_ENGINE_ORIGIN}/api/v1/receipt/`)).toBe(true);
    const src = readFileSync(join(__dirname, '..', 'next.config.ts'), 'utf8');
    expect(src).not.toMatch(/process\.env/);
  });
});
