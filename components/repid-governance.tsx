export function RepidGovernance() {
  return (
    <section className="px-4 py-12 md:py-16 border-t border-border">
      <div className="max-w-5xl mx-auto space-y-6">
        <h2 className="text-2xl md:text-3xl font-bold text-foreground">
          RepID is earned. Help us shape what &quot;earned&quot; means.
        </h2>
        <p className="text-muted leading-relaxed max-w-3xl">
          Reputation in TrustShell isn&apos;t assigned — it&apos;s earned, decision by decision, via a weighted formula combining HAL signals. The current weights are public. The weights of tomorrow should be decided together. We want your input on what should count, what should weight more, what&apos;s missing — to incentivize positive behavior to the ecosystem and to the people agents serve.
        </p>

        <pre className="p-4 bg-[#1a1a1a] rounded-lg overflow-x-auto text-sm max-w-2xl">
          <code className="font-mono text-zinc-300 whitespace-pre">{`RepID_delta = 
    0.40 × (1 − harm_probability)
  + 0.30 × (1 − epistemic_uncertainty)  
  + 0.20 × evidence_quality
  + 0.10 × scope_appropriateness
  × 531441/524288  (Pythagorean Comma damping)`}</code>
        </pre>

        <a
          href="/repid"
          className="inline-flex items-center gap-1 text-muted hover:text-accent transition-colors"
        >
          <span>&rarr;</span> Read more &amp; contribute at trustshell.dev/repid
        </a>
      </div>
    </section>
  );
}
