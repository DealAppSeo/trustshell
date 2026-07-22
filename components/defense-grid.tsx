import {
  ShieldOff,
  MessageSquareWarning,
  AlertCircle,
  EyeOff,
  Fingerprint,
  Scale,
  GitBranch,
  AlertOctagon,
} from 'lucide-react';

// Aligned with the industry-recognized taxonomy of agentic-AI risk
// (WEF / Akerman / Token Security / broader AI-safety community). Copy is
// Sean-approved verbatim per the Round-15 spec — no rewriting. Order matches
// the spec.
const defenses = [
  {
    icon: ShieldOff,
    name: 'Excessive permissions & unauthorized actions',
    description:
      "Agents inherit broad system access. HAL scores every decision's scope_appropriateness before execution. Out-of-bounds actions trigger peer verification.",
  },
  {
    icon: MessageSquareWarning,
    name: 'Prompt injection & manipulation',
    description:
      'Cross-LLM peer verification on uncertain decisions. No single model can be tricked alone — two or three independent verifiers must agree before low-certainty claims proceed.',
  },
  {
    icon: AlertCircle,
    name: 'Hallucinations at scale',
    description:
      '5-signal HAL extractor catches low-certainty, weak-evidence claims. Sub-0.85 certainty queues automatic peer verification. Catch the hallucination before it becomes a database write or a customer email.',
  },
  {
    icon: EyeOff,
    name: 'Data exfiltration',
    description:
      "ZKP commitments via Plonky3 (quantum-resistant). Sensitive parameters are committed, not transmitted. Keys are stored in encrypted IndexedDB and sent only with a paid run — in memory, per-request. Owner-only audit trail.",
  },
  {
    icon: Fingerprint,
    name: 'Identity spoofing & unproven agents',
    description:
      'ERC-8004 IdentityRegistry on Base Sepolia. Every agent has a cryptographic identity. Portable across platforms.',
  },
  {
    icon: Scale,
    name: 'Reputation manipulation',
    description:
      "RepID earned through real decisions, not assigned. Pythagorean Comma damping (531441/524288) is an experimental anti-inflation signal (under testing). On-chain. Auditable. Can't be bought.",
  },
  {
    icon: GitBranch,
    name: 'Constitutional drift',
    description:
      "Multi-turn agreement detection. Agents can't be gradually talked into harmful actions over conversation history. Drift is logged in real-time.",
  },
  {
    icon: AlertOctagon,
    name: 'Orphaned agents & error propagation',
    description:
      'Stalled task reaper catches agents that should have stopped. Heartbeat monitoring. Self-modification attempts queue human approval via Telegram (V1.5).',
  },
];

export function DefenseGrid() {
  return (
    <section className="px-4 py-20 md:py-28 border-t border-border">
      <div className="max-w-5xl mx-auto space-y-10">
        <div className="space-y-6">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground">
            What TrustShell defends against.
          </h2>
          <p className="text-muted max-w-3xl leading-relaxed">
            Independent research from the World Economic Forum, Akerman, Token
            Security, and the broader AI safety community has converged on a
            clear taxonomy of agentic AI risk. TrustShell + HAL + RepID are
            designed against this surface — not as policy, but as math you can
            audit.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {defenses.map((defense) => (
            <div
              key={defense.name}
              className="relative p-5 bg-card rounded-xl border border-border"
            >
              <defense.icon className="absolute top-5 right-5 w-5 h-5 text-muted" />
              <div className="pr-8">
                <h3 className="font-semibold text-foreground mb-2 leading-snug">
                  {defense.name}
                </h3>
                <p className="text-sm text-muted leading-relaxed">
                  {defense.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
