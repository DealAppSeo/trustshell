import type { MetadataRoute } from 'next';
import { SITE_URL, INDEXABLE_ROUTES } from '@/lib/site';

/**
 * There was no sitemap before this (2026-08-28), so every route had to be found by
 * link-following from the homepage. That is survivable for a crawler and poor for the AI
 * search engines this product most wants to be legible to, several of which fetch a sitemap
 * directly.
 *
 * `lastModified` is the BUILD time, and that is a deliberate, slightly conservative choice.
 * Per-file git mtimes are unavailable in a Vercel build (shallow clone, no history), and
 * inventing a per-route date would be a freshness claim nobody measured — the exact kind of
 * unearned signal this codebase refuses elsewhere. Build time is true: this is when the served
 * bytes were produced.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return INDEXABLE_ROUTES.map(({ path, priority }) => ({
    url: `${SITE_URL}${path === '/' ? '' : path}`,
    lastModified,
    changeFrequency: 'weekly' as const,
    priority,
  }));
}
