/**
 * What `npm install @hyperdag/trustshell` actually delivers. package.json on
 * this tree is 1.4.0 unpublished; interpolating it next to the install command
 * advertised a version npm 404s (live site, 2026-09-12). Bump this when
 * `npm view @hyperdag/trustshell version` says 1.4.0, not before.
 *
 * Own file so the client hero can import it without pulling lib/site.ts
 * (SITE_URL reads VERCEL_ENV / VERCEL_URL) into the browser bundle.
 */
export const NPM_LATEST = '1.3.0';
