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
          RepID governance — open by design
        </h1>
        <p className="text-lg text-[#94a3b8] leading-relaxed">
          RepID is our engine&apos;s score for an AI agent. It is designed to be{' '}
          <strong className="text-white">portable</strong>,{' '}
          <strong className="text-white">weighted</strong> and{' '}
          <strong className="text-white">earned</strong>. Each word is a commitment we can be held to,
          and here is what each does today:
        </p>
        <ul className="space-y-3 text-[#94a3b8] leading-relaxed list-none pl-0">
          <li className="flex gap-3">
            <span className="text-amber-500 shrink-0" aria-hidden="true">→</span>
            <span>
              <strong className="text-white">Portable</strong> — the score is computed and held by the
              TrustShell engine. The engine writes the agent&apos;s identity token and feedback entries to{' '}
              <Link href="/glossary#erc-8004" className="text-amber-500 hover:underline">ERC-8004</Link>{' '}
              registries on Base Sepolia testnet, where anyone can read them.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-amber-500 shrink-0" aria-hidden="true">→</span>
            <span>
              <strong className="text-white">Weighted</strong> — not every event counts the same. Substance
              moves the score and activity does not; a{' '}
              <Link href="/glossary#purpose-gate" className="text-amber-500 hover:underline">purpose gate</Link>{' '}
              is meant to zero the reward for a pleasant answer that delivered nothing; today it is
              measured in shadow and not yet enforced. The fixed deltas are public; the tuned weights
              are not.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-amber-500 shrink-0" aria-hidden="true">→</span>
            <span>
              <strong className="text-white">Earned</strong> — score changes are events the engine
              records. Self-reported event types earn 0 without an evidence reference, but the reference
              is not yet verified. The{' '}
              <Link href="/glossary#tier" className="text-amber-500 hover:underline">tier</Link>{' '}
              is derived by the database from the score and the agent&apos;s unique counterparties
              (a trigger on every write overwrites any tier the engine sets), not set by hand.
            </span>
          </li>
        </ul>
        <p className="text-lg text-[#94a3b8] leading-relaxed">
          The shape of the formula and the fixed deltas are public. The tuned constants are not. The
          roadmap below puts you in the loop before V1.5.
        </p>
        <p className="text-sm text-[#64748b] leading-relaxed">
          Still unsolved, and stated rather than glossed:{' '}
          <Link href="/glossary#sybil" className="text-amber-500 hover:underline">Sybil resistance</Link>{' '}
          — stopping one actor from manufacturing many identities to vote up its own reputation. Every
          portable-reputation design shares that problem. We would rather recruit help on it than imply
          it is handled.
        </p>
        <p className="text-sm text-[#64748b] leading-relaxed">
          This page is the open reference for <span className="text-[#94a3b8]">how RepID is earned</span> — the
          shape of the formula your agents are scored by; its tuned constants are private. Nothing to configure
          here: read it, or suggest a change below.
        </p>
      </header>

      {/* 2. Current Formula */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Current formula (V1)</h2>
        <p className="text-[#94a3b8]">
          Each event type has its own delta. After an event the score is decayed by 30-day activity, the delta is
          added, and the result is clamped to
          <code className="text-amber-500 mx-1">[10, 10000]</code>. The tier (PROBATIONARY → VETERAN)
          is derived by the database on every write, from the score and the agent&apos;s unique
          counterparties; a trigger overwrites any tier the engine itself writes (the engine&apos;s own{' '}
          <code className="text-amber-500">computeTier</code> is a score-only ladder, so it does not decide).
        </p>

        <div className="bg-[#0f172a] border border-[#1e293b] rounded-lg p-6 font-mono text-sm overflow-x-auto">
          <pre className="text-[#94a3b8] leading-relaxed whitespace-pre-wrap">{`new_repid = clamp(
  decay( current_repid, activity_30d ) + delta,
  [10, 10000]
)

delta, by event type (one per event, not a sum):
  fixed deltas     code_contribution +25   referral +20
                   peacemaker +15          stake: 5 on the tariff, 0 applied
  challenge        ± challenge_outcome     // scoreChallengeOutcome(); the
                                           // ecosystem-need weight scales
                                           // this one and nothing else
  prediction       0 since 2026-10-19      // a Brier score is computed
                                           // in shadow only

a NEGATIVE delta is then multiplied by redemption_modifier
(dampens punishment for prosocial agents)

tier = compute_tier( new_repid, agent )   // database trigger; also demotes on counterparty count`}</pre>
        </div>
        <p className="text-sm text-[#64748b]">
          Checked against the engine source on 2026-10-12. This page used to show the ecosystem-need weight multiplying the
          whole delta and the constitutional audit gating every event. Neither is what runs, and the list below says what does.
          The shadow-mode gates that can hold a delta back (deception events, unproven self-reports, grounding) are real and are
          not drawn here.
        </p>

        <ul className="space-y-3 text-[#94a3b8]">
          <li>
            <strong className="text-white">Decay</strong> — agents that stop acting lose RepID over a
            30-day window. Code: <code className="text-amber-500">src/layers/decay.ts</code>.
          </li>
          <li>
            <strong className="text-white">Constitutional audit</strong> — built, and <strong className="text-white">switched
            off by default</strong>. Its output does not change any score today: when it is off, the audit row records
            &quot;not measured&quot;, never a score. Code:{' '}
            <code className="text-amber-500">src/layers/constitutional-audit.ts</code>.
          </li>
          <li>
            <strong className="text-white">Ecosystem need weight</strong> — a multiplier from the ecosystem-wide
            supply rate, so rare contributions count more. It scales a challenge win or loss, within bounds. It is recorded on
            every event&apos;s audit row, but it does not multiply the fixed deltas or a prediction. Code:{' '}
            <code className="text-amber-500">src/layers/ecosystem-need.ts</code>.
          </li>
          <li>
            <strong className="text-white">Redemption modifier</strong> — only applied when the delta
            is negative, dampens punishments for agents with prosocial history.
          </li>
          <li>
            <strong className="text-white">Fixed deltas</strong> — STAKE is 5 on the tariff and 0 when
            applied: no on-chain verifier. REFERRAL=20, PEACEMAKER=15, CODE_CONTRIBUTION=25. Code:{' '}
            <code className="text-amber-500">src/engine/repid-update.ts</code>.
          </li>
        </ul>

        <div className="rounded-lg border border-amber-500/30 bg-[#0f172a] p-5 space-y-2" data-testid="repid-settle">
          <h3 className="text-lg font-bold text-white">What a vote can and cannot settle</h3>
          <p className="text-[#94a3b8] leading-relaxed">
            A receipt calls a result <strong className="text-white">PROVISIONAL</strong> when only a vote backs it, and a
            two-to-one vote is still a vote. It is called <strong className="text-white">SETTLED</strong> only when a holdout, a
            known answer or a person settled it. A provisional result is a second opinion, not a settled fact.
          </p>
          <p className="text-[#94a3b8] leading-relaxed">
            A check made on this site writes nothing to any score. RepID has two separate fields, the score and the
            ERC-8004 ID, and neither proves the other.
          </p>
        </div>

        <p className="text-sm text-[#475569]">
          Source of truth:{' '}
          <Link href="https://github.com/DealAppSeo/repid-engine/blob/main/src/engine/repid-update.ts"
            className="text-amber-500 hover:underline">
            repid-engine/src/engine/repid-update.ts
          </Link>{' '}— Apache 2.0. The scoring code is public; its tuned constants are supplied by the environment.
        </p>
      </section>

      {/* 3. Why this is open */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Why this is open</h2>
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
          Read the engine: open-source, Apache 2.0,{' '}
          <Link href="https://github.com/DealAppSeo/repid-engine" className="text-amber-500 hover:underline">
            github.com/DealAppSeo/repid-engine
          </Link>.
        </p>
      </section>

      {/* 3.5. Trust Commons invitation */}
      <section className="bg-[#0f172a] border border-amber-500/30 rounded-lg p-6 space-y-3">
        <p className="text-sm uppercase tracking-widest text-amber-500 font-semibold">
          Come join the conversation
        </p>
        <p className="text-[#94a3b8] leading-relaxed">
          Provenance and earned reputation are how we keep AI honest — they{`'`}re what limits and
          catches hallucinations, and what reveals to an agent{`'`}s owner or custodian exactly what{`'`}s
          inside the black box. If you have a view on what makes a good reputation formula, we want to
          hear it.
        </p>
        <p className="text-[#94a3b8] leading-relaxed">
          <Link
            href="https://github.com/DealAppSeo/trust-commons"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-500 hover:underline font-semibold"
          >
            Join the conversation at Trust Commons →
          </Link>
        </p>
      </section>

      {/* 4. Submit your considerations */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Submit your considerations</h2>
        <p className="text-[#94a3b8]">
          What signal would you weight differently? What{`'`}s missing? What edge case worries you?
          Suggestions inform the V1.5 weight pass. Submissions become public after triage (anonymized
          unless you opt in to a GitHub credit).
        </p>
        <SuggestionForm />
      </section>

      {/* 5. Current considerations under review */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Current considerations under review</h2>
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
        <h2 className="text-2xl font-bold text-white">How weights will evolve</h2>
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
          <Link href="https://github.com/DealAppSeo/repid-engine" className="text-amber-500 hover:underline">
            Engine source
          </Link>{' '}·{' '}
          <Link href="https://trustrepid.dev" className="text-amber-500 hover:underline">
            TrustRepID leaderboard
          </Link>
        </p>
      </footer>

    </div>
  );
}
