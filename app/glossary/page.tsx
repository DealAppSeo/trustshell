import type { Metadata } from 'next';
import Link from 'next/link';
import { GlossaryBrowser } from '@/components/glossary-browser';
import { HYPERDAG_GLOSSARY, TERMS } from '@/lib/glossary';

export const metadata: Metadata = {
  title: 'Glossary — every term, defined · TrustShell',
  description:
    'Plain-language definitions for every term TrustShell uses, each with its own link. Includes what is shipped, what is approximate, and what is not live yet.',
};

export default function GlossaryPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-10 md:py-14 space-y-10">
      <header className="space-y-4">
        <p className="text-xs uppercase tracking-widest text-accent font-semibold">
          TrustShell · Portable Agentic Trust Harness
        </p>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
          Every term, defined.
        </h1>
        <p className="text-base md:text-lg text-muted leading-relaxed max-w-3xl">
          {TERMS.length} terms you will meet using TrustShell — each with its own link, so any
          page can point straight at a definition instead of assuming you already know it.
        </p>
        <p className="text-muted leading-relaxed max-w-3xl">
          Each entry carries an honest status.{' '}
          <strong className="text-foreground">Shipped</strong> means it runs today.{' '}
          <strong className="text-foreground">Approximate</strong> means it is measured against a
          documented stand-in and says which way it can be wrong.{' '}
          <strong className="text-foreground">Not live yet</strong> means it is designed and wired
          as a contract surface but the implementation behind it is a stub. A glossary that reads
          as a feature list is just overclaiming with extra steps.
        </p>
      </header>

      <GlossaryBrowser />

      <footer className="border-t border-border pt-8 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Going deeper</h2>
        <p className="text-muted leading-relaxed max-w-3xl">
          This page covers what appears in the TrustShell interface. The protocol underneath has a
          wider vocabulary — validator design, ledger architecture, the research problems still
          open — and it is defined once, on HyperDAG, rather than copied here where the copy would
          quietly drift out of date.
        </p>
        <div className="flex flex-wrap gap-4">
          <a
            href={HYPERDAG_GLOSSARY}
            className="text-accent hover:underline focus:outline-none focus:ring-2 focus:ring-accent rounded"
          >
            HyperDAG glossary — 40+ protocol terms →
          </a>
          <Link
            href="/mission"
            className="text-accent hover:underline focus:outline-none focus:ring-2 focus:ring-accent rounded"
          >
            Why we are building this →
          </Link>
        </div>
        <p className="text-sm text-muted/80 leading-relaxed max-w-3xl pt-2">
          Found a term we use but have not defined? That is a bug in this page, and we would like
          to hear about it.
        </p>
      </footer>
    </div>
  );
}
