import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Your agents — TrustShell',
  description: 'Create and register a new test agent. Its answers are sent to a HAL hallucination check. A new agent gets an off-chain starting RepID and no on-chain identity.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
