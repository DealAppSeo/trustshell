import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TestAgentFlow } from '@/components/test-agent-flow';

/**
 * PREVIEW ONLY, like /lab/talk. The guided path for testing your own agent: a 404 on production, not linked, not
 * indexed. It goes live only when the owner has tried it and the release it describes is published.
 */
export const metadata: Metadata = {
  title: 'Preview: test your own agent',
  robots: { index: false, follow: false },
};

export default function LabTestAgentPage() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white sm:px-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <p className="rounded-lg border border-amber-500/40 px-4 py-3 text-sm text-amber-300" data-testid="lab-banner">
          Preview. This page is not live on trustshell.dev.
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-white">Test your own agent</h1>
        <TestAgentFlow />
      </div>
    </main>
  );
}
