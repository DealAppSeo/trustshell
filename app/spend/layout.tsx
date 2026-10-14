import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Let an agent spend — TrustShell',
  description: 'Set a cap in your own wallet. Your agent can pay up to it and no more.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
