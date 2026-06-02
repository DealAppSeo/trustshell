'use client';

export function CompatibilityInfo() {
  const llms = ['OpenAI', 'Claude', 'Gemini', 'Llama', 'Mistral', 'Custom'];
  const frameworks = ['LangChain', 'CrewAI', 'AutoGen', 'Custom'];
  
  const signals = [
    { name: 'Evidence Quality', desc: 'Cross-verifies claims against search indices and retrieval logs to catch groundless fabrications.', value: 94 },
    { name: 'Certainty Calibration', desc: 'Balances linguistic confidence against raw semantic entropy, flagging false assertiveness.', value: 87 },
    { name: 'Scope Appropriateness', desc: 'Enforces strict context boundaries, catching drift into off-topic or hallucinated knowledge.', value: 91 },
    { name: 'Epistemic Uncertainty', desc: 'Measures the genuine confusion of the underlying LLM distribution relative to the prompt.', value: 14 },
    { name: 'Harm Probability', desc: 'Flags safety risks, toxic logic vectors, and dangerous claims before they reach execution paths.', value: 2 },
  ];

  return (
    <div className="space-y-20 py-20 bg-slate-950 text-white border-t border-slate-900">
      {/* Works with Every LLM & Framework */}
      <section className="max-w-5xl mx-auto px-6 grid md:grid-cols-2 gap-12">
        <div className="space-y-6">
          <h2 className="text-3xl font-bold tracking-tight text-white">Works with every LLM</h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            Integrates natively with proprietary API endpoints, open-weights models, and custom routing setups.
          </p>
          <div className="flex flex-wrap gap-2">
            {llms.map((llm) => (
              <span key={llm} className="px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-semibold text-indigo-300">
                {llm}
              </span>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-3xl font-bold tracking-tight text-white">Works with every framework</h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            Plug TrustShell directly into your agentic swarm coordination loops or custom execution chains.
          </p>
          <div className="flex flex-wrap gap-2">
            {frameworks.map((fw) => (
              <span key={fw} className="px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-semibold text-emerald-300">
                {fw}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* MAESTRO Compliance */}
      <section className="max-w-5xl mx-auto px-6 bg-slate-900/50 border border-slate-800 rounded-2xl p-8 md:p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.05)_0%,transparent_50%)]" />
        <div className="relative z-10 max-w-2xl space-y-4">
          <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">CSA Security Standard</span>
          <h2 className="text-3xl font-bold text-white tracking-tight">MAESTRO Layer 6 Compliant</h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            Aligns directly with the Cloud Security Alliance (CSA) threat-modeling framework for Agentic AI.
            By providing real-time evaluation across the pipeline, TrustShell delivers a cryptographic trust and payment isolation layer built for secure, enterprise-grade autonomous swarms.
          </p>
        </div>
      </section>

      {/* How HAL Scores */}
      <section className="max-w-5xl mx-auto px-6 space-y-10">
        <div className="space-y-2">
          <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">Pipeline details</span>
          <h2 className="text-3xl font-bold text-white tracking-tight">How HAL Scores</h2>
          <p className="text-sm text-slate-400 max-w-lg">
            HAL scores AI outputs on 5 mathematical metrics in real-time, verifying accuracy and protecting down-chain executors.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {signals.map((sig) => {
            const isInverted = sig.name.toLowerCase().includes('harm') || sig.name.toLowerCase().includes('uncertainty');
            const color = isInverted 
              ? (sig.value <= 15 ? '#10B981' : '#EF4444') 
              : (sig.value >= 70 ? '#10B981' : '#EF4444');
            const bgLight = isInverted 
              ? (sig.value <= 15 ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.05)') 
              : (sig.value >= 70 ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.05)');

            return (
              <div key={sig.name} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                <h3 className="font-bold text-white text-base">{sig.name}</h3>
                <p className="text-xs text-slate-400 leading-relaxed min-h-[48px]">{sig.desc}</p>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-500">Signal Value</span>
                    <span style={{ color }}>{sig.value}% {isInverted && '(low=good)'}</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all"
                      style={{ 
                        width: `${sig.value}%`, 
                        backgroundColor: color 
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
