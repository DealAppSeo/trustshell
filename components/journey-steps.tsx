import Link from 'next/link';

/**
 * The whole arc, and where you are on it.
 *
 * THE PROBLEM THIS SOLVES. Each page of the journey — /agents, /bind, /wallet, /stake,
 * /spend — is legible on its own, but a stranger who lands midway cannot see how many steps
 * there are, which ones are behind them, or what comes next. The /agents page already carries
 * a step strip (app/agents/page.tsx), so this is the same idea extended to the later pages
 * that had no cross-journey marker at all.
 *
 * ONE SOURCE FOR THE ARC. The six stages live here once. A page names its own stage with
 * `current`; everything else — order, labels, links, the "you are here" marker — follows from
 * this list, so a page cannot drift from the shared story the way two hand-kept strips would.
 *
 * SERVER-SAFE BY DESIGN. No hooks, no 'use client' — just links. It renders identically inside
 * a server page (/bind) and a client page (/wallet, /stake, /spend). The stage names are a
 * narrative, not a claim about state: this says where you are in the walkthrough, never that a
 * step has been completed — that confirmation belongs to each page's own success cues.
 */

export type JourneyStage = 'create' | 'claim' | 'fund' | 'stake' | 'trade' | 'earn';

const STAGES: ReadonlyArray<{ id: JourneyStage; href: string; label: string; detail: string }> = [
  { id: 'create', href: '/agents', label: 'Create', detail: 'Make or choose an agent' },
  { id: 'claim', href: '/bind', label: 'Claim', detail: "Sign that it's yours" },
  { id: 'fund', href: '/wallet', label: 'Fund', detail: 'Get testnet ETH + USDC' },
  { id: 'stake', href: '/stake', label: 'Stake', detail: 'Back it with a deposit' },
  { id: 'trade', href: '/spend', label: 'Trade', detail: 'Let it buy and sell' },
  { id: 'earn', href: '/leaderboard', label: 'Earn', detail: 'Watch RepID move' },
];

export function JourneySteps({ current }: { current?: JourneyStage }) {
  // No `current` (e.g. the /demo map) renders the full arc with every stage a link and nothing
  // marked "you are here" — findIndex returns -1, so isHere and done are both false throughout.
  const currentIndex = current ? STAGES.findIndex((s) => s.id === current) : -1;

  return (
    <nav aria-label="Where you are in the journey" className="min-w-0">
      <p className="mb-2 text-xs font-mono uppercase tracking-widest text-muted/70">Where you are</p>
      {/* A horizontal scroll strip below sm, a six-column row at sm and up. The grid divides the
          width it is given, so the count never overflows the page sideways. */}
      <ol className="flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-6 sm:overflow-visible">
        {STAGES.map((s, i) => {
          const isHere = s.id === current;
          const done = currentIndex > -1 && i < currentIndex;
          const body = (
            <>
              <span
                className={`block text-[11px] font-mono ${isHere ? 'text-accent' : 'text-muted/60'}`}
              >
                {i + 1}
                {isHere ? ' · you are here' : done ? ' · done' : ''}
              </span>
              <span
                className={`mt-1 block text-sm font-medium ${isHere ? 'text-foreground' : 'text-muted'}`}
              >
                {s.label}
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted/60">{s.detail}</span>
            </>
          );
          const shell = `block h-full rounded-lg border border-border border-l-2 bg-card/50 p-3 ${
            isHere ? 'border-l-accent' : 'border-l-border'
          }`;
          return (
            <li key={s.id} className="shrink-0 min-w-[9rem] sm:min-w-0">
              {isHere ? (
                // The current stage is not a link to itself; it is where you already are.
                <div className={shell} aria-current="step">
                  {body}
                </div>
              ) : (
                <Link
                  href={s.href}
                  className={`${shell} transition-colors hover:border-l-accent/60 hover:bg-card`}
                >
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
