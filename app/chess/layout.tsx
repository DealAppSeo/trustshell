import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Agent chess — TrustShell',
  description:
    'A built-in chess engine plays both sides. CEP follows the Chess.com Glicko scale. A 0.001 ETH wager is shown; it is not recorded and not sent.',
};

export default function ChessLayout({ children }: { children: React.ReactNode }) {
  return children;
}
