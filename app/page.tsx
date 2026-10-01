import type { Metadata } from 'next';
import { Hero } from '@/components/hero';

export const metadata: Metadata = {
  title: 'TrustShell',
  description: 'A portable trust harness. Autonomy is earned.',
  keywords: ['TrustShell'],
  openGraph: {
    title: 'TrustShell',
    description: 'A portable trust harness. Autonomy is earned.',
    type: 'website',
    url: 'https://trustshell.dev',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TrustShell',
    description: 'A portable trust harness. Autonomy is earned.',
  },
};

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <Hero />
    </main>
  );
}
