import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Run prompts — TrustShell',
  description: 'Send prompts to your agents and watch HAL score every response in real time.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
