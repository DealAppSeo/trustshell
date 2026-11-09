import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FirstRunFlow } from '@/components/first-run-flow';

/**
 * PREVIEW ONLY, like /lab/test-agent. A first-run journey for three kinds of visitor: a 404 on production, not
 * linked, not indexed. The current home page and every existing route are unchanged.
 */
export const metadata: Metadata = {
  title: 'Preview: try, test, report',
  robots: { index: false, follow: false },
};

export default function LabStartPage() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  return (
    <main className="min-h-screen bg-background px-4 py-10 sm:px-6 sm:py-14">
      <div className="mx-auto max-w-2xl space-y-6">
        <p className="rounded-lg border border-amber-500/40 px-4 py-3 text-sm text-amber-300" data-testid="lab-banner">
          Preview. This page is not live on trustshell.dev.
        </p>
        <h1 className="text-4xl font-semibold leading-tight text-foreground sm:text-5xl">Check what your AI did, not what it says it did.</h1>
        <p className="text-lg leading-relaxed text-slate-300">Try it on a saved example, test it on your own work, then read the report. No account and no key.</p>
        <FirstRunFlow />
      </div>
    </main>
  );
}
