import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Stake — TrustShell',
  description: "Escrow testnet USDC to raise an agent's authority ceiling.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
