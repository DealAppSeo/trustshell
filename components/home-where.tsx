/**
 * Screen 4. Where this goes: what is live today, and what is next, never mixed.
 *
 * The bigger picture (a trust record that is yours, an agent that earns a longer leash) lives here
 * and not on the first screen, which stays on the fear and the stamp. Every "Live today" line is
 * true now; every "Next" line says next. A stranger must never read a plan as a feature.
 * Strangers read Checks out / Caught / Not checked on the form above.
 */
export function HomeWhere() {
  return (
    <section id="where" aria-labelledby="where-heading" className="bg-slate-950 px-4 sm:px-6 pb-28 sm:pb-24 text-white">
      <div className="mx-auto max-w-xl min-w-0 space-y-6 break-words">
        <h2 id="where-heading" className="text-xl font-semibold text-white">
          Where this goes
        </h2>
        <p className="text-slate-300">
          The same check, on this page, in your chats, in your terminal, and in an agent that already speaks MCP.
        </p>

        <section aria-labelledby="where-now" className="space-y-2" data-testid="where-now">
          <h3 id="where-now" className="text-base font-semibold text-white">
            Live today
          </h3>
          <ul className="list-disc pl-5 space-y-2 text-slate-300 marker:text-slate-500">
            <li>Two checkers, Groq and Cerebras. No signup. What you type is not stored.</li>
            <li>Known key and personal-data formats are removed before sending. Do not paste secrets.</li>
            <li>Whole-sentence arithmetic is exact, with no model.</li>
            <li>
              Agents have a public reputation score, RepID, with a proof your own browser checks. Open the
              extension and type an agent&apos;s name.
            </li>
          </ul>
        </section>

        <section aria-labelledby="where-next" className="space-y-2" data-testid="where-next">
          <h3 id="where-next" className="text-base font-semibold text-white">
            Next
          </h3>
          <ul className="list-disc pl-5 space-y-2 text-slate-300 marker:text-slate-500">
            <li>
              A trust record that is yours: your checks, settings and preferences, carried to any model. Take
              it with you when you leave.
            </li>
            <li>An agent with a good record earns a longer leash, and only as long as you allow.</li>
            <li>A third checker is not here yet.</li>
          </ul>
        </section>
      </div>
    </section>
  );
}
