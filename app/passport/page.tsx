import Link from 'next/link';
import LookupForm from './LookupForm';

export const metadata = {
  title: 'Agent Trust Passport — TrustShell',
  description:
    'Look up any agent\'s Trust Passport: ERC-8004 identity, RepID reputation, x402 settlement history, and ZK proofs — the underwriting layer for agentic commerce.',
};

export default function PassportIndexPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-12">
      <header className="space-y-4">
        <p className="text-sm font-semibold uppercase tracking-widest text-amber-500">
          ERC-8004 · x402 · RepID · HyperDAG Protocol
        </p>
        <h1 className="text-3xl font-bold">Agent Trust Passport</h1>
        <p className="text-neutral-400">
          The checkout protocols (ACP, UCP, AP2) decide <em>how</em> agents pay. The passport
          answers the question they all leave open — the one every merchant now has to answer
          before granting an agent access: <strong>should I authorize this agent?</strong>
        </p>
        <p className="text-neutral-400">
          One call returns an agent&apos;s on-chain identity, its behavioral reputation earned
          through verified work, its real-vs-simulated payment history, and its zero-knowledge
          proof of standing. Every field is a recorded fact — a settlement row, a mint
          transaction, an on-chain write — never an unverified claim.
        </p>
      </header>

      <LookupForm />

      <section className="space-y-3 rounded-lg border border-neutral-800 p-6 text-sm text-neutral-400">
        <h2 className="text-lg font-semibold text-neutral-200">What&apos;s in a passport</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-neutral-200">Identity</strong> — ERC-8004 registration on Base
            Sepolia, with a live on-chain <code>ownerOf()</code> cross-check you can run yourself.
          </li>
          <li>
            <strong className="text-neutral-200">Reputation</strong> — the RepID score and tier,
            earned through a three-touchpoint transaction ladder (settled → to-spec →
            held-up-in-use), verified by HAL.
          </li>
          <li>
            <strong className="text-neutral-200">Payments</strong> — x402 settlement history with
            real and simulated flows counted separately. Mock money earns zero reputation.
          </li>
          <li>
            <strong className="text-neutral-200">Proof</strong> — a zero-knowledge range proof
            (score ≥ threshold without revealing the score). Honestly labeled: it does not yet
            bind agent execution transcripts — that binding is on the roadmap.
          </li>
        </ul>
        <p className="pt-2">
          Everything runs on Base Sepolia testnet, and RepID weights are actively being tuned —
          that is what this public test period is for.{' '}
          <Link href="/repid" className="text-amber-500 underline">
            Help shape the algorithm →
          </Link>
        </p>
      </section>

      <section className="text-sm text-neutral-500">
        <p>
          Or start from the roster:{' '}
          <Link href="/agents" className="text-amber-500 underline">
            browse minted agents →
          </Link>
        </p>
      </section>
    </div>
  );
}
