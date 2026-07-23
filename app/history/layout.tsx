import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Decision history — TrustShell',
  description: 'Your browser-only audit trail: every prompt, verdict, and RepID change.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
