import type { Metadata } from 'next';
import { TryDoor } from '@/components/try-door';

/**
 * PREVIEW. Not linked from any navigation, kept out of search results. It is safe to merge: it renders a form, and
 * nothing is sent until the visitor presses Check. See lib/try-door.ts for what a press does.
 */
export const metadata: Metadata = {
  title: 'Try it: check one claim about a CI run',
  robots: { index: false, follow: false },
};

export default function TryPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-10 sm:px-6 sm:py-14">
      <div className="mx-auto max-w-2xl space-y-6">
        <p className="rounded-lg border border-amber-500/40 px-4 py-3 text-sm text-amber-300" data-testid="preview-notice">
          Preview. Not announced. No account, no wallet, no key. Pressing Check sends the run URL and the sentence to this site, which reads GitHub and answers.
        </p>
        <h1 className="text-4xl font-semibold leading-tight text-foreground sm:text-5xl">Did that CI run really pass?</h1>
        <p className="text-lg leading-relaxed text-slate-300">
          Paste a public GitHub Actions run URL and one sentence an AI said about it. TrustShell reads GitHub&apos;s own record of the run and marks the sentence.
        </p>
        <TryDoor />
      </div>
    </main>
  );
}
