import Link from 'next/link';

/**
 * JOB 3: "I want an agent that acts for me, and I want to trust it." (UX copy, 2026-10-16.) One door.
 * Until this section, a first-time visitor could not reach /pai or /bind from the home page, /start,
 * /docs or /check (checked on the live site, 2026-10-16).
 *
 * Every line restates the step pages: /pai ("three questions, then we're done"), /bind ("It asks for a
 * wallet and nothing else", "up to a limit you set on Spend", "Everything here runs on Base Sepolia
 * testnet") and the home page's own "Agents have a public reputation score, RepID".
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
          Make one in three questions. Claim it with your wallet, set how much it may spend, and watch its public
          reputation score, RepID, move.
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
        <p className="text-sm text-slate-400">Claiming, funding and spending run on Base Sepolia, a test network.</p>
      </div>
    </section>
  );
}
