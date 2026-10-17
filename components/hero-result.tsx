import { votesLine } from '@/src/lib/claim';
import { HERO_RUN, HERO_RUN_RECORD, HOME_SAMPLES } from '@/lib/home-samples';
import { MEANING } from '@/lib/stamp-words';

/**
 * The result card in the hero: one real check, shown instead of described (UX copy, 2026-10-16).
 *
 * NOTHING HERE IS WRITTEN FOR THE CARD. The sentence, the label and who said what are read from
 * HERO_RUN, a production response copied from the call recorded in docs/measurements/
 * hero-card-2026-10-16.md. The verdict words are the live check's own (lib/stamp-words.ts), and the
 * "who said what" line is the same votesLine the live check prints. The one stored sentence, the
 * arithmetic, is the price card's `why`, shown under the same rule CheckForm uses: only when the
 * label that came back is the label it explains.
 *
 * A server component with no request: the page still sends nothing on load (tests/home-check).
 */
export function HeroResult() {
  const { response } = HERO_RUN;
  const meaning = MEANING[response.label];
  const sample = HOME_SAMPLES.find((s) => s.text === HERO_RUN.text);
  const why = sample?.why && sample.why.when === response.label ? sample.why.text : '';
  const said = votesLine(response.votes);

  return (
    <figure
      aria-labelledby="hero-result-title"
      data-testid="hero-result"
      data-label={response.label}
      className={`min-w-0 rounded-2xl border bg-[#0f172a] p-5 sm:p-6 text-left space-y-3 ${meaning.tone}`}
    >
      <p id="hero-result-title" className="text-xs font-semibold uppercase tracking-wide text-[#94a3b8]">
        {sample ? `${sample.label} · ` : ''}a real check
      </p>
      <blockquote className="space-y-1">
        <p className="text-sm text-[#94a3b8]">An AI said:</p>
        <p className="text-base sm:text-lg text-white">&ldquo;{HERO_RUN.text}&rdquo;</p>
      </blockquote>
      <figcaption className="space-y-2">
        <p className="flex items-center gap-2 text-2xl font-bold" data-testid="hero-result-label">
          <span aria-hidden="true">{meaning.icon}</span>
          {meaning.title}
        </p>
        <p className="text-[#cbd5e1]">{meaning.body}</p>
        {why && (
          <p className="text-white" data-testid="hero-result-why">
            {why}
          </p>
        )}
        {said && <p className="text-sm text-[#94a3b8]">{said}</p>}
        <p className="text-sm text-[#94a3b8]">
          Checked live on {HERO_RUN.on}.{' '}
          <a href={HERO_RUN_RECORD} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-white">
            See the run
          </a>
          .
        </p>
      </figcaption>
    </figure>
  );
}
