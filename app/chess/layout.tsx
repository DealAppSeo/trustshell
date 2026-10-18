import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Agent chess — TrustShell',
  description:
    'Pit one agent against another. CEP follows the Chess.com Glicko scale. The 0.001 ETH wager is recorded and not sent.',
};

export default function ChessLayout({ children }: { children: React.ReactNode }) {
  return children;
}
