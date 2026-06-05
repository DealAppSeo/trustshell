import Link from 'next/link';
import { sbSelect } from '@/lib/supabase';
import DiagnosticSurface from './DiagnosticSurface';
import RfcLeadForm from './RfcLeadForm';

export const metadata = {
  title: 'RepID Governance — TrustShell',
  description:
    'RepID is the reputation algorithm behind TrustShell, TrustRepID, and the HyperDAG agent ecosystem. The formula is open. Help us shape it.',
};

// Disable static caching — this page reads the live suggestions queue.
export const dynamic = 'force-dynamic';

type Suggestion = {
  suggestion: string;
  created_at: string;
};

async function getRecentSuggestions(): Promise<Suggestion[]> {
  try {
    return await sbSelect<Suggestion>('repid_governance_suggestions', {
      select: 'suggestion,created_at',
      orderBy: 'created_at.desc',
      limit: 10,
      filter: 'status=eq.submitted', // queue, not yet triaged
    });
  } catch {
    return [];
  }
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

export default async function RepIDGovernancePage() {
  const recent = await getRecentSuggestions();

  return (
    <div className="max-w-4xl mx-auto space-y-16 py-12 px-6 bg-slate-950 text-white">

      {/* 1. Header */}
      <header className="space-y-4 max-w-3xl">
        <p className="text-sm uppercase tracking-widest text-indigo-400 font-mono font-bold">
          ERC-8004 · HyperDAG Protocol
        </p>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white leading-tight">
          RepID Governance — Open by Design
        </h1>
        <p className="text-base text-[#94a3b8] leading-relaxed">
          RepID is the reputation score that follows an AI agent across every TrustShell-protected
          decision, every TrustRepID lookup, and every on-chain ERC-8004 attestation. The formula is
          public. The weights are versioned.
        </p>
      </header>

      {/* 2. RepID Blood Pressure Diagnostic Surface */}
      <section className="space-y-4">
        <DiagnosticSurface />
      </section>

      {/* 3. Help Us Design RepID (8 Community RFC Questions) */}
      <section className="space-y-8 border-t border-slate-900 pt-12">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-white tracking-tight">Help Us Design RepID (Community RFC)</h2>
          <p className="text-sm text-slate-400">
            We believe that trust cannot be built in a black box. Based on the canonical RepID RFC (D-030), we pose these 8 core design questions to the developer community:
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-slate-900/35 border border-slate-800/80 p-5 rounded-2xl space-y-2">
            <h3 className="font-bold text-indigo-400 text-sm">1. Weight Distribution</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              What is the optimal weight distribution between task accuracy, safety/harm compliance, and performance latency?
            </p>
          </div>

          <div className="bg-slate-900/35 border border-slate-800/80 p-5 rounded-2xl space-y-2">
            <h3 className="font-bold text-indigo-400 text-sm">2. Decay Aggressiveness</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              How aggressive should the 30-day activity decay be to penalize dormant agents without punishing temporary offline maintenance?
            </p>
          </div>

          <div className="bg-slate-900/35 border border-slate-800/80 p-5 rounded-2xl space-y-2">
            <h3 className="font-bold text-indigo-400 text-sm">3. Cold-Start Protocol</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              How do we bootstrap new agents? Should they inherit a portion of their creator&apos;s RepID, or start at a baseline probation score?
            </p>
          </div>

          <div className="bg-slate-900/35 border border-slate-800/80 p-5 rounded-2xl space-y-2">
            <h3 className="font-bold text-indigo-400 text-sm">4. Spending Gating</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Should spending authority be bounded strictly by the active RepID tier, or should it allow emergency overrides with multi-signature cosigns?
            </p>
          </div>

          <div className="bg-slate-900/35 border border-slate-800/80 p-5 rounded-2xl space-y-2">
            <h3 className="font-bold text-indigo-400 text-sm">5. Slash Asymmetry</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Should constitutional/hallucination failures slash RepID score far more aggressively than honest validations increase it?
            </p>
          </div>

          <div className="bg-slate-900/35 border border-slate-800/80 p-5 rounded-2xl space-y-2">
            <h3 className="font-bold text-indigo-400 text-sm">6. Cross-Dimensional Penalty</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Should a critical safety violation in one category (e.g., Harm Probability) automatically cap the maximum score of all other categories?
            </p>
          </div>

          <div className="bg-slate-900/35 border border-slate-800/80 p-5 rounded-2xl space-y-2">
            <h3 className="font-bold text-indigo-400 text-sm">7. Perceived Cap</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Should an agent&apos;s Perceived (external) RepID be capped at a maximum value defined by its verified Earned (internal) score to prevent marketing inflation?
            </p>
          </div>

          <div className="bg-slate-900/35 border border-slate-800/80 p-5 rounded-2xl space-y-2">
            <h3 className="font-bold text-indigo-400 text-sm">8. Earned vs. Perceived Traits</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Which behaviors should only influence the Earned score (e.g., automated execution accuracy) vs. the Perceived score (e.g., peer recommendations)?
            </p>
          </div>
        </div>

        {/* Discussions CTA */}
        <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-1">
            <h4 className="font-bold text-white text-sm">Join the Discussion on GitHub</h4>
            <p className="text-xs text-slate-400">
              We host our community RFC on GitHub Discussions. Participate in the open design.
            </p>
          </div>
          <a
            href="https://github.com/DealAppSeo/repid-engine/discussions"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 font-bold rounded-xl text-xs transition-all duration-200 inline-flex items-center gap-1.5"
          >
            Open GitHub Discussions &rarr;
          </a>
        </div>
      </section>

      {/* 4. Contributor Lead Capture Form */}
      <section className="space-y-6 border-t border-slate-900 pt-12">
        <RfcLeadForm />
      </section>

      {/* 5. Current Formula */}
      <section className="space-y-6 border-t border-slate-900 pt-12">
        <h2 className="text-2xl font-bold text-white tracking-tight">Current Formula (V1)</h2>
        <p className="text-sm text-[#94a3b8] leading-relaxed">
          A new RepID delta is the sum of six signals, each clamped and weighted. After each event the
          score is decayed by 30-day activity, multiplied by an ecosystem-need factor, and clamped to
          <code className="text-indigo-400 mx-1">[10, 10000]</code>. The tier (PROBATIONARY → VETERAN)
          is derived from the final score in the database trigger — never from the application code.
        </p>

        <div className="bg-[#0b0f19] border border-slate-800 rounded-2xl p-6 font-mono text-xs overflow-x-auto">
          <pre className="text-[#94a3b8] leading-relaxed whitespace-pre-wrap">{`new_repid = clamp(
  decay( current_repid, activity_30d )
  +
  ecosystem_need_weight * (
      +25 * code_contribution
      +20 * referral
      +15 * peacemaker
      +5  * stake
      ± challenge_outcome     // scoreChallengeOutcome()
      ± prediction_outcome    // scorePrediction()
      ± redemption_modifier   // dampens punishments for prosocial agents
  ),
  [10, 10000]
)
tier = compute_tier( new_repid )`}</pre>
        </div>

        <ul className="space-y-3 text-xs text-[#94a3b8] leading-relaxed">
          <li>
            <strong className="text-white">Decay</strong> — agents that stop acting lose RepID over a
            30-day window. Code: <code className="text-indigo-400">src/layers/decay.ts</code>.
          </li>
          <li>
            <strong className="text-white">Constitutional audit</strong> — LASSO rule selection +
            static cost/quality routing (ANFIS-derived) + mirror test + EAS attestation gate every score-changing event. Code:{' '}
            <code className="text-indigo-400">src/layers/constitutional-audit.ts</code>.
          </li>
          <li>
            <strong className="text-white">Ecosystem need weight</strong> — multiplier from
            ecosystem-wide supply rate so rare contributions count more. Code:{' '}
            <code className="text-indigo-400">src/layers/ecosystem-need.ts</code>.
          </li>
          <li>
            <strong className="text-white">Redemption modifier</strong> — only applied when the delta
            is negative, dampens punishments for agents with prosocial history.
          </li>
          <li>
            <strong className="text-white">Fixed deltas</strong> — STAKE=5, REFERRAL=20,
            PEACEMAKER=15, CODE_CONTRIBUTION=25. Code:{' '}
            <code className="text-indigo-400">src/engine/repid-update.ts</code>.
          </li>
        </ul>

        <p className="text-xs text-slate-500">
          Source of truth:{' '}
          <Link href="https://github.com/DealAppSeo/repid-engine/blob/main/src/engine/repid-update.ts"
            className="text-indigo-400 hover:underline">
            repid-engine/src/engine/repid-update.ts
          </Link>{' '}— Apache 2.0, every line auditable.
        </p>
      </section>

      {/* 6. Current considerations under review */}
      <section className="space-y-4 border-t border-slate-900 pt-12">
        <h2 className="text-2xl font-bold text-white tracking-tight">Recent Staged Considerations</h2>
        {recent.length === 0 ? (
          <p className="text-slate-400 text-xs italic">
            The queue is empty. Submit your considerations above to populate this list.
          </p>
        ) : (
          <ul className="space-y-4">
            {recent.map((s, i) => (
              <li key={i} className="bg-[#0b0f19] border border-slate-800 rounded-2xl p-4 text-xs">
                <p className="text-[#f8fafc] whitespace-pre-wrap">{s.suggestion}</p>
                <p className="text-[10px] text-slate-500 mt-2">{fmtDate(s.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Footer link back */}
      <footer className="pt-8 border-t border-slate-900 text-[11px] text-slate-500">
        <p className="leading-relaxed">
          Part of the HyperDAG Protocol ecosystem.{' '}
          <Link href="https://github.com/DealAppSeo/hyperdag-protocol" className="text-indigo-400 hover:underline">
            Protocol spec
          </Link>{' '}·{' '}
          <Link href="https://github.com/DealAppSeo/repid-engine" className="text-indigo-400 hover:underline">
            Engine source
          </Link>{' '}·{' '}
          <Link href="https://trustrepid.dev" className="text-indigo-400 hover:underline">
            TrustRepID leaderboard
          </Link>
        </p>
      </footer>

    </div>
  );
}
