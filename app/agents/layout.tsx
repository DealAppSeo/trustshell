import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Your agents — TrustShell',
  description: 'Create a TrustShell-wrapped agent: every response HAL-scored for hallucination detection, honest behavior earns portable on-chain RepID.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
