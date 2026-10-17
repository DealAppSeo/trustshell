import type { Metadata } from 'next';
import { Hero } from '@/components/hero';
import { HomeAgent } from '@/components/home-agent';
import { HomeYourAgent } from '@/components/home-your-agent';
import { HomeProof } from '@/components/home-proof';
import { HomeQuestions } from '@/components/home-questions';
import { HomeCost } from '@/components/home-cost';
import { HomeWhere } from '@/components/home-where';
import { StickyCheck } from '@/components/sticky-check';

// The share line (Sean's GO, 2026-10-06): the pain, then the product in one sentence. It no longer
// says "so the truth comes out": two models agreeing is not the truth, and nothing here claims it is.
const DESCRIPTION = "AI lies, or sounds sure and is wrong. TrustShell gets you a second opinion: two other AIs check the answer, and you see what each one said.";

export const metadata: Metadata = {
  title: 'TrustShell',
  description: DESCRIPTION,
  keywords: ['TrustShell'],
  openGraph: {
    title: 'TrustShell',
    description: DESCRIPTION,
    type: 'website',
    url: 'https://trustshell.dev',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TrustShell',
    description: DESCRIPTION,
  },
};

/**
 * THE HOME PAGE BY JOBS (UX copy, 2026-10-16; E:\dev\reports\2026-10-16\TRUSTSHELL_UX_COPY.md), in
 * the order of how many visitors have them:
 *   1. Check one answer before acting on it: the first screen, zero clicks to start (Hero).
 *   2. Get the same check where they already chat: one row of three choices (HomeAgent).
 *   3. Make an agent they can trust: one door, to /pai (HomeYourAgent).
 * Then the proof (HomeProof), and the why last, as small cards and folded sections (HomeQuestions,
 * HomeCost, HomeWhere). The vision stays; it takes a back seat to showing what the product does.
 */
export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <Hero />
      <HomeAgent />
      <HomeYourAgent />
      <HomeProof />
      <HomeQuestions />
      <HomeCost />
      <HomeWhere />
      <StickyCheck />
    </main>
  );
}
