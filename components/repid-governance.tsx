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
  × 531441/524288  (Pythagorean Comma damping*)`}</code>
        </pre>

        <p className="text-xs text-muted leading-relaxed max-w-2xl">
          * The Pythagorean Comma damping term (531441/524288) is <strong>experimental — under
          falsification testing</strong>. It is promising on synthetic data but not yet validated
          on real data with independent lineage, and is not a proven production mechanism. The
          weighted signals above are the load-bearing part of the formula.
        </p>

        {/* The formula above is abstract, and the obvious next question — "so what is any one
            action actually worth to me?" — had no answer anywhere on this page. /preview answers
            it off the live tariff, with no account, and nothing linked to it. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
          <a
            href="/preview"
            className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
          >
            <span>&rarr;</span> See what each action is worth
          </a>
          <a
            href="/repid"
            className="inline-flex items-center gap-1 text-muted hover:text-accent transition-colors"
          >
            <span>&rarr;</span> Read more &amp; contribute at trustshell.dev/repid
          </a>
        </div>
      </div>
    </section>
  );
}
