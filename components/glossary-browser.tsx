'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { GROUPS, TERMS, STATUS_LABEL, HYPERDAG_GLOSSARY, type Term } from '@/lib/glossary';

/**
 * Status is never colour-only — every badge carries the word. A reader who cannot
 * distinguish the hues still gets the whole message, and "Not live yet" is exactly the
 * message that must not be lost.
 */
const STATUS_CLASS: Record<Term['status'], string> = {
  shipped: 'border-accent/40 text-accent',
  approximate: 'border-border text-muted',
  'not-live': 'border-border text-muted',
  concept: 'border-border text-muted',
};

function matches(t: Term, q: string): boolean {
  if (!q) return true;
  const hay = [t.term, t.expansion ?? '', t.definition, t.note ?? '', ...(t.related ?? [])]
    .join(' ')
    .toLowerCase();
  return hay.includes(q.toLowerCase());
}

export function GlossaryBrowser() {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * An inbound `/glossary#a-eff` must land ON the term. Two things can break that: a
   * filter hiding the target, and the browser restoring scroll before the list renders.
   * Clearing the query and scrolling on mount handles both. `scroll-mt` on each entry
   * keeps the heading clear of the sticky header rather than tucked under it.
   */
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    setQuery('');
    const el = document.getElementById(hash);
    if (!el) return;
    // rAF so layout has settled; 'auto' because a long jump under prefers-reduced-motion
    // should not animate, and this is navigation rather than decoration.
    requestAnimationFrame(() => el.scrollIntoView({ behavior: 'auto', block: 'start' }));
  }, []);

  const visible = useMemo(() => TERMS.filter((t) => matches(t, query)), [query]);
  const count = visible.length;

  return (
    <div className="space-y-10">
      {/* SEARCH */}
      <div className="space-y-3">
        <label htmlFor="glossary-search" className="block text-sm font-medium text-foreground">
          Search terms
        </label>
        <input
          id="glossary-search"
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Try “grant”, “NOT_CHECKED”, “stake”…"
          autoComplete="off"
          className="w-full max-w-md rounded-lg border border-border bg-transparent px-4 py-2.5 text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent transition-colors duration-150"
        />
        <p className="text-sm text-muted" aria-live="polite">
          {query
            ? `${count} ${count === 1 ? 'term' : 'terms'} matching “${query}”`
            : `${TERMS.length} terms. Every one has its own link — click a heading to copy it.`}
        </p>
      </div>

      {/* JUMP LINKS */}
      {!query && (
        <nav aria-label="Glossary sections" className="flex flex-wrap gap-2">
          {GROUPS.map((g) => (
            <a
              key={g.id}
              href={`#${g.id}`}
              className="text-sm px-3 py-1.5 rounded-full border border-border text-muted hover:text-foreground hover:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent transition-colors duration-150"
            >
              {g.title}
            </a>
          ))}
        </nav>
      )}

      {/* EMPTY STATE — an absence, said plainly, with a way out. */}
      {count === 0 && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center space-y-3">
          <p className="text-foreground font-medium">No term here matches “{query}”.</p>
          <p className="text-sm text-muted max-w-md mx-auto">
            This glossary covers what you meet in the TrustShell interface. Protocol-depth
            terms live in the HyperDAG glossary.
          </p>
          <a
            href={HYPERDAG_GLOSSARY}
            className="inline-block text-sm text-accent hover:underline focus:outline-none focus:ring-2 focus:ring-accent rounded"
          >
            Search the HyperDAG glossary →
          </a>
        </div>
      )}

      {/* TERMS, BY GROUP */}
      {GROUPS.map((group) => {
        const inGroup = visible.filter((t) => t.group === group.id);
        if (inGroup.length === 0) return null;
        return (
          <section key={group.id} id={group.id} className="scroll-mt-24 space-y-6">
            <div className="border-b border-border pb-3">
              <h2 className="text-xl font-bold text-foreground">{group.title}</h2>
              <p className="text-sm text-muted mt-1">{group.blurb}</p>
            </div>

            <dl className="space-y-8">
              {inGroup.map((t) => (
                <div key={t.slug} id={t.slug} className="scroll-mt-24">
                  <dt className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
                    <a
                      href={`#${t.slug}`}
                      className="text-lg font-semibold text-foreground hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent rounded"
                    >
                      {t.term}
                    </a>
                    {t.expansion && (
                      <span className="text-sm text-muted">({t.expansion})</span>
                    )}
                    <span
                      className={`text-[11px] uppercase tracking-wider font-semibold border rounded-full px-2 py-0.5 ${STATUS_CLASS[t.status]}`}
                    >
                      {STATUS_LABEL[t.status]}
                    </span>
                  </dt>
                  <dd className="mt-2 space-y-2">
                    <p className="text-muted leading-relaxed">{t.definition}</p>
                    {t.note && (
                      <p className="text-sm text-muted/90 leading-relaxed border-l-2 border-border pl-3">
                        {t.note}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-sm">
                      {t.related && t.related.length > 0 && (
                        <span className="text-muted">
                          Related:{' '}
                          {t.related.map((r, i) => (
                            <span key={r}>
                              {i > 0 && ', '}
                              <a
                                href={`#${r}`}
                                className="text-accent hover:underline focus:outline-none focus:ring-2 focus:ring-accent rounded"
                              >
                                {r.replace(/-/g, ' ')}
                              </a>
                            </span>
                          ))}
                        </span>
                      )}
                      {t.deeper && (
                        <a
                          href={t.deeper.href}
                          className="text-accent hover:underline focus:outline-none focus:ring-2 focus:ring-accent rounded"
                        >
                          {t.deeper.label} →
                        </a>
                      )}
                    </div>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
    </div>
  );
}
