/**
 * The engine URL must be committed, because a bundle cannot ask for it at runtime.
 *
 * `next build` INLINES `NEXT_PUBLIC_*` by static analysis. `lib/repid-engine.ts` reads
 *
 *     export const REPID_ENGINE_URL = process.env.NEXT_PUBLIC_REPID_ENGINE_URL || '';
 *
 * so if the value is absent at BUILD time, `REPID_ENGINE_URL` is the empty string in every
 * shipped copy of the app, for every visitor, until someone rebuilds. Not a runtime error, not a
 * failed request anyone can see in a log — a client that calls `fetch('/api/v1/...')` against its
 * own origin and gets the site's own 404 page back.
 *
 * WHAT ACTUALLY STOPS THAT TODAY is one tracked file, `.env.production`, holding one line. It has
 * no test, no comment, and nothing about it announces that the product's entire backend
 * connection depends on it. Deleting the line is a one-character-looking change that breaks
 * every engine-backed surface at once and turns nothing red.
 *
 * MEASURED 2026-09-22, and the reason this file exists: `tests/e2e/onboarding-honesty.mjs` tried
 * to reproduce an unconfigured deploy by DELETING the variable from the build environment. The
 * page went on POSTing to the real production host, because `.env.production` supplied it
 * regardless. The good news in that measurement is the invariant; this test is what keeps it
 * true.
 *
 * It asserts the file and the value, never a particular host — which host the product points at
 * is a deployment decision, and pinning it here would make a legitimate change fail a test that
 * has no opinion about it.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const ENV_PRODUCTION = join(__dirname, '..', '.env.production');
const VAR = 'NEXT_PUBLIC_REPID_ENGINE_URL';

function readVar(src: string, name: string): string | null {
  for (const raw of src.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    if (line.slice(0, eq).trim() !== name) continue;
    return line
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  }
  return null;
}

describe('.env.production supplies the engine URL at build time', () => {
  it('the file exists (not vacuously green)', () => {
    expect(existsSync(ENV_PRODUCTION)).toBe(true);
  });

  it(`sets ${VAR}`, () => {
    const value = readVar(readFileSync(ENV_PRODUCTION, 'utf8'), VAR);
    expect(value).not.toBeNull();
    expect(value).not.toBe('');
  });

  it('to an absolute https URL, because a relative one resolves against the site itself', () => {
    // The failure mode this rules out is subtle: a relative value does not throw, it silently
    // makes the app its own backend and every engine call returns the site's 404 page.
    const value = readVar(readFileSync(ENV_PRODUCTION, 'utf8'), VAR) ?? '';
    expect(() => new URL(value)).not.toThrow();
    expect(new URL(value).protocol).toBe('https:');
  });

  it('with no trailing slash — every call site concatenates `/api/v1/...` directly', () => {
    const value = readVar(readFileSync(ENV_PRODUCTION, 'utf8'), VAR) ?? '';
    expect(value.endsWith('/')).toBe(false);
  });
});
