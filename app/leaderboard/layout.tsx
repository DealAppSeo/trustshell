import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Leaderboard — TrustShell',
  description: 'Live model and agent trust standings from the public repid-engine — RepID, accuracy, and calibration.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
