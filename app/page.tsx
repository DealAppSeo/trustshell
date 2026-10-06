import type { Metadata } from 'next';
import { Hero } from '@/components/hero';
import { HomeAgent } from '@/components/home-agent';
import { HomeCost } from '@/components/home-cost';
import { HomeQuestions } from '@/components/home-questions';
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

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <Hero />
      <HomeQuestions />
      <HomeCost />
      <HomeAgent />
      <HomeWhere />
      <StickyCheck />
    </main>
  );
}
