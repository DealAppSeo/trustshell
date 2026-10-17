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
  { id: 'fund', href: '/faucet', label: 'Fund', detail: 'Get testnet ETH + USDC' },
  { id: 'stake', href: '/stake', label: 'Stake', detail: 'Back it with a deposit' },
  { id: 'trade', href: '/spend', label: 'Trade', detail: 'Let it buy and sell' },
  { id: 'earn', href: '/leaderboard', label: 'Earn', detail: 'Watch RepID move' },
];

export function JourneySteps({ current }: { current?: JourneyStage }) {
  // No `current` (e.g. the /demo map) renders the full arc with every stage a link and nothing
  // marked "you are here".
  //
  // There is deliberately no "done" marker. This strip used to print "· done" on every stage
  // before `current`, by POSITION alone, so a stranger who opened /spend cold was told they had
  // created, claimed, funded and staked an agent while the same page said "Create an agent
  // first". The strip cannot see state; only each page's own result can say a step worked.
  return (
    <nav aria-label="Where you are in the journey" className="min-w-0">
      <p className="mb-2 text-xs font-mono uppercase tracking-widest text-muted">Where you are</p>
      {/* Three columns on a phone (two rows: the number and the step's name, the detail line from sm
          up), six from sm. It was a sideways scroller below sm, and a scroller cuts the last cards off
          at the screen edge (UX audit 2026-10-16, the same fix /agents had). A grid divides the width
          it is given, so the count never overflows the page sideways. */}
      <ol className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {STAGES.map((s, i) => {
          const isHere = s.id === current;
          const body = (
            <>
              <span
                className={`block text-xs font-mono ${isHere ? 'text-accent' : 'text-muted'}`}
              >
                {i + 1}
                {isHere ? ' · you are here' : ''}
              </span>
              <span
                className={`mt-1 block text-sm font-medium ${isHere ? 'text-foreground' : 'text-muted'}`}
              >
                {s.label}
              </span>
              <span className="mt-0.5 hidden text-xs leading-snug text-muted sm:block">{s.detail}</span>
            </>
          );
          const shell = `block h-full rounded-lg border border-border border-l-2 bg-card/50 p-3 ${
            isHere ? 'border-l-accent' : 'border-l-border'
          }`;
          return (
            <li key={s.id} className="min-w-0">
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
