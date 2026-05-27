import Image from 'next/image';
import { Layers, Users, Lock } from 'lucide-react';

export function GlassBox() {
  return (
    <section className="px-4 py-20 md:py-28">
      <div className="max-w-5xl mx-auto space-y-12">
        {/* Header */}
        <div className="max-w-3xl">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
            Black box, meet glass box.
          </h2>
          <p className="text-lg text-muted leading-relaxed">
            AI agents make decisions you can&apos;t see. Why they said yes, what they considered, where they got it wrong — all hidden inside the model. TrustShell makes the box transparent to its owner. Every decision scored. Every claim verified. Every modification logged. Your agent&apos;s internals, visible only to you.
          </p>
        </div>

        {/* Visual */}
        <div className="relative w-full aspect-[16/9] md:aspect-[2/1] rounded-xl overflow-hidden bg-[#0a0a0a]">
          <Image
            id="glass-box-visual"
            src="/glass-box.png"
            alt="Black Box to Glass Box transformation - showing an opaque black cube with a question mark transforming into a transparent glass cube revealing internal HAL stack layers, flowcharts, and hexagonal patterns. This represents TrustShell making AI decision-making transparent to its owner."
            fill
            className="object-contain"
            priority
          />
        </div>

        {/* Bullet rows */}
        <div className="grid md:grid-cols-3 gap-8">
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-card flex items-center justify-center">
              <Layers className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-1">HAL signals visible</h3>
              <p className="text-sm text-muted leading-relaxed">
                Every agent claim scored on 5 dimensions: harm, epistemic uncertainty, evidence quality, scope, certainty. Read the math, not just the verdict.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-card flex items-center justify-center">
              <Users className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-1">Peer verification on uncertainty</h3>
              <p className="text-sm text-muted leading-relaxed">
                Low-confidence decisions automatically queue for cross-LLM verification. The audit chain is queryable: 31 entries pending right now.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-card flex items-center justify-center">
              <Lock className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-1">Owner-only transparency</h3>
              <p className="text-sm text-muted leading-relaxed">
                Glass box for the owner. Opaque to everyone else. Powered by ZKP commitments and Plonky3 STARK proofs (quantum-resistant). Privacy is paramount.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
