import { OG_IMAGE } from '@/lib/site';
import Link from 'next/link';

export const metadata = {
  title: 'What Makes a Good Earned Reputation? — TrustShell',
  description:
    'Open the conversation. We are defining earned trust for AI agents in public, as open questions — not settled answers. Come help decide what counts as earned.',
  openGraph: {
    title: 'What Makes a Good Earned Reputation? — TrustShell',
    description:
      'Sybil-resistant, privacy-preserving, federated reputation is the shared unsolved problem. Come build it with us.',
    images: OG_IMAGE,
    type: 'article',
    url: 'https://trustshell.dev/earned-trust',
  },
};

type OpenQuestion = {
  principle: string;
  question: string;
  detail: string;
};

const QUESTIONS: OpenQuestion[] = [
  {
    principle: 'Earned, not granted',
    question: 'What must an agent actually do before we trust it — and how much should any single good act count?',
    detail:
      'Standing should be accrued through verified behavior, never bought or assigned. But where is the line between a fair on-ramp for newcomers and a system that can be farmed?',
  },
  {
    principle: 'Provenance',
    question: 'How do we weigh who verified an outcome, and under what conditions?',
    detail:
      'A claim checked by independent parties should count for more than one an agent makes about itself. What makes provenance strong enough to rely on?',
  },
  {
    principle: 'Independent verification',
    question: 'How many independent checkers — and how different must they be — before a verdict is trustworthy?',
    detail:
      'Diversity of who checks matters as much as how many. What counts as genuinely independent, versus the illusion of independence?',
  },
  {
    principle: 'Decay',
    question: 'How fast should reputation fade without fresh, verified activity?',
    detail:
      'Trust earned long ago is not the same as trust today. Too slow and it goes stale; too fast and it punishes the steady. Where is the honest rate?',
  },
  {
    principle: 'Mercy & charity',
    question: 'How should a system forgive — and reward those who lift others?',
    detail:
      'We believe grace and generosity belong in the design, not bolted on. How do you reward peacemaking and second chances without opening the door to abuse?',
  },
  {
    principle: 'Anti-gaming & counterparty diversity',
    question: 'How do we stop a swarm, a whale, or a colluding ring from manufacturing reputation?',
    detail:
      'This is the keystone. Reputation earned only among a tight cluster should count for less than reputation earned across many independent counterparties. What is the right signal for that?',
  },
  {
    principle: 'Honesty',
    question: 'How do we show disagreement plainly and refuse manufactured urgency?',
    detail:
      'A trust product that hides its own uncertainty is not trustworthy. When checkers disagree, users should see it. What does honest disclosure look like in practice?',
  },
  {
    principle: 'Human always in control',
    question: 'Where must a human stay in the loop, with a real override?',
    detail:
      'AI serves people, never the reverse. Which decisions demand human oversight, audit trails, and an emergency stop that actually works?',
  },
  {
    principle: 'Privacy-central',
    question: 'How do we prove trust without exposing the person behind the agent?',
    detail:
      'No one’s private data should be the price of participation. What can be proven with cryptography rather than surveillance?',
  },
  {
    principle: 'Federated learning that lifts the least',
    question: 'How does shared learning raise up the new and the small — not only the already-advanced?',
    detail:
      'If good-standing agents contribute depersonalized learning to the commons, how do we direct that intelligence toward the periphery, on purpose?',
  },
];

export default function EarnedTrustPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-16 py-12 px-4">

      {/* Header */}
      <header className="space-y-4">
        <p className="text-sm uppercase tracking-widest text-amber-500 font-semibold">
          Open the conversation
        </p>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white leading-tight">
          What makes a good earned reputation?
        </h1>
        <p className="text-lg text-[#94a3b8] leading-relaxed">
          We do not think anyone has the final answer yet — including us. So we are defining earned trust
          for AI agents <strong className="text-white">in public, as open questions</strong>. Below are
          the principles we hold, each turned into a question we want the community to help answer. A
          living thing you can shape beats a whitepaper you can only read.
        </p>
      </header>

      {/* Open questions */}
      <section className="space-y-6">
        {QUESTIONS.map((q, i) => (
          <div
            key={q.principle}
            className="rounded-lg border border-[#27272a] bg-[#18181b] p-6 space-y-2"
          >
            <div className="flex items-baseline gap-3">
              <span className="text-amber-500 font-mono text-sm">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="text-lg font-bold text-white">{q.principle}</h3>
            </div>
            <p className="text-white/90 font-medium leading-relaxed">{q.question}</p>
            <p className="text-[#94a3b8] text-sm leading-relaxed">{q.detail}</p>
          </div>
        ))}
      </section>

      {/* The shared unsolved problem + invitation */}
      <section className="space-y-6 border-t border-[#1e293b] pt-10">
        <h2 className="text-2xl font-bold text-white">The shared unsolved problem</h2>
        <p className="text-[#94a3b8] leading-relaxed">
          <strong className="text-white">Sybil-resistant, privacy-preserving, federated
          reputation</strong> is the hard part — and it is exactly what the ERC-8004, x402, and OpenClaw
          communities have not yet solved either. We would rather solve it together than each guess alone.
          Help decide how reputation should be weighted, what counts as earned, how mercy is rewarded, and
          how the commons is governed.
        </p>
        <div className="flex flex-wrap gap-4">
          <a
            href="https://github.com/DealAppSeo/trust-commons/discussions"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg transition-colors"
          >
            Join the discussion →
          </a>
          <Link
            href="/repid"
            className="px-6 py-3 border border-[#27272a] hover:border-white text-white font-semibold rounded-lg transition-colors"
          >
            Shape the RepID roadmap
          </Link>
          <Link
            href="/mission"
            className="px-6 py-3 border border-[#27272a] hover:border-white text-white font-semibold rounded-lg transition-colors"
          >
            Read the mission
          </Link>
        </div>
        <p className="text-sm text-[#64748b] pt-4">
          Part of the HyperDAG trust layer ·{' '}
          <a href="https://hyperdag.org" className="text-amber-500 hover:underline">hyperdag.org</a>{' '}·{' '}
          <a href="https://trustshell.dev" className="text-amber-500 hover:underline">trustshell.dev</a>{' '}·{' '}
          <a href="https://aitrinitysymphony.com" className="text-amber-500 hover:underline">aitrinitysymphony.com</a>
        </p>
        <p className="text-sm text-[#64748b] italic">
          &ldquo;Do unto others.&rdquo; (Matt 7:12) · Help people help people — the last, the lost, and
          the least.
        </p>
      </section>
    </div>
  );
}
