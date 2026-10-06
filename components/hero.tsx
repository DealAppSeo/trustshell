import CheckForm from '@/app/check/CheckForm';
import { HOME_SAMPLES } from '@/lib/home-samples';

/**
 * Screens 1 and 2: the fear, then the stamp. (Sean said GO on 2026-10-05 for Grok's order: pain,
 * fear, solution, the obvious choice. The page used to lead with the mechanism.)
 *
 * The headline is "AI lies.", Sean's call on 2026-10-05, overruling an earlier softer line ("AI
 * sounds sure. It is often wrong."). The next two lines are his, worded to what is live today:
 *   - "answer to other models", not a line about putting its reputation at risk: the model that
 *     wrote a chat reply has no score here and risks nothing. Two other models read it, and that is
 *     the whole claim this line makes.
 *   - the harness line leaves out "your context, preferences and settings" and "saving you money":
 *     the first is a "Next" line on screen 4 (home-where.tsx) and the second was never measured. A
 *     first screen that says a plan in the present tense contradicts the page's own "Next" list.
 *
 * TRY TO TRICK IT (Sean, 2026-10-06). The old box was prefilled with the speed trap under a caption
 * that gave the answer away before anyone pressed Check, and read as a canned demo. Now three cards,
 * two wrong and one right, invite a guess first; picking one checks it live, and the answer shows
 * who checked it, how long it took and exactly what the engine sent back (CheckForm). Every card
 * was measured against production (lib/home-samples.ts). Nothing is sent on load: only a click.
 *
 * The solution line names the moments that matter (Grok, 2026-10-06): before you ship it, cite it,
 * or let an agent act on it. Grok's "Now it has to show its work" was not taken for the line above:
 * the stamp shows who checked and what they said, not any reasoning, so "show its work" would claim
 * more than the page delivers. Three questions sit still under the hero (components/home-questions.tsx);
 * lib/why-questions.ts says why they do not rotate.
 *
 * One door per screen. The install steps moved to the next screen (#add-agent); this one has the
 * check and one link down to it. No logo here: the nav already carries it, and a second one pushed
 * the fear off a phone screen.
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
            Now it has to answer to other models, so the truth comes out.
          </p>
          <p className="max-w-xl mx-auto pt-2 text-base sm:text-lg text-slate-300 text-wrap" data-testid="hero-harness">
            TrustShell is a portable trust harness. Your agent can use any model, with no vendor lock-in,
            and a wrong answer gets caught before it costs you.
          </p>
          <p className="max-w-xl mx-auto text-base sm:text-lg text-slate-200 text-wrap" data-testid="hero-solution">
            Before you ship it, cite it, or let an agent act on it, two checkers read it. You see what they said:
            Checks out, Caught, or Not checked.
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
          <CheckForm samples={HOME_SAMPLES} boxLabel="Or paste something an AI told you" />
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
              Add it to the AI you already use
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
