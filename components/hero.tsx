import CheckForm from '@/app/check/CheckForm';
import CompareForm from '@/app/check/CompareForm';
import { CARD_RUNS, HOME_SAMPLES, UNSOURCED_QUOTE_RUNS } from '@/lib/home-samples';

/**
 * Screens 1 and 2: the fear, then the stamp. (Sean said GO on 2026-10-05 for Grok's order: pain,
 * fear, solution, the obvious choice.)
 *
 * The headline is "AI lies.", Sean's call on 2026-10-05.
 *
 * THE LINES UNDER IT (Sean's GO, 2026-10-06, on Grok's notes and Claude's review of them). The pain
 * is not one wrong answer. It is a sure answer, then a second sure answer the other way, and an
 * afternoon spent researching the AI instead of building. So the hero says that, then the product in
 * one sentence: a second opinion on the answer you already have, where you see what each checker said.
 * What was dropped, and why:
 *   - "Now it has to answer to other models, so the truth comes out." Two models agreeing is not the
 *     truth, and this page must not call it a source of truth: a source of truth is a record you can
 *     re-check (Sean, 2026-10-06). The stamp says what two checkers said; it does not settle facts.
 *   - "TrustShell is a portable trust harness." Do not open with the mechanism (Grok). It lives in
 *     /why/harness, one click down. "Works with whatever model you use" keeps the no-lock-in point.
 * "You see what each one said" is true only with the engine's `votes` field (repid-engine, 2026-10-06):
 * before it, a disagreement read "No agreed answer". This copy ships with it, not before.
 *
 * TRY TO TRICK IT (Sean, 2026-10-06). Three cards, two wrong and one right, invite a guess first;
 * picking one checks it live. Every card names a moment where a wrong answer costs something (pay,
 * cite, run), was measured against production, and shows those runs with their date after the answer
 * (lib/home-samples.ts). Nothing is sent on load: only a click.
 *
 * WHAT IT WILL NOT CALL. Two quotes with no source came back Not checked 10 times out of 10. That is
 * the stamp working: who said a line is not something the checkers can look up, so they do not
 * guess. Saying so on the first screen is what keeps "Not checked" from reading as a failure.
 *
 * One door per screen. The install steps are on the next screen (#add-agent); this one has the
 * check and one link down to it. No logo here: the nav already carries it.
 */
export function Hero() {
  return (
    <section className="relative px-4 sm:px-6 pt-12 pb-16 md:pt-20 md:pb-20 bg-slate-950 text-white overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.05)_0%,transparent_70%)] pointer-events-none" />

      <div className="max-w-3xl w-full min-w-0 mx-auto space-y-8 relative z-10">
        <div className="text-center space-y-4">
          <h1 className="max-w-full text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-white text-wrap leading-tight">
            AI lies.
          </h1>
          <p className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-indigo-300 text-wrap" data-testid="hero-act">
            Or it sounds sure and it&apos;s wrong.
          </p>
          <p className="max-w-xl mx-auto pt-2 text-lg sm:text-xl text-slate-200 text-wrap" data-testid="hero-pain">
            Ask again, and it&apos;s just as sure the other way. Both can&apos;t be right.
          </p>
          <p className="max-w-xl mx-auto text-base sm:text-lg text-slate-300 text-wrap" data-testid="hero-solution">
            TrustShell gets you a second opinion before you build on it. Two other AIs check the answer, and you
            see what each one said: Checks out, Caught, or Not checked. If they disagree, it tells you instead of
            guessing.
          </p>
          <p className="text-sm text-slate-400" data-testid="hero-any-model">
            Works with whatever model you use.
          </p>
        </div>

        <div
          className="max-w-3xl w-full min-w-0 mx-auto rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6 text-left space-y-3"
          data-testid="hero-trick"
        >
          <h2 className="text-xl sm:text-2xl font-bold text-white">Try to trick it</h2>
          <p className="text-base text-slate-300 text-wrap" data-testid="hero-trick-setup">
            Two of these are wrong and one is right. Guess first, then pick one and watch two other AIs check it, live.
          </p>
          <CheckForm samples={HOME_SAMPLES} boxLabel="Or paste the answer you almost used" />
          <p className="text-sm text-slate-400 text-wrap" data-testid="hero-wont-call">
            What it will not call: {UNSOURCED_QUOTE_RUNS.quotes} famous quotes pinned on people who never said them
            came back Not checked {UNSOURCED_QUOTE_RUNS.times} times out of {UNSOURCED_QUOTE_RUNS.of} on{' '}
            {UNSOURCED_QUOTE_RUNS.on}. Who said a line is something the checkers cannot look up, so they do not
            guess.{' '}
            <a href={CARD_RUNS} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-white">
              See every run
            </a>
            .
          </p>
          <CompareForm />
        </div>

        <div className="max-w-xl w-full min-w-0 mx-auto text-center space-y-3" data-testid="hero-glass">
          <p className="text-base sm:text-lg text-slate-200 text-wrap">
            The black box becomes a glass box: you see who checked it, and what they said.
          </p>
          <p className="text-sm text-slate-400 text-wrap">
            NVIDIA OpenShell cages what an agent can touch. TrustShell checks what it says.
          </p>
          <p className="text-sm text-slate-400">No signup. No wallet. Leave whenever you want.</p>
          <p className="pt-2">
            <a
              href="#add-agent"
              data-testid="hero-add"
              className="inline-flex items-center justify-center rounded-lg border border-amber-600 px-5 py-3 text-sm font-bold text-amber-400 hover:bg-amber-600 hover:text-white transition-colors"
            >
              Add it to the agent you already use
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
