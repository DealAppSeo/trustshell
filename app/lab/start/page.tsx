import type { Metadata } from 'next';
import { FirstRunFlow } from '@/components/first-run-flow';

/**
 * PUBLIC BETA. A guided walkthrough for three kinds of visitor, linked from the home page and kept out of search
 * results while it is in beta. It was a production 404 until the owner authorized this launch on 2026-11-08.
 */
export const metadata: Metadata = {
  title: 'Public beta: try, test, report',
  robots: { index: false, follow: false },
};

export default function LabStartPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-10 sm:px-6 sm:py-14">
      <div className="mx-auto max-w-2xl space-y-6">
        <p className="rounded-lg border border-amber-500/40 px-4 py-3 text-sm text-amber-300" data-testid="beta-notice">
          Public beta. This walkthrough may change. The checks on this page use saved runs, and what you type stays in your browser.
        </p>
        <h1 className="text-4xl font-semibold leading-tight text-foreground sm:text-5xl">Check your AI&apos;s claims against the evidence.</h1>
        <p className="text-lg leading-relaxed text-slate-300">
          TrustShell checks the kinds of claims it can read, such as whether a GitHub Actions run passed. It does not see everything your AI did. Try it on a saved example, test it on your own work, then read the report. No account and no key.
        </p>
        <FirstRunFlow />
      </div>
    </main>
  );
}
