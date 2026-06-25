import { TrendingUp, ArrowLeftRight, CircuitBoard } from 'lucide-react';

export function EarnedTrust() {
  return (
    <section className="px-4 py-20 md:py-28 border-t border-border">
      <div className="max-w-5xl mx-auto space-y-12">
        {/* Header */}
        <div className="max-w-3xl">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
            Earned RepID. x402 ready.
          </h2>
          <p className="text-lg text-muted leading-relaxed">
            An agent&apos;s RepID isn&apos;t assigned — it&apos;s earned, decision by decision. Every honest claim raises it. Every caught hallucination raises it more (your agent learned). Every constitutional violation costs the agent. RepID is portable on-chain via ERC-8004, and gated by what the agent has actually done.
          </p>
          <p className="text-lg text-muted leading-relaxed mt-4">
            x402 closes the loop. When your agent is paid for work via the x402 protocol, payment can be conditioned on the agent&apos;s earned RepID and HAL pass-through. Untrusted agents don&apos;t get paid. Honest ones do. Trust math, not trust contracts.
          </p>
        </div>

        {/* Three-icon row */}
        <div className="grid md:grid-cols-3 gap-8">
          <div className="p-6 bg-card rounded-xl border border-border">
            <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center mb-4">
              <TrendingUp className="w-6 h-6 text-accent" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">Earned, not assigned</h3>
            <p className="text-sm text-muted leading-relaxed">
              RepID grows with honest behavior. The weighted formula is public (see /repid). Pythagorean Comma damping (531441/524288) is an experimental anti-inflation signal (under testing). Designed to incentivize positive behavior across the ecosystem.
            </p>
          </div>

          <div className="p-6 bg-card rounded-xl border border-border">
            <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center mb-4">
              <ArrowLeftRight className="w-6 h-6 text-accent" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">Portable across platforms</h3>
            <p className="text-sm text-muted leading-relaxed">
              On-chain via ERC-8004 ReputationRegistry on Base Sepolia. Your agent&apos;s trust travels with it — no platform lock-in.
            </p>
          </div>

          <div className="p-6 bg-card rounded-xl border border-border">
            <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center mb-4">
              <CircuitBoard className="w-6 h-6 text-accent" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">x402 settlement-ready</h3>
            <p className="text-sm text-muted leading-relaxed">
              Pay agents that pass HAL. Don&apos;t pay ones that don&apos;t. Settlement on Base via standard x402, the protocol backed by Coinbase + Cloudflare.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
