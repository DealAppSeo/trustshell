/**
 * One place for the facts robots.ts, sitemap.ts and llms.txt all need to agree on.
 *
 * They were going to be three separate hardcoded lists, which is how a sitemap ends up
 * advertising a route the robots file disallows — each file individually correct, the pair
 * incoherent, and nothing that notices.
 */

/**
 * The canonical origin. Overridable so a preview deployment advertises itself rather than
 * pointing crawlers at production, which would make preview sitemaps quietly wrong.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_ENV === 'production'
    ? 'https://trustshell.dev'
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://trustshell.dev')
).replace(/\/$/, '');

/**
 * Kept out of the index — NOT because they are secret, but because indexing them would be
 * misleading.
 *
 * `/connect` is a passphrase-protected local vault for the visitor's OWN provider keys; it
 * holds nothing server-side and nothing a searcher could want. Surfacing a key-entry screen
 * in search results invites exactly the wrong kind of visit. `/settings` is per-device
 * configuration with no content behind it.
 *
 * Both remain publicly reachable. This is an indexing decision, not an access control, and it
 * would be dishonest to describe it as one.
 */
export const PRIVATE_ROUTES = ['/connect', '/settings'] as const;

/**
 * Routes worth indexing, with the priority reflecting what a stranger should land on.
 *
 * Deliberately hand-listed rather than globbed from the filesystem: a route existing is not
 * the same as it being ready to be someone's first impression, and that judgement should be an
 * edit here rather than a side effect of adding a file.
 */
export const INDEXABLE_ROUTES: ReadonlyArray<{ path: string; priority: number }> = [
  { path: '/', priority: 1.0 },
  { path: '/mission', priority: 0.9 },
  { path: '/earned-trust', priority: 0.9 },
  { path: '/docs', priority: 0.9 },
  { path: '/docs/getting-started', priority: 0.8 },
  { path: '/docs/api-reference', priority: 0.8 },
  { path: '/passport', priority: 0.8 },
  { path: '/grants', priority: 0.8 },
  { path: '/market', priority: 0.7 },
  { path: '/stake', priority: 0.7 },
  { path: '/campaign', priority: 0.7 },
  { path: '/leaderboard', priority: 0.7 },
  { path: '/repid', priority: 0.7 },
  { path: '/glossary', priority: 0.7 },
  { path: '/pai', priority: 0.6 },
  { path: '/agents', priority: 0.6 },
  { path: '/start', priority: 0.6 },
  { path: '/run', priority: 0.5 },
  { path: '/history', priority: 0.4 },
];

/**
 * The shared social card, for pages that define their own `openGraph`.
 *
 * NECESSARY BECAUSE OF A NEXT RULE THAT IS EASY TO MISS: nested metadata like `openGraph` is
 * REPLACED, not merged, by the last segment that defines it. So a page that sets an
 * openGraph title to get a good link preview silently drops the root's image and ends up with
 * a worse preview than a page that set nothing at all. Measured: /mission and /earned-trust
 * were the only two pages serving no og:image, and they were the only two that had bothered
 * to customise their card.
 *
 * Spread this into any page-level `openGraph` block. One definition so the next page to
 * override cannot quietly lose the image again.
 */
export const OG_IMAGE = [{ url: '/opengraph-image', width: 1200, height: 630 }];
