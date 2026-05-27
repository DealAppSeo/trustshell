import { Key, ShieldCheck, Eye } from 'lucide-react';

const privacyFeatures = [
  {
    icon: Key,
    title: 'Keys stay in your browser',
    description: 'Vault encrypted with AES-GCM, stored in IndexedDB. Passphrase known only to you. We can\'t recover it. We can\'t see it.',
  },
  {
    icon: ShieldCheck,
    title: 'ZKP commitments, not transmissions',
    description: 'Spending parameters, tier attestations, and constitutional bounds committed via Plonky3 STARK proofs (quantum-resistant, BabyBear field, Poseidon2 hash).',
  },
  {
    icon: Eye,
    title: 'Owner-only audit trail',
    description: 'Only the agent\'s owner can decrypt the full decision history. The chain proves integrity; the contents stay private.',
  },
];

export function PrivacyPosture() {
  return (
    <section className="px-4 py-12 md:py-16 border-t border-border">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="max-w-3xl">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
            Privacy is paramount.
          </h2>
          <p className="text-muted leading-relaxed">
            TrustShell is a glass box for the owner — opaque to everyone else. Your agent&apos;s keys live in your browser, never on our servers. Your prompts and answers stay yours. Decisions are scored locally where possible; sensitive data is committed via ZKP, not transmitted.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {privacyFeatures.map((feature) => (
            <div key={feature.title} className="flex gap-3">
              <feature.icon className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-foreground mb-1">{feature.title}</h3>
                <p className="text-sm text-muted leading-relaxed">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
