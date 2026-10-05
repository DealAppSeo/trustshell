/**
 * Screen 4. What is true today, and the one door that is not open yet.
 * Strangers read Checks out / Caught / Not checked on the form above.
 */
export function HomeWhere() {
  return (
    <section id="where" aria-labelledby="where-heading" className="bg-slate-950 px-4 sm:px-6 pb-28 sm:pb-24 text-white">
      <div className="mx-auto max-w-xl min-w-0 space-y-4 break-words">
        <h2 id="where-heading" className="text-xl font-semibold text-white">
          Where this goes
        </h2>
        <p className="text-slate-300">
          The same check, on this page and in your terminal and in an agent that already speaks MCP.
        </p>
        <p className="text-slate-300">
          Today that is two checkers, Groq and Cerebras. No signup. What you type is not stored.
        </p>
        <p className="text-slate-300">Known key and personal-data formats are removed before sending. Do not paste secrets.</p>
        <p className="text-slate-300">Whole-sentence arithmetic is exact, with no model.</p>
        <p className="text-slate-400">A third checker is not here yet.</p>
      </div>
    </section>
  );
}
