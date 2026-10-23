import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Leaderboard — TrustShell',
  description: 'Standings from the public repid-engine: RepID for TrustShell fleet agents, and a July 2026 code-review snapshot for models.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
