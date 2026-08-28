import type { MetadataRoute } from 'next';
import { SITE_URL, PRIVATE_ROUTES } from '@/lib/site';

/**
 * There was no robots.txt at all before this (2026-08-28).
 *
 * An absent file means "crawl everything", so this is not primarily about permission — it is
 * about three things the default cannot express: pointing crawlers at the sitemap, keeping the
 * device-local pages out of an index where they would be meaningless, and stating the position
 * on AI crawlers explicitly rather than by accident.
 *
 * AI CRAWLERS ARE ALLOWED ON PURPOSE, and named individually rather than left to the wildcard.
 * A system that argues agent output should be verifiable in public cannot coherently hide from
 * the assistants people ask about agent verification. Naming them also makes the decision
 * legible: a future `Disallow` would be a deliberate edit here, not a silent side effect of
 * someone tightening the wildcard.
 *
 * The bots below are the ones that CITE. Training-only crawlers are a separate decision and are
 * deliberately not addressed here — conflating "may read to answer a question about us" with
 * "may train on us" is how sites end up blocking their own citations by accident.
 */
const CITING_AI_CRAWLERS = [
  'GPTBot', // OpenAI — ChatGPT browsing
  'ChatGPT-User', // OpenAI — user-initiated fetches
  'OAI-SearchBot', // OpenAI — search index
  'PerplexityBot',
  'ClaudeBot', // Anthropic
  'anthropic-ai',
  'Claude-Web',
  'Google-Extended', // Gemini + AI Overviews
  'Bingbot', // Copilot, via Bing
  'Applebot-Extended',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: [...PRIVATE_ROUTES] },
      // Same access as everyone else. Listed separately so the allowance is explicit and
      // survives an edit to the wildcard rule above.
      ...CITING_AI_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: '/',
        disallow: [...PRIVATE_ROUTES],
      })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
