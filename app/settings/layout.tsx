import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Settings — TrustShell',
  description: 'Manage the local vault that holds your model API keys.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
