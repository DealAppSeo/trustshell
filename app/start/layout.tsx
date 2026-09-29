import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Where do you already talk to AI? — TrustShell',
  description: 'Claude, ChatGPT, Grok, Cursor, or a terminal.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
