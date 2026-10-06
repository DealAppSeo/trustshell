import { WHY_QUESTIONS } from '@/lib/why-questions';

/**
 * Three still cards under the stamp, each a question that opens its piece. Still, not rotating:
 * lib/why-questions.ts says why, and is where a card is swapped. No client code, no timer.
 */
export function HomeQuestions() {
  return (
    <section
      aria-labelledby="questions"
      data-testid="home-questions"
      className="px-4 sm:px-6 py-12 bg-slate-950 text-white border-t border-slate-800"
    >
      <div className="max-w-3xl w-full min-w-0 mx-auto space-y-4">
        <h2 id="questions" className="text-center text-sm font-semibold uppercase tracking-wide text-slate-400">
          Three questions
        </h2>
        <ul className="grid gap-4 sm:grid-cols-3">
          {WHY_QUESTIONS.map((q) => (
            <li key={q.slug}>
              <a
                href={`/why/${q.slug}`}
                data-testid={`question-${q.slug}`}
                className="flex h-full flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-5 hover:border-indigo-400 focus-visible:border-indigo-400 transition-colors"
              >
                <span className="block text-lg font-semibold text-white text-wrap">{q.question}</span>
                <span className="mt-4 block text-sm font-semibold text-indigo-300">Read why</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
