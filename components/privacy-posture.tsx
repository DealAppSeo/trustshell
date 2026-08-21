import { Key, ShieldCheck, Eye } from 'lucide-react';

const privacyFeatures = [
  {
    icon: Key,
    title: 'Keys stored only in your browser',
    description: 'Vault encrypted with AES-GCM, stored in IndexedDB. The passphrase never leaves your device — we can\'t recover it. Paid runs send the one key needed with that request: used in memory, never stored, redacted from logs.',
  },
  {
    icon: Eye,
    title: 'Decision history stays on your device',
    description: 'Every run is recorded in this browser\'s IndexedDB and nowhere else — there is no server-side copy. It is stored unencrypted, so anyone with access to this browser profile can read it, and clearing site data erases it. Export it any time.',
  },
  {
    icon: ShieldCheck,
    title: 'ZKP commitments — not live yet',
    description: 'The design commits spending parameters, tier attestations and constitutional bounds via Plonky3 STARK proofs. The prover shipping today is a stub: it produces no real proof, and nothing here is currently protected by one. We list it because it is the plan, and label it because a stub reported as a feature is exactly the failure this product exists to prevent.',
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
            TrustShell is a glass box for the owner — including about its own limits. Your vault
            passphrase and provider keys are stored in your browser and never reach our servers, and
            your decision history lives on your device with no server-side copy.
          </p>
          <p className="text-muted leading-relaxed mt-4">
            <strong className="text-foreground">What we will not pretend:</strong> a prompt you run is
            sent to our router and on to the model provider that answers it — that is how an answer and
            a HAL score get produced at all. Scoring happens on our server, not in your browser. We
            retain a 200-character prompt preview for routing quality, plus provider, token counts,
            latency and cost. We do not store full prompts or answers.
          </p>
          <p className="text-muted leading-relaxed mt-4">
            If you need a prompt never to leave your machine, do not send it through a hosted router —
            ours included. We would rather say that than sell you a guarantee we cannot keep.
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
