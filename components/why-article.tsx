import type { ReactNode } from 'react';
import { WHY_QUESTIONS, whyQuestion, type WhyQuestion } from '@/lib/why-questions';

/**
 * One of the three pieces the home page's question cards open. The heading is the card's own
 * question (lib/why-questions.ts), so a swapped card and its piece cannot disagree. Every piece
 * ends at the stamp: check a sentence, or add it to the agent you already use.
 */
export function WhyArticle({ slug, children }: { slug: WhyQuestion['slug']; children: ReactNode }) {
  const { question } = whyQuestion(slug);
  const others = WHY_QUESTIONS.filter((q) => q.slug !== slug);
  return (
    <main className="min-h-screen bg-slate-950 px-4 sm:px-6 py-16 text-white">
      <article className="mx-auto max-w-2xl space-y-5 text-base sm:text-lg leading-relaxed text-slate-300">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white text-wrap">{question}</h1>
        {children}
        <div className="flex flex-wrap gap-3 pt-4" data-testid="why-cta">
          <a
            href="/check"
            className="inline-flex items-center justify-center rounded-lg bg-amber-600 px-5 py-3 text-sm font-bold text-white hover:bg-amber-500 transition-colors"
          >
            Check a sentence
          </a>
          <a
            href="/#add-agent"
            className="inline-flex items-center justify-center rounded-lg border border-amber-600 px-5 py-3 text-sm font-bold text-amber-400 hover:bg-amber-600 hover:text-white transition-colors"
          >
            Add it to the agent you already use
          </a>
        </div>
        <nav aria-label="The other questions" className="border-t border-slate-800 pt-6 space-y-2 text-base">
          {others.map((q) => (
            <p key={q.slug}>
              <a href={`/why/${q.slug}`} className="text-indigo-300 hover:text-indigo-200">
                {q.question}
              </a>
            </p>
          ))}
        </nav>
      </article>
    </main>
  );
}

export function whyMetadata(slug: WhyQuestion['slug'], description: string) {
  const { question } = whyQuestion(slug);
  return {
    title: `${question} | TrustShell`,
    description,
    openGraph: { title: question, description, type: 'article' as const },
  };
}
