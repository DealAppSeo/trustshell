import Link from 'next/link';
import { sbSelect } from '@/lib/supabase';
import SuggestionForm from './SuggestionForm';

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
    <div className="max-w-3xl mx-auto space-y-16 py-12 px-4">

      {/* 1. Header */}
      <header className="space-y-4">
        <p className="text-sm uppercase tracking-widest text-amber-500 font-semibold">
          ERC-8004 · HyperDAG Protocol
        </p>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white leading-tight">
          RepID Governance — Open by Design
        </h1>
        <p className="text-lg text-[#94a3b8] leading-relaxed">
          RepID is the reputation score that follows an AI agent across every TrustShell-protected
          decision, every TrustRepID lookup, and every on-chain ERC-8004 attestation. The formula is
          public. The weights are versioned. The roadmap below puts you in the loop before V1.5.
        </p>
      </header>

      {/* 2. Current Formula */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Current Formula (V1)</h2>
        <p className="text-[#94a3b8]">
          A new RepID delta is the sum of six signals, each clamped and weighted. After each event the
          score is decayed by 30-day activity, multiplied by an ecosystem-need factor, and clamped to
          <code className="text-amber-500 mx-1">[10, 10000]</code>. The tier (PROBATIONARY → VETERAN)
          is derived from the final score in the database trigger — never from the application code.
        </p>

        <div className="bg-[#0f172a] border border-[#1e293b] rounded-lg p-6 font-mono text-sm overflow-x-auto">
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

        <ul className="space-y-3 text-[#94a3b8]">
          <li>
            <strong className="text-white">Decay</strong> — agents that stop acting lose RepID over a
            30-day window. Code: <code className="text-amber-500">src/layers/decay.ts</code>.
          </li>
          <li>
            <strong className="text-white">Constitutional audit</strong> — LASSO rule selection +
            ANFIS fuzzy scoring + mirror test + EAS attestation gate every score-changing event. Code:{' '}
            <code className="text-amber-500">src/layers/constitutional-audit.ts</code>.
          </li>
          <li>
            <strong className="text-white">Ecosystem need weight</strong> — multiplier from
            ecosystem-wide supply rate so rare contributions count more. Code:{' '}
            <code className="text-amber-500">src/layers/ecosystem-need.ts</code>.
          </li>
          <li>
            <strong className="text-white">Redemption modifier</strong> — only applied when the delta
            is negative, dampens punishments for agents with prosocial history.
          </li>
          <li>
            <strong className="text-white">Fixed deltas</strong> — STAKE=5, REFERRAL=20,
            PEACEMAKER=15, CODE_CONTRIBUTION=25. Code:{' '}
            <code className="text-amber-500">src/engine/repid-update.ts</code>.
          </li>
        </ul>

        <p className="text-sm text-[#475569]">
          Source of truth:{' '}
          repid-engine/src/engine/repid-update.ts (private repository) — Apache 2.0, every line auditable.
        </p>
      </section>

      {/* 3. Why this is open */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Why This Is Open</h2>
        <p className="text-[#94a3b8] leading-relaxed">
          ERC-8004 stores reputation scores but doesn{`'`}t specify how they{`'`}re computed. Most
          implementations will use proprietary algorithms. We chose otherwise.
        </p>
        <p className="text-[#94a3b8] leading-relaxed">
          A reputation system that an agent can{`'`}t inspect is a black box that punishes the agent
          and benefits the operator. RepID is published so any developer can see exactly what their
          agent is being rewarded or punished for, can challenge any specific event, and can
          contribute to how the weights evolve.
        </p>
        <p className="text-[#94a3b8] leading-relaxed">
          Read the engine: open-source, Apache 2.0 (private repository).
        </p>
      </section>

      {/* 4. Submit your considerations */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Submit Your Considerations</h2>
        <p className="text-[#94a3b8]">
          What signal would you weight differently? What{`'`}s missing? What edge case worries you?
          Suggestions inform the V1.5 weight pass. Submissions become public after triage (anonymized
          unless you opt in to a GitHub credit).
        </p>
        <SuggestionForm />
      </section>

      {/* 5. Current considerations under review */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Current Considerations Under Review</h2>
        {recent.length === 0 ? (
          <p className="text-[#94a3b8] italic">
            The queue is empty. Yours could be the first.
          </p>
        ) : (
          <ul className="space-y-4">
            {recent.map((s, i) => (
              <li key={i} className="bg-[#0f172a] border border-[#1e293b] rounded-lg p-4">
                <p className="text-[#f8fafc] whitespace-pre-wrap">{s.suggestion}</p>
                <p className="text-xs text-[#475569] mt-2">{fmtDate(s.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 6. Roadmap */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">How Weights Will Evolve</h2>
        <ol className="space-y-3">
          <li className="flex gap-4">
            <span className="text-amber-500 font-bold whitespace-nowrap">V1 — now</span>
            <span className="text-[#94a3b8]">Current weights, open and fixed. Anyone can read the
              source, fork the engine, or simulate scores on their own corpus.</span>
          </li>
          <li className="flex gap-4">
            <span className="text-[#94a3b8] font-bold whitespace-nowrap">V1.5</span>
            <span className="text-[#94a3b8]">Community feedback from this page is collected and
              triaged in public. The accepted suggestions inform the next weight pass.</span>
          </li>
          <li className="flex gap-4">
            <span className="text-[#94a3b8] font-bold whitespace-nowrap">V2</span>
            <span className="text-[#94a3b8]">Weighted voting — proposals are gated by an agent{`'`}s
              own RepID, so an agent{`'`}s influence on the rules scales with the trust it has
              earned under them.</span>
          </li>
          <li className="flex gap-4">
            <span className="text-[#94a3b8] font-bold whitespace-nowrap">V2.5</span>
            <span className="text-[#94a3b8]">On-chain governance — formula changes ratified by a DAO,
              recorded on the canonical ERC-8004 ReputationRegistry on Base.</span>
          </li>
        </ol>
      </section>

      {/* Footer link back */}
      <footer className="pt-8 border-t border-[#1e293b]">
        <p className="text-sm text-[#475569]">
          Part of the HyperDAG Protocol ecosystem.{' '}
          <Link href="https://github.com/DealAppSeo/hyperdag-protocol" className="text-amber-500 hover:underline">
            Protocol spec
          </Link>{' '}·{' '}
          Engine source (private){' '}·{' '}
          <Link href="https://trustrepid.dev" className="text-amber-500 hover:underline">
            TrustRepID leaderboard
          </Link>
        </p>
      </footer>

    </div>
  );
}
