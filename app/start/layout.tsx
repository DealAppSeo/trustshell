import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Where do you already talk to AI? — TrustShell',
  description: 'Claude, Cursor, a chat site, a terminal or just this website. Then a fresh agent or your own, and one short plan.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
