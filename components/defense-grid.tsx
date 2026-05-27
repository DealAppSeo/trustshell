import { AlertCircle, GitBranch, BadgeCheck, Unlock, Coins, ShieldAlert } from 'lucide-react';

const defenses = [
  {
    icon: AlertCircle,
    name: 'Hallucination',
    description: '5-signal HAL extractor. Sub-0.85 certainty triggers peer verification. Real-time scoring on every agent decision.',
  },
  {
    icon: GitBranch,
    name: 'Constitutional drift',
    description: 'Multi-turn agreement detection. Agents can\'t be gradually talked into harmful actions over conversation history.',
  },
  {
    icon: BadgeCheck,
    name: 'Unproven identity',
    description: 'ERC-8004 IdentityRegistry registration. Cryptographic agent binding on Base Sepolia. Identity portable across platforms.',
  },
  {
    icon: Unlock,
    name: 'Reputation lock-in',
    description: 'Portable RepID via ERC-8004 ReputationRegistry. Your agent\'s earned trust isn\'t trapped on one platform.',
  },
  {
    icon: Coins,
    name: 'Unverified payment',
    description: 'x402 settlement gating via TrustShell\'s evaluate-before-pay pattern. Agents earn payment by passing HAL. Trust math, not trust contracts.',
    badge: 'x402 ready',
  },
  {
    icon: ShieldAlert,
    name: 'Self-modification attempts',
    description: 'Coming in 1-2 weeks. Telegram notification the moment your agent tries to elevate permissions or modify its own constitution.',
    badge: 'V1.5',
    muted: true,
  },
];

export function DefenseGrid() {
  return (
    <section className="px-4 py-20 md:py-28 border-t border-border">
      <div className="max-w-5xl mx-auto space-y-12">
        <h2 className="text-3xl md:text-4xl font-bold text-foreground">
          What TrustShell defends against.
        </h2>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {defenses.map((defense) => (
            <div
              key={defense.name}
              className={`relative p-5 bg-card rounded-xl border border-border ${defense.muted ? 'opacity-85' : ''}`}
            >
              <defense.icon className="absolute top-5 right-5 w-5 h-5 text-muted" />
              <div className="pr-8">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-semibold text-foreground">{defense.name}</h3>
                  {defense.badge && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
                      {defense.badge}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted leading-relaxed">{defense.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
