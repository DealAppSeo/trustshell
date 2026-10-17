import { CARD_RUNS, HERO_RUN_RECORD, UNSOURCED_QUOTE_RUNS } from '@/lib/home-samples';

/**
 * The proof, shown as one card (UX copy, 2026-10-16): the raw runs behind every example on this page,
 * and the "what it will not call" result that used to sit in the hero. Moved, not reworded.
 */
export function HomeProof() {
  return (
    <section
      id="proof"
      aria-labelledby="proof-heading"
      data-testid="home-proof"
      className="bg-slate-950 px-4 sm:px-6 py-14 text-white border-t border-slate-800"
    >
      <div className="mx-auto max-w-3xl min-w-0 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 sm:p-6 space-y-3">
        <h2 id="proof-heading" className="text-xl sm:text-2xl font-bold text-white text-wrap">
          The runs behind this page
        </h2>
        <p className="text-base text-slate-300 text-wrap">
          The result at the top and the examples you can try were sent to the live checkers first. Every answer is
          published exactly as it came back.
        </p>
        <p className="text-sm text-slate-400 text-wrap" data-testid="hero-wont-call">
          What it will not call: {UNSOURCED_QUOTE_RUNS.quotes} famous quotes pinned on people who never said them came
          back Not checked {UNSOURCED_QUOTE_RUNS.times} times out of {UNSOURCED_QUOTE_RUNS.of} on {UNSOURCED_QUOTE_RUNS.on}.
          Who said a line is something the checkers cannot look up, so they do not guess.
        </p>
        <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm font-semibold">
          <li>
            <a href={CARD_RUNS} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-amber-400 underline underline-offset-4 hover:text-amber-300">
              See every run behind the examples
            </a>
          </li>
          <li>
            <a href={HERO_RUN_RECORD} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-amber-400 underline underline-offset-4 hover:text-amber-300">
              See the run behind the result at the top
            </a>
          </li>
        </ul>
      </div>
    </section>
  );
}
