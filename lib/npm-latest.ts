/**
 * What the registry actually serves. Measured 2026-09-24:
 * `npm view @hyperdag/trustshell version` → 1.4.0.
 * Bump this when that command changes, not when package.json changes.
 *
 * Own file so the status strip can import it without pulling lib/site.ts
 * (SITE_URL reads VERCEL_ENV / VERCEL_URL) into the browser bundle.
 */
export const NPM_LATEST = '1.4.0';
