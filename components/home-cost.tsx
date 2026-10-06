/**
 * WHAT A WRONG ANSWER REALLY COSTS (Sean's GO, 2026-10-06, on Grok's pricing section, rewritten).
 *
 * No plans and no prices here. Grok's draft ended "a paid lane comes later", which promises something
 * nobody has decided, so it is out. The cost named is the one the reader already pays: the hour built
 * on a wrong answer, the tokens spent arguing with it, and the second sure answer that sends them
 * researching the AI instead of building. None of that is a number we measured, so none is given.
 *
 * Grok's line "Not checked is the check doing its job: they disagreed" was true of one case only. Not
 * checked also means a checker was unsure or could not answer in time, so the line says "did not
 * agree, or could not answer". "Free to try" is true today: /api/v1/classify takes no key, no account
 * and no payment (repid-engine src/routes/classify.ts), within a daily limit per visitor.
 */
export function HomeCost() {
  return (
    <section
      aria-labelledby="cost"
      data-testid="home-cost"
      className="px-4 sm:px-6 py-12 bg-slate-950 text-white border-t border-slate-800"
    >
      <div className="max-w-2xl w-full min-w-0 mx-auto space-y-4">
        <h2 id="cost" className="text-2xl sm:text-3xl font-bold text-white text-wrap">
          What a wrong answer really costs
        </h2>
        <p className="text-lg text-indigo-300 font-semibold">The check is free. The miss is not.</p>
        <p className="text-base text-slate-300 text-wrap">
          A confident wrong answer doesn&apos;t arrive as an invoice. It arrives as the hour you spend building on it,
          the tokens you burn arguing with it, and the momentum you lose when you find out and start over. The second
          confident answer, the one that contradicts the first, is worse: now you&apos;re researching the AI instead of
          building.
        </p>
        <p className="text-base text-slate-300 text-wrap">
          TrustShell runs before that spend. Two other AIs read the answer, and you see Checks out, Caught or Not
          checked, with what each one said. Not checked means they did not agree, or could not answer, so look before
          you lean on it. It never means the answer checks out.
        </p>
        <p className="text-sm text-slate-400" data-testid="home-cost-free">
          Free to try. No signup, no wallet.
        </p>
      </div>
    </section>
  );
}
