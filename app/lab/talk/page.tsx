import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HeroResult } from '@/components/hero-result';
import { OnboardingTalk } from '@/components/onboarding-talk';

/**
 * PREVIEW ONLY. The conversation that would follow a check, shown under a recorded result so it can be tried
 * on a phone from a pull request's preview deployment without turning anything on in production. On
 * production (VERCEL_ENV=production) this route is a 404, it is not linked, and it is not in the sitemap or
 * indexed. The home page itself shows nothing of this until NEXT_PUBLIC_ONBOARDING_TALK=1 (lib/onboarding-flag.ts).
 */
export const metadata: Metadata = {
  title: 'Preview: the conversation after a check',
  robots: { index: false, follow: false },
};

export default function LabTalkPage() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  return (
    <main className="bg-slate-950 px-4 py-10 text-white sm:px-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <p className="rounded-lg border border-amber-500/40 px-4 py-3 text-sm text-amber-300" data-testid="lab-banner">
          Preview. This page is not live on trustshell.dev, and nothing on it is sent anywhere. Under a real check, the box below would appear after the answer.
        </p>
        <HeroResult />
        <OnboardingTalk />
      </div>
    </main>
  );
}
