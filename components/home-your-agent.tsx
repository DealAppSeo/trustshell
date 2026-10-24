import Link from 'next/link';

/**
 * JOB 3: "I want an agent that acts for me, and I want to trust it." (UX copy, 2026-10-16.) One door.
 * Until this section, a first-time visitor could not reach /pai or /bind from the home page, /start,
 * /docs or /check (checked on the live site, 2026-10-16).
 *
 * Every line restates the step pages: /pai ("three questions, then we're done") and the home page's own
 * "Agents have a public reputation score, RepID".
 *
 * NO WALLET ON THE FIRST PAGE (Sean, 2026-10-24). This section used to say "Claim it with your wallet, set how
 * much it may spend", with a testnet note about claiming, funding and spending. A wallet is a step for later,
 * on /bind, once there is an agent worth claiming; asking for one here turns visitors away before they have
 * made anything. Claiming and spending are still on /bind and /spend, with the testnet note beside them.
 * tests/home-no-wallet-claim.test.ts holds this.
 *
 * prefetch={false}: the home page sends nothing on load (tests/e2e/check-walk pins it).
 */
export function HomeYourAgent() {
  return (
    <section
      id="your-agent"
      aria-labelledby="your-agent-heading"
      className="bg-slate-950 px-4 sm:px-6 py-14 text-white border-t border-slate-800"
    >
      <div className="mx-auto max-w-3xl min-w-0 space-y-4">
        <h2 id="your-agent-heading" className="text-2xl sm:text-3xl font-bold text-white text-wrap">
          Want an agent you can trust?
        </h2>
        <p className="text-base sm:text-lg text-slate-300 text-wrap">
          Make one in three questions, then watch its public reputation score, RepID, move.
        </p>
        <p>
          <Link
            href="/pai"
            prefetch={false}
            data-testid="make-agent"
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-amber-600 px-6 py-3 text-base font-bold text-black hover:bg-amber-500"
          >
            Make your agent
          </Link>
        </p>
      </div>
    </section>
  );
}
