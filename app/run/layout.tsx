import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Run prompts — TrustShell',
  description: 'Send prompts to test agents you created here. Each answer is sent to a HAL hallucination check.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
