import type { Metadata } from 'next';
import { Hero } from '@/components/hero';

export const metadata: Metadata = {
  title: 'TrustShell',
  description: 'AI lies. Now it has to show its work.',
  keywords: ['TrustShell'],
  openGraph: {
    title: 'TrustShell',
    description: 'AI lies. Now it has to show its work.',
    type: 'website',
    url: 'https://trustshell.dev',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TrustShell',
    description: 'AI lies. Now it has to show its work.',
  },
};

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <Hero />
    </main>
  );
}
