/**
 * What the registry actually serves. Measured 2026-09-24:
 * `npm view @hyperdag/trustshell version` → 1.4.0. Set to 1.6.0 by the 1.6.0 release PR (1.5.0 by its own), which
 * merges only AFTER `npm view` returns the new version (the PR stays a draft until it does).
 * Bump this when that command changes, not when package.json changes.
 *
 * Own file so the status strip can import it without pulling lib/site.ts
 * (SITE_URL reads VERCEL_ENV / VERCEL_URL) into the browser bundle.
 */
export const NPM_LATEST = '1.6.0';
