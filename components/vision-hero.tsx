import Link from 'next/link';

/**
 * The vision, as one small card in the why section at the bottom of the home page (UX copy,
 * 2026-10-16: "the vision and the why essays last, as small cards"). It used to open the page; Sean:
 * the vision stays, and takes a back seat to showing what the product does. The whole statement,
 * word for word, is on /vision, so the card carries its first line and the way there.
 *
 * NOT AN <h1>, AND NO "receipt": components/hero.tsx owns the page's single <h1>, and tests/home-check
 * bans "receipt" on the home page (the free first screen must not promise the portable record a
 * stranger does not yet get). "You get a receipt." stays on /vision.
 *
 * prefetch={false}: the home page sends nothing on load (tests/e2e/check-walk pins it). The link still
 * prefetches on hover or focus, so the click stays instant.
 */
export function VisionHero() {
  return (
    <Link
      href="/vision"
      prefetch={false}
      data-testid="vision-card"
      className="flex h-full flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-5 hover:border-amber-500 focus-visible:border-amber-500 transition-colors"
    >
      <span className="block text-xs font-semibold uppercase tracking-widest text-accent">The vision</span>
      <span className="mt-2 block font-display text-lg font-semibold text-white text-wrap">
        It all begins with trust. Trust that is earned.
      </span>
      <span className="mt-4 block text-sm font-semibold text-amber-400">
        Read the whole vision <span aria-hidden="true">→</span>
      </span>
    </Link>
  );
}
