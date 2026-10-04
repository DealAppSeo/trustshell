/**
 * What the registry actually serves. Measured 2026-09-24:
 * `npm view @hyperdag/trustshell version` → 1.4.0. Set to 1.5.0 by the 1.5.0 release PR, which
 * merges only AFTER `npm view` returns 1.5.0 (the PR stays a draft until it does).
 * Bump this when that command changes, not when package.json changes.
 *
 * Own file so the status strip can import it without pulling lib/site.ts
 * (SITE_URL reads VERCEL_ENV / VERCEL_URL) into the browser bundle.
 */
export const NPM_LATEST = '1.5.0';
