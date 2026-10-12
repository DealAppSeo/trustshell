import { FaucetPanel } from '@/components/faucet-panel';
import { JourneySteps } from '@/components/journey-steps';
import { PracticeBadge } from '@/components/practice-badge';

export const metadata = {
  title: 'Test tokens — TrustShell',
  description:
    'Free test ETH and test USDC for Base Sepolia come from a public faucet, not from us. This page points at one and reads your balance back.',
};

/**
 * /faucet: where a stranger gets test tokens. The page points and reads; it never dispenses. See
 * components/faucet-panel.tsx. It is the "Fund" stage of the journey, between claiming an agent and
 * staking on the test network.
 */
export default function FaucetPage() {
  return (
    <div className="mx-auto max-w-2xl min-w-0 space-y-8">
      <header className="space-y-2">
        <PracticeBadge />
        <h1 className="text-3xl font-bold">Get free test tokens</h1>
        <p className="leading-relaxed text-[#94a3b8]">
          Staking and spending here use the Base Sepolia test network. Its tokens are free from a public faucet and worth nothing.
        </p>
      </header>

      <JourneySteps current="fund" />

      <FaucetPanel />
    </div>
  );
}
