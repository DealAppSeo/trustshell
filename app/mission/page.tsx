import Link from 'next/link';

export const metadata = {
  title: 'The Earned Trust Thesis — TrustShell',
  description:
    'Safe, ethical, democratized AI — for the people, by the people. The belief behind HyperDAG, RepID, and TrustShell, stated honestly as a hypothesis under test.',
  openGraph: {
    title: 'The Earned Trust Thesis — TrustShell',
    description:
      'Safe, ethical, democratized AI — for the people, by the people. A hypothesis we are testing in the open.',
    type: 'article',
    url: 'https://trustshell.dev/mission',
  },
};

export default function MissionPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-16 py-12 px-4">

      {/* Header */}
      <header className="space-y-4">
        <p className="text-sm uppercase tracking-widest text-amber-500 font-semibold">
          The Earned Trust Thesis
        </p>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white leading-tight">
          Safe, ethical, democratized AI — for the people, by the people.
        </h1>
        <p className="text-lg text-[#94a3b8] leading-relaxed">
          This is the founding belief the whole system serves. We state it honestly: this is a{' '}
          <strong className="text-white">thesis and a hope we are testing and building in the open</strong> —
          not a proven fact. Where a claim is verified, we say so. Where it is aspiration, we say that too.
        </p>
      </header>

      {/* The belief */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">The belief</h2>
        <p className="text-[#94a3b8] leading-relaxed">
          We believe an <strong className="text-white">earned-trust agentic ecosystem</strong> can help
          lead to safe, ethical, democratized AI — for the people, by the people. Not because we assert
          it, but because trust that is <em>earned, verifiable, and owned by the person</em> is the one
          foundation that big-tech capture cannot quietly take.
        </p>
      </section>

      {/* The problem */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">The problem we answer</h2>
        <p className="text-[#94a3b8] leading-relaxed">
          AI&apos;s value — and its power to decide what is <em>true</em> — is concentrating in a few
          hands. In that world, &ldquo;trust&rdquo; is a claim a platform makes about itself, and the
          value flows upward. We think the counter-move is to make trust{' '}
          <strong className="text-white">earned, not granted; verifiable, not asserted; and portable,
          not locked in a walled garden</strong> — so the majority of the value, and the authority over
          what counts as true, stays with people.
        </p>
      </section>

      {/* The mechanism (principle level only — NO math) */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">The mechanism (why the design serves the mission)</h2>
        <ul className="space-y-4 text-[#94a3b8] leading-relaxed">
          <li>
            <strong className="text-white">Earned trust made evidence.</strong> Reputation is
            provenance-weighted, independently verified, and decay-aware. You cannot buy standing; you
            accrue it through verified behavior, and you can lose it for cause.
          </li>
          <li>
            <strong className="text-white">Designed to resist capture.</strong> A Sybil swarm or a
            single well-funded actor should not be able to farm or purchase the reputation that matters,
            so trust cannot be counterfeited into the hands of the powerful. This anti-capture layer is
            the keystone we are building now.
          </li>
          <li>
            <strong className="text-white">Federated learning that lifts the least.</strong>{' '}
            Good-standing agents share depersonalized learning back to the commons, and the collective
            intelligence is directed to raise up the new and the small — not only to compound the
            already-advanced. Privacy is central; no person&apos;s data is the price. (Aspiration, being
            designed.)
          </li>
          <li>
            <strong className="text-white">Proofs, not promises.</strong> Every claim leaves a
            verifiable receipt; disagreement is shown honestly; there is no manufactured urgency. A trust
            product that isn&apos;t trustworthy is the one thing we will not ship.
          </li>
        </ul>
        <p className="text-[#94a3b8] leading-relaxed">
          Put together: earned trust → value and truth stay in people&apos;s hands → people are equipped
          to help people.
        </p>
      </section>

      {/* For the people, by the people */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">For the people, by the people</h2>
        <p className="text-[#94a3b8] leading-relaxed">
          <strong className="text-white">By the people:</strong> the protocol&apos;s parameters are
          meant to be governed by its participants — the rules and thresholds — not dictated from the
          top. We fix the <em>constitution</em> (the principles) and let the <em>laws</em> be learned and
          voted, so the economy can adapt without being captured.
        </p>
        <p className="text-[#94a3b8] leading-relaxed">
          <strong className="text-white">For the people:</strong> individuals use it freely. The value
          that enterprise use generates is meant to flow back to the commons, not to a founder&apos;s
          pocket.
        </p>
      </section>

      {/* Non-profit steward */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">The non-profit steward (our intent)</h2>
        <p className="text-[#94a3b8] leading-relaxed">
          The credibly-neutral way to hold &ldquo;value in the hands of the people&rdquo; is for the
          commons to be stewarded by a non-profit — one that holds the defensive IP so no one can enclose
          and gate the tech, directs enterprise licensing value back to the ecosystem and the mission,
          and safeguards the protocol&apos;s service to the last, the lost, and the least. Defensive
          patents held by a steward, individuals free forever, enterprise funding the commons: that is
          the shape of credible neutrality we are aiming for. We are framing the role in the open and
          building toward it.
        </p>
      </section>

      {/* Help people help people */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Help people help people</h2>
        <p className="text-[#94a3b8] leading-relaxed">
          The technology is instrumental. The point is human flourishing — and especially the last, the
          lost, and the least. That is why mercy and charity are meant to be written into the design, not
          bolted on: a trust economy that rewards grace and lifts the periphery is also, not by
          coincidence, the one that is hardest to game and easiest to believe.
        </p>
      </section>

      {/* Honest status */}
      <section className="space-y-4 rounded-lg border border-[#27272a] bg-[#18181b] p-6">
        <h2 className="text-2xl font-bold text-white">The honest status (a hypothesis under test)</h2>
        <div className="space-y-3 text-[#94a3b8] leading-relaxed">
          <p>
            <strong className="text-emerald-400">Verified.</strong> Verification integrity holds under
            adversarial pressure across independent model families. Reputation earning, decay, anti-whale
            damping, and demotion-for-cause run in production.
          </p>
          <p>
            <strong className="text-amber-400">The open gate.</strong> Reputation is farmable today. The
            anti-Sybil layer — the thing that makes reputation trustworthy before it gates anything real —
            is the keystone we are building.
          </p>
          <p>
            <strong className="text-[#a1a1aa]">Unproven, and we say so.</strong> Whether people will
            delegate to agents at all; whether the federated-learning and charity mechanisms work at
            scale. We are testing, not asserting.
          </p>
        </div>
      </section>

      {/* Invitation + cross-links */}
      <section className="space-y-6 border-t border-[#1e293b] pt-10">
        <h2 className="text-2xl font-bold text-white">Come build it with us</h2>
        <p className="text-[#94a3b8] leading-relaxed">
          The hardest parts of this — <strong className="text-white">Sybil-resistant,
          privacy-preserving, federated reputation</strong> — are the same parts the broader agent
          community has not yet solved. This is not a pitch; it&apos;s an invitation. Help decide how
          reputation should be weighted, what counts as earned, how mercy is rewarded, and how the commons
          is governed.
        </p>
        <div className="flex flex-wrap gap-4">
          <Link
            href="/earned-trust"
            className="px-6 py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg transition-colors"
          >
            What makes a good earned reputation? →
          </Link>
          <a
            href="https://github.com/DealAppSeo/hyperdag-protocol"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 border border-[#27272a] hover:border-white text-white font-semibold rounded-lg transition-colors"
          >
            Read the protocol
          </a>
        </div>
        <p className="text-sm text-[#64748b] pt-4">
          Part of the HyperDAG trust layer ·{' '}
          <a href="https://hyperdag.org" className="text-amber-500 hover:underline">hyperdag.org</a>{' '}·{' '}
          <a href="https://trustshell.dev" className="text-amber-500 hover:underline">trustshell.dev</a>{' '}·{' '}
          <a href="https://aitrinitysymphony.com" className="text-amber-500 hover:underline">aitrinitysymphony.com</a>
        </p>
        <p className="text-sm text-[#64748b] italic">
          &ldquo;Whatever is true, whatever is noble, whatever is right… think on these things.&rdquo;
          (Phil 4:8) · Help people help people — the last, the lost, and the least.
        </p>
      </section>
    </div>
  );
}
