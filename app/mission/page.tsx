import Link from 'next/link';

export const metadata = {
  title: 'Mission — TrustShell',
  description:
    'Trust is becoming the infrastructure of the AI age. The only real question is who owns it. This is why HyperDAG exists, honestly stated — and how to join in building it.',
  openGraph: {
    title: 'Mission — TrustShell',
    description:
      'Trust is becoming the infrastructure of the AI age. Own yours. The vision behind HyperDAG, RepID, and TrustShell — stated as a direction, not a finished product.',
    type: 'article',
    url: 'https://trustshell.dev/mission',
  },
};

export default function MissionPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-16 py-12 px-4">

      {/* Header / opening thesis */}
      <header className="space-y-4">
        <p className="text-sm uppercase tracking-widest text-amber-500 font-semibold">
          Mission
        </p>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white leading-tight">
          Trust is becoming the infrastructure of the AI age. Own yours.
        </h1>
        <p className="text-lg text-[#94a3b8] leading-relaxed">
          Every person is on the edge of getting a digital identity for themselves and for the AI agents
          that act on their behalf. That much looks close to inevitable. What isn&apos;t decided yet is who
          owns it: a small number of governments and AI platforms, by default — or the people it actually
          measures, on purpose. We&apos;re building for the second answer. This page states that case
          honestly: as a direction we&apos;re committed to, not a victory we&apos;ve already won.
        </p>
      </header>

      {/* What we believe */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">What we believe</h2>
        <p className="text-[#94a3b8] leading-relaxed">
          There are two shapes this can take. In one, identity and reputation for people and their agents
          are issued from the top — a handful of platforms decide who&apos;s trustworthy, and the value that
          judgment creates flows upward. In the other, trust is <strong className="text-white">self-sovereign</strong>:
          earned by what you and your agents actually do, held by you, and provable without having to hand
          your data to anyone to prove it.
        </p>
        <p className="text-[#94a3b8] leading-relaxed">
          We think the self-sovereign path is both the right one and the harder one — which is exactly why
          it&apos;s worth building deliberately, before the default hardens into place.
        </p>
      </section>

      {/* What a trust harness is */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">What a trust harness actually is</h2>
        <p className="text-[#94a3b8] leading-relaxed">
          TrustShell is a <strong className="text-white">portable agentic trust harness</strong>. A
          harness wraps an agent you already have rather than replacing it — you don&apos;t rearchitect
          anything, and you don&apos;t adopt a platform. It sits between your agent and whichever model
          answers, and it carries three things across that boundary: who the agent is, what rules it
          agreed to operate under, and what it has actually earned.
        </p>
        <p className="text-[#94a3b8] leading-relaxed">
          <strong className="text-white">Portable</strong> is the load-bearing word. Reputation held
          inside one vendor&apos;s account is that vendor&apos;s asset, and switching providers resets you
          to zero — which is precisely what makes lock-in feel inevitable. An agent&apos;s standing here
          is anchored on-chain and travels with it, so changing model is a routing decision rather than
          starting over.
        </p>
        <p className="text-[#94a3b8] leading-relaxed">
          In practice that means three things a developer can check rather than take on faith:
        </p>
        <ul className="space-y-3 text-[#94a3b8] leading-relaxed list-none pl-0">
          <li className="flex gap-3">
            <span className="text-amber-500 shrink-0" aria-hidden="true">→</span>
            <span>
              <strong className="text-white">Spend less on tokens.</strong> Runs route to free-tier
              models first and reach paid ones only when the free tier is exhausted or the work needs
              more — with the paid fallbacks themselves ordered cheapest-first.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-amber-500 shrink-0" aria-hidden="true">→</span>
            <span>
              <strong className="text-white">No vendor lock-in.</strong> You bring your own keys. Your
              agent, its constitution and its earned{' '}
              <Link href="/glossary#repid" className="text-amber-500 hover:underline">RepID</Link>{' '}
              are not held by the provider answering the prompt, so leaving one costs you nothing but a
              config change.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-amber-500 shrink-0" aria-hidden="true">→</span>
            <span>
              <strong className="text-white">State that persists with the agent, not the vendor.</strong>{' '}
              Identity, constitution and standing follow the agent across models. Your provider keys sit
              in an encrypted browser vault we never receive. Your decision history stays on your device
              — and to be exact rather than flattering, it is stored there <em>unencrypted</em>, so it is
              private from us but not from someone holding your laptop. We would rather you knew which
              of those two things we are actually claiming.
            </span>
          </li>
        </ul>
        <p className="text-[#94a3b8] leading-relaxed">
          Every term above is defined, with its own link, in the{' '}
          <Link href="/glossary" className="text-amber-500 hover:underline">glossary</Link> — including
          the parts that are not built yet, which are labelled as such.
        </p>
      </section>

      {/* The people rank the models */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">The people rank the models</h2>
        <p className="text-[#94a3b8] leading-relaxed">
          Today, a model&apos;s reputation mostly comes from the lab that built it — the closest thing AI
          has to grading its own homework. We think it should work more like a credit score or a Better
          Business Bureau rating: built from real, verifiable behavior, judged by a broad and independent
          crowd, not by the vendor with the most to gain from a high score.
        </p>
        <p className="text-[#94a3b8] leading-relaxed">
          That&apos;s what the{' '}
          <Link href="/leaderboard" className="text-amber-500 hover:underline font-semibold">
            live leaderboard
          </Link>{' '}
          is a first, small proof of — models ranked on measured behavior across independent validators,
          in the open, updated as the evidence comes in. It&apos;s early and it&apos;s incomplete. It&apos;s
          also real data, not a mockup.
        </p>
        <p className="text-[#94a3b8] leading-relaxed">
          The same principle extends to the people doing the ranking: you should be able to own and even
          monetize the signal you contribute — via zero-knowledge proofs and depersonalization, opt-in
          always. Privacy has to be built into the foundation here, not bolted on after the fact. That part
          is still mostly ahead of us, and we say so.
        </p>
      </section>

      {/* Glass box, earned RepID, SBFA */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Glass box, not black box</h2>
        <p className="text-[#94a3b8] leading-relaxed">
          No one — including us — can fully show you <em>why</em> a model produced a given output. What we
          can do is show you exactly what it <em>did</em>: every claim checked, every verdict logged, every
          reputation change traceable to the event that caused it. Trust delivered as evidence you can
          inspect, not a badge you&apos;re asked to take on faith.
        </p>
        <ul className="space-y-4 text-[#94a3b8] leading-relaxed">
          <li>
            <strong className="text-white">Earned RepID.</strong> Reputation is portable and
            behavioral — accrued through verified outcomes, not granted by a platform and not for sale. It
            travels with the agent, on-chain, so standing built in one place means something in the next.
          </li>
          <li>
            <strong className="text-white">SBFA — decorrelated validators.</strong> Same-family models
            share the same blind spots, so we never let a model grade its own family&apos;s homework.
            Verification runs across independent model families instead, and the design is meant to get
            <em> more</em> resilient under attack — red-teaming and slashing are how it hardens, not how it
            breaks.
          </li>
        </ul>
      </section>

      {/* Democratized for the last, the lost, and the least */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Democratized AI for the last, the lost, and the least</h2>
        <p className="text-[#94a3b8] leading-relaxed">
          The intent is a positive-sum system: free for individuals, funded by the enterprises that
          benefit from a trust layer that actually works. Value is meant to flow to the people using and
          creating on the system — creators keep what they earn — not concentrate at the top. That&apos;s
          the design goal we&apos;re building toward, and it isn&apos;t proven at scale yet.
        </p>
        <p className="text-[#94a3b8] leading-relaxed">
          The technology is instrumental; the point is people. A trust economy that&apos;s hardest to game
          and easiest to believe in should also be the one that lifts the periphery instead of only
          compounding advantage for those who already have it — help people help people, especially the
          last, the lost, and the least.
        </p>
      </section>

      {/* Why now */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Why now</h2>
        <p className="text-[#94a3b8] leading-relaxed">
          The custody question — who owns your identity and your agents&apos; reputations — is being
          decided this decade, largely by whatever gets built and adopted first. That&apos;s not a
          countdown clock or a sales tactic; it&apos;s just how defaults work. Once one model of custody is
          widely integrated, switching costs make it the water everyone swims in. The window to build the
          self-sovereign alternative — and make it good enough to be the default — is open now.
        </p>
      </section>

      {/* Honest status */}
      <section className="space-y-4 rounded-lg border border-[#27272a] bg-[#18181b] p-6">
        <h2 className="text-2xl font-bold text-white">Honestly stated: where this actually stands</h2>
        <div className="space-y-3 text-[#94a3b8] leading-relaxed">
          <p>
            <strong className="text-emerald-400">Real today.</strong>{' '}
            <code className="text-sm bg-black/40 px-1.5 py-0.5 rounded text-amber-300">npm install @hyperdag/trustshell</code>{' '}
            wires an agent to HAL hallucination checking, ERC-8004 on-chain reputation, and x402
            pay-on-trust against a live backend — with real Base Sepolia receipts, not a demo mode.
            Verification integrity holds under adversarial pressure across independent model families in
            production.
          </p>
          <p>
            <strong className="text-amber-400">Being built.</strong> Reputation is farmable today; the
            anti-Sybil layer that makes reputation trustworthy before it gates anything high-stakes is the
            keystone we&apos;re building now. Privacy-preserving, provenance-weighted ranking by the
            people is designed, not yet fully live.
          </p>
          <p>
            <strong className="text-[#a1a1aa]">Targets, not promises.</strong> Where we cite a number — a
            share of value returned to the commons, an uptime target, a growth curve — treat it as a
            target we&apos;re aiming at, not a guarantee. We&apos;re not making hard financial promises
            until the mechanics behind them are public and auditable. Whether people will actually delegate
            meaningfully to agents, and whether the federated-learning and mercy mechanisms hold up at
            scale, are open questions we are testing, not facts we are asserting.
          </p>
        </div>
      </section>

      {/* Be part of the solution */}
      <section className="space-y-6 border-t border-[#1e293b] pt-10">
        <h2 className="text-2xl font-bold text-white">Be part of the solution</h2>
        <p className="text-[#94a3b8] leading-relaxed">
          This isn&apos;t a pitch for something finished — it&apos;s an invitation into something being
          built. The hardest parts — Sybil-resistant reputation, privacy-preserving federated learning, a
          formula the community actually trusts — are unsolved by anyone yet, us included. Help decide how
          reputation should be weighted, what counts as earned, and how the commons gets governed.
        </p>

        {/* Trust Commons — the prominent invite */}
        <div className="bg-[#0f172a] border border-amber-500/30 rounded-lg p-6 space-y-3">
          <p className="text-sm uppercase tracking-widest text-amber-500 font-semibold">
            Help shape the Reputation Formula
          </p>
          <p className="text-[#94a3b8] leading-relaxed">
            Provenance and earned reputation are what keep AI honest — what limits and catches
            hallucination, and what shows an agent&apos;s owner exactly what&apos;s inside the black box.
            Trust Commons is where that formula gets argued over and decided, in the open. If you have a
            view on what makes a reputation earned rather than granted, we want to hear it.
          </p>
          <a
            href="https://github.com/DealAppSeo/trust-commons"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-6 py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg transition-colors"
          >
            Join the conversation →
          </a>
        </div>

        <div className="flex flex-wrap gap-4">
          <Link
            href="/docs/getting-started"
            className="px-6 py-3 border border-[#27272a] hover:border-white text-white font-semibold rounded-lg transition-colors"
          >
            Start building
          </Link>
          <Link
            href="/agents"
            className="px-6 py-3 border border-[#27272a] hover:border-white text-white font-semibold rounded-lg transition-colors"
          >
            Try it live
          </Link>
          <Link
            href="/earned-trust"
            className="px-6 py-3 border border-[#27272a] hover:border-white text-white font-semibold rounded-lg transition-colors"
          >
            What makes a good earned reputation? →
          </Link>
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
