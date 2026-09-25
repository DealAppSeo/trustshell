import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'A portable trust harness so AI has to earn it — TrustShell',
  description: 'Check a claim. See the receipt. Keep your keys.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
