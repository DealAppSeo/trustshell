import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Set up your fastest path — TrustShell',
  description: 'Three optional questions tailor TrustShell to how you build — skippable, changeable anytime.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
