import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Connect a model — TrustShell',
  description: 'Create an encrypted vault in your browser for model API keys. A key is sent to our engine only when you test it or run a prompt with it.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
