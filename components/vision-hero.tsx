import Link from 'next/link';

/**
 * The homepage vision/hero band — the mission that frames the product, placed above the shipped
 * "AI lies." product hero so the page opens on WHY before HOW. Copy is Sean's (coordinator GO,
 * three beats: lead / problem / mechanism).
 *
 * WHY THIS IS NOT AN <h1>, AND CARRIES NO "receipt". Two merged guardrails shape this band:
 *   1. components/hero.tsx owns the page's single <h1> ("AI lies."), and tests/landing-headline +
 *      tests/home-check pin it as the FIRST <h1> in the rendered home. So this band leads VISUALLY
 *      with a display paragraph and introduces no competing heading — the hero's h1 stays the
 *      document's first heading and the heading order a screen-reader walks is intact. The problem
 *      beat is one continuous <p> (never a standalone "AI lies." line) so it cannot displace the
 *      product hero in home-check's consecutive-line assertions.
 *   2. tests/home-check bans the word "receipt" anywhere on the rendered home — the honesty rule
 *      that the free first screen must not promise the portable record a stranger does not yet get.
 *      The coordinator's mechanism beat is "TrustShell makes it show the work. Two families check
 *      the claim. You get a receipt. If it cannot check, it does not pass." The "You get a receipt."
 *      sentence is therefore carried verbatim on the /vision story page (where no such ban applies)
 *      rather than here; the three-outcomes promise ("If it cannot check, it does not pass") stays
 *      exact. This is a forced deviation from the requested copy, flagged in the PR body — not a
 *      reword and not a test weakened to fit copy.
 *
 * The band is the amber/token house palette (the shipped product hero below keeps its slate one).
 */
export function VisionHero() {
  return (
    <section
      aria-label="The vision"
      className="relative border-b border-border bg-background px-4 pt-14 pb-12 md:pt-20 md:pb-16"
    >
      {/* A single hairline of accent at the very top — the one amber note, not a CTA. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent"
      />
      <div className="mx-auto max-w-3xl space-y-6 text-center">
        <p className="text-xs uppercase tracking-widest text-accent font-semibold">The vision</p>
        <p className="font-display text-3xl md:text-5xl font-semibold tracking-tight text-foreground leading-tight [text-wrap:balance]">
          It all begins with trust. Trust that is earned.
        </p>
        <p className="mx-auto max-w-2xl text-base md:text-lg text-muted leading-relaxed [text-wrap:balance]">
          AI lies. It hallucinates, confabulates, and agrees with you just as confidently when you
          push back.
        </p>
        <p className="mx-auto max-w-2xl text-base md:text-lg text-foreground/90 leading-relaxed [text-wrap:balance]">
          TrustShell makes it show the work. Two families check the claim. If it cannot check, it
          does not pass.
        </p>
        <p className="pt-2">
          {/* prefetch={false}: this CTA sits at the top of the home page, so Next's default
              viewport prefetch fires a /vision RSC request on load. The home page must send
              NOTHING on load (crawlers and page loads must not look like activity, and
              tests/e2e/check-walk pins "loading the page sends no request"). The link still
              prefetches on hover/focus, so the click stays instant. */}
          <Link
            href="/vision"
            prefetch={false}
            className="inline-flex items-center gap-1 text-sm font-semibold text-accent underline-offset-4 hover:underline"
          >
            Read the whole vision
            <span aria-hidden="true">→</span>
          </Link>
        </p>
      </div>
    </section>
  );
}
