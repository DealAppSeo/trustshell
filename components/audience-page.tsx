import Link from 'next/link';
import { ReceiptCard } from '@/components/receipt-card';
import { SpotTheLie } from '@/components/spot-the-lie';
import { citeNumbers, sourcesFor, type Audience } from '@/lib/audiences';

/**
 * One audience page (lib/audiences.ts has the words and the reasoning). The order is the whole design:
 *   1. a headline, one line, one action, and an image that is a real product artefact;
 *   2. what the audience fears, each with a numbered source, what TrustShell does, and what it does NOT do;
 *   3. See it, Limit it, Keep it: three benefits, not a feature list;
 *   4. one door to build their own;
 *   5. the sources, numbered, at the bottom.
 * Nothing on this page sends a request: the game is local and the links do not prefetch.
 */
const BENEFITS = [
  {
    title: 'See it',
    line: 'Check what your AI says against the record, and see what each checker said.',
  },
  {
    title: 'Limit it',
    line: 'A spending cap set in code, not in a prompt. Test network only.',
  },
  {
    title: 'Keep it',
    line: 'Your memory and profile stay on your machine, whichever model you use. Moving them to another machine as one signed file is in preview.',
  },
] as const;

export function AudiencePage({ a }: { a: Audience }) {
  const sources = sourcesFor(a);
  return (
    <div className="bg-slate-950 text-white" data-testid="audience-page" data-audience={a.slug}>
      <section aria-labelledby="aud-heading" className="px-4 sm:px-6 pt-8 pb-12 md:pt-16 md:pb-16">
        <div className="mx-auto grid max-w-6xl min-w-0 gap-8 lg:grid-cols-2 lg:gap-x-12">
          <div className="min-w-0 space-y-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-amber-400">{a.eyebrow}</p>
            <h1 id="aud-heading" className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight text-white text-wrap">
              {a.h1}
            </h1>
            <p className="text-lg sm:text-xl text-slate-200 text-wrap" data-testid="aud-sub">
              {a.sub}
            </p>
            <p className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <Link
                href={a.primary.href}
                prefetch={false}
                data-testid="aud-primary"
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-amber-600 px-6 py-3 text-base font-bold text-black hover:bg-amber-500"
              >
                {a.primary.label}
              </Link>
              {a.secondary && (
                <Link
                  href={a.secondary.href}
                  prefetch={false}
                  data-testid="aud-secondary"
                  className="inline-flex min-h-11 items-center text-amber-400 underline underline-offset-4 hover:text-amber-300"
                >
                  {a.secondary.label} →
                </Link>
              )}
            </p>
            {a.visual === 'receipt' && <p className="text-sm text-slate-400">Developer preview. No account, no key.</p>}
          </div>
          <div className="min-w-0">{a.visual === 'game' ? <SpotTheLie /> : <ReceiptCard />}</div>
        </div>
      </section>

      <section aria-labelledby="aud-fears" className="border-t border-slate-800 px-4 sm:px-6 py-12">
        <div className="mx-auto max-w-3xl min-w-0 space-y-6">
          <h2 id="aud-fears" className="text-2xl sm:text-3xl font-bold text-white text-wrap">
            What worries people, and why it is justified
          </h2>
          <ul className="space-y-5">
            {a.fears.map((f) => (
              <li key={f.worry} className="min-w-0 rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-3" data-testid="aud-fear">
                <h3 className="text-lg font-bold text-white text-wrap">“{f.worry}”</h3>
                <p className="text-slate-300 text-wrap">
                  {f.proof}
                  {citeNumbers(a, f).map((n) => (
                    <sup key={n} className="ml-0.5">
                      <a href={`#src-${n}`} className="text-amber-400 underline underline-offset-2" aria-label={`Source ${n}`}>
                        [{n}]
                      </a>
                    </sup>
                  ))}
                </p>
                <p className="text-slate-200 text-wrap">
                  <strong className="text-white">What TrustShell does.</strong> {f.does}
                </p>
                <p className="text-slate-400 text-wrap" data-testid="aud-does-not">
                  <strong className="text-slate-200">What it does not do.</strong> {f.doesNot}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="aud-benefits" className="border-t border-slate-800 px-4 sm:px-6 py-12">
        <div className="mx-auto max-w-5xl min-w-0 space-y-6">
          <h2 id="aud-benefits" className="text-2xl sm:text-3xl font-bold text-white">
            See it. Limit it. Keep it.
          </h2>
          <ul className="grid gap-4 md:grid-cols-3">
            {BENEFITS.map((b) => (
              <li key={b.title} className="min-w-0 rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-2">
                <h3 className="text-xl font-bold text-amber-400">{b.title}</h3>
                <p className="text-slate-300 text-wrap">{b.line}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="aud-door" className="border-t border-slate-800 px-4 sm:px-6 py-12">
        <div className="mx-auto max-w-3xl min-w-0 space-y-4">
          <h2 id="aud-door" className="text-2xl sm:text-3xl font-bold text-white text-wrap">
            Make yours in three questions.
          </h2>
          <p className="text-lg text-slate-300 text-wrap">Your rules, your memory. No wallet to start.</p>
          <p>
            <Link
              href="/pai"
              prefetch={false}
              data-testid="aud-build"
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-amber-600 px-6 py-3 text-base font-bold text-black hover:bg-amber-500"
            >
              Build your agent
            </Link>
          </p>
        </div>
      </section>

      <section aria-labelledby="aud-sources" className="border-t border-slate-800 px-4 sm:px-6 py-12">
        <div className="mx-auto max-w-3xl min-w-0 space-y-4">
          <h2 id="aud-sources" className="text-xl font-bold text-white">
            Sources
          </h2>
          <p className="text-sm text-slate-400 text-wrap">
            These are reports we read, not measurements we made. Where a number matters, read the original before you rely on it.
          </p>
          <ol className="space-y-3" data-testid="aud-sources">
            {sources.map(({ n, source }) => (
              <li key={source.id} id={`src-${n}`} className="text-sm text-slate-300 text-wrap scroll-mt-24">
                <span className="text-slate-400">[{n}]</span>{' '}
                <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-amber-300">
                  {source.name}
                </a>
                . <span className="text-slate-400">{source.note}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  );
}
