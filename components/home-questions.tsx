import { VisionHero } from '@/components/vision-hero';
import { WHY_QUESTIONS } from '@/lib/why-questions';

/**
 * WHY WE BUILT THIS: the last section of the home page (UX copy, 2026-10-16). The pain lines that used
 * to be the headline ("AI lies.", Sean's call on 2026-10-05) open it, then four small cards: the vision
 * and the three questions, each opening its piece. Moved down, not dropped: the first screen now shows
 * the job and a real result, and this is the why for anyone who wants it.
 *
 * Still, not rotating: lib/why-questions.ts says why, and is where a card is swapped. No client code,
 * no timer.
 */
export function HomeQuestions() {
  return (
    <section
      id="why"
      aria-labelledby="questions"
      data-testid="home-questions"
      className="px-4 sm:px-6 pt-14 pb-6 bg-slate-950 text-white border-t border-slate-800"
    >
      <div className="max-w-3xl w-full min-w-0 mx-auto space-y-5">
        <h2 id="questions" className="text-2xl sm:text-3xl font-bold text-white text-wrap">
          Why we built this
        </h2>
        <p className="text-base sm:text-lg text-slate-300 text-wrap" data-testid="why-pain">
          AI lies. Or it sounds sure and it&apos;s wrong. Ask again, and it&apos;s just as sure the other way. Both
          can&apos;t be right.
        </p>
        <ul className="grid gap-4 sm:grid-cols-2">
          <li>
            <VisionHero />
          </li>
          {WHY_QUESTIONS.map((q) => (
            <li key={q.slug}>
              <a
                href={`/why/${q.slug}`}
                data-testid={`question-${q.slug}`}
                className="flex h-full flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-5 hover:border-amber-500 focus-visible:border-amber-500 transition-colors"
              >
                <span className="block text-lg font-semibold text-white text-wrap">{q.question}</span>
                <span className="mt-4 block text-sm font-semibold text-amber-400">Read why</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
