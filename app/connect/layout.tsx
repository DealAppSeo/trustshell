import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Connect a model — TrustShell',
  description: 'Create your encrypted, browser-only vault and connect model API keys that stay on your device.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
