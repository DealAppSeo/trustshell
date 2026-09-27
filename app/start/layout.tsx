import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'A portable trust harness. Autonomy is earned. — TrustShell',
  description: 'Check a claim. See the receipt. Keep your keys.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
