import type { Metadata } from 'next';
import { Hero } from '@/components/hero';
import { HomeAgent } from '@/components/home-agent';
import { HomeWhere } from '@/components/home-where';
import { StickyCheck } from '@/components/sticky-check';

export const metadata: Metadata = {
  title: 'TrustShell',
  description: 'AI sounds sure. It is often wrong. Now it has to show its work.',
  keywords: ['TrustShell'],
  openGraph: {
    title: 'TrustShell',
    description: 'AI sounds sure. It is often wrong. Now it has to show its work.',
    type: 'website',
    url: 'https://trustshell.dev',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TrustShell',
    description: 'AI sounds sure. It is often wrong. Now it has to show its work.',
  },
};

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <Hero />
      <HomeAgent />
      <HomeWhere />
      <StickyCheck />
    </main>
  );
}
