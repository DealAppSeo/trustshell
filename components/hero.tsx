import CheckForm from '@/app/check/CheckForm';
import CompareForm from '@/app/check/CompareForm';
import { HeroResult } from '@/components/hero-result';
import { HERO_RUN, HOME_SAMPLES } from '@/lib/home-samples';
import { MEANING } from '@/lib/stamp-words';

/**
 * JOB 1, ON THE FIRST SCREEN: "An AI just told me something I'm about to use. Is it right?"
 * (UX copy, 2026-10-16, E:\dev\reports\2026-10-16\TRUSTSHELL_UX_COPY.md.) Sean: the page "tells
 * everything, shows nothing". So the first screen is the job, a real result, and the box. Nothing else.
 *
 * WHAT IT SAYS, AND WHERE EACH LINE COMES FROM. No new claim: each line restates one the site already
 * made (the PR body lists them).
 *   - The headline narrows the copy doc's "Know if an AI answer is right": two checkers agreeing is not
 *     the truth (Sean, 2026-10-06), and a check can come back Not checked, so the page promises the
 *     second opinion it has always promised ("TrustShell gets you a second opinion before you build on it").
 *   - The subhead is the old solution line, shortened: "Two other AIs check the answer, and you see what
 *     each one said."
 *   - The legend is the live check's own words for each label, and the cost section's line for Not checked.
 *
 * SHOWN, NOT DESCRIBED. HeroResult is one real production check of the price card, with its date
 * (lib/home-samples.ts HERO_RUN). The price card is therefore not offered again under "try one of
 * ours": its answer is already on screen.
 *
 * ONE ACTION. The box and its Check button are the only primary action here. The measured cards and
 * "Paste both" stay one click away, folded. Nothing is sent on load: only a click.
 *
 * WHERE THE OLD HERO WENT. The pain lines ("AI lies. Or it sounds sure and it's wrong.") open the why
 * section (components/home-why.tsx). "What it will not call" is the proof card (home-proof.tsx). The
 * glass box and OpenShell lines are on /vision. "Works with whatever model you use" heads job 2.
 */
const TRY_ONE = HOME_SAMPLES.filter((s) => s.text !== HERO_RUN.text);

/**
 * The three results, as three chips under the card. Each short meaning restates the live result words
 * ("Checked and found true." / "Checked and found false." / "Not decided.") and the cost section's
 * "so look before you lean on it".
 */
const LEGEND = [
  { label: 'pass', meaning: 'checked and found true' },
  { label: 'veto', meaning: 'checked and found false' },
  { label: 'not-checked', meaning: 'not decided, so look before you lean on it' },
] as const;

export function Hero() {
  return (
    <section
      id="check"
      aria-labelledby="hero-heading"
      className="px-4 sm:px-6 pt-8 pb-14 md:pt-16 md:pb-20 bg-slate-950 text-white"
    >
      {/* DOM order is the phone order: the job, the result, the box. From lg the result moves to its own
          column beside the box, so the whole job fits the first screen at 1280x800. */}
      <div className="mx-auto grid max-w-6xl min-w-0 gap-6 lg:grid-cols-2 lg:gap-x-12">
        <div className="min-w-0 space-y-3 lg:col-start-1 lg:row-start-1">
          <h1 id="hero-heading" className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight">
            Get a second opinion before you use an AI answer.
          </h1>
          <p className="text-lg sm:text-xl text-slate-200" data-testid="hero-sub">
            Paste the answer. Two other AIs check it, and you see what each one said.
          </p>
        </div>

        <div className="min-w-0 space-y-3 lg:col-start-2 lg:row-start-1 lg:row-span-2">
          <HeroResult />
          <ul aria-label="What each result means" className="flex flex-wrap gap-2" data-testid="hero-legend">
            {LEGEND.map(({ label, meaning }) => (
              <li
                key={label}
                className={`flex max-w-full items-baseline gap-1.5 rounded-lg border bg-[#0f172a] px-3 py-1.5 text-sm ${MEANING[label].tone}`}
              >
                <span aria-hidden="true">{MEANING[label].icon}</span>
                {/* One run of text, so a long meaning wraps like a sentence inside the chip on a phone. */}
                <span>
                  <strong className="font-semibold">{MEANING[label].title}</strong>{" "}
                  <span className="text-slate-300">{meaning}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-2">
          <CheckForm
            samples={TRY_ONE}
            samplesLabel="No answer handy? Try one of ours. One is wrong, one is right."
            boxLabel="Now check your own"
            submitLabel="Check this answer"
            privacyFolded
            emptyHint="Paste an answer in the box first, then check it."
          />
          <CompareForm />
        </div>
      </div>
    </section>
  );
}
