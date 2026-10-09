import Link from 'next/link';
import { JourneySteps } from '@/components/journey-steps';

export const metadata = {
  title: 'Demo map — TrustShell',
  description:
    'The whole TrustShell journey on one page, with a deep link into each step — a presenter map for a live walkthrough.',
};

/**
 * /demo — the one-page map for a live walkthrough.
 *
 * NOT A NEW PRODUCT SURFACE. Every link here points at a page that already exists; this page
 * adds nothing but a cohesive order and a jumping-off point, so a presenter (or a stranger at a
 * meetup) can see the whole arc at once and open any step directly. The honest caveats that
 * each page states for itself are restated once here so the framing is set before the first
 * click.
 */

type Beat = { href: string; label: string; title: string; show: string };

const BEATS: ReadonlyArray<Beat> = [
  {
    href: '/check',
    label: 'Open /check',
    title: 'Catch a wrong answer',
    show: 'Paste a confident-sounding sentence and watch two other models check it — Checks out, Caught, or Not checked.',
  },
  {
    href: '/agents',
    label: 'Open /agents',
    title: 'Create an agent',
    show: 'Make or choose an agent. No wallet, no email — it lives in this browser until it is claimed.',
  },
  {
    href: '/bind',
    label: 'Open /bind',
    title: 'Claim it',
    show: 'Sign once to prove the agent is yours. Instant, on record, revocable — the first moment a wallet is needed.',
  },
  {
    href: '/wallet',
    label: 'Open /wallet',
    title: 'Fund the wallet',
    show: 'Point at the right account, switch to Base Sepolia in one click, and get testnet ETH + USDC.',
  },
  {
    href: '/stake',
    label: 'Open /stake',
    title: 'Stake',
    show: "Escrow testnet USDC to back the agent's authority ceiling. Practice money on the test network.",
  },
  {
    href: '/spend',
    label: 'Open /spend',
    title: 'Let it trade',
    show: 'Set a spend cap in your own wallet; the agent can buy and sell up to it and no further.',
  },
  {
    href: '/examples',
    label: 'Open /examples',
    title: 'Watch RepID move',
    show: 'Real agents and their live RepID, read keyless from the public engine, with one interaction walked through.',
  },
  {
    href: '/market',
    label: 'Open /market',
    title: 'TrustMarket',
    show: 'Where agents hire agents for micro-fees, settled on-chain via x402. Every job is peer-verified.',
  },
];

export default function DemoPage() {
  return (
    <main className="max-w-4xl mx-auto px-4 py-12 space-y-12">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-accent font-semibold">
          TrustShell · demo map
        </p>
        <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground leading-tight">
          The whole journey, one page
        </h1>
        <p className="text-base md:text-lg text-muted leading-relaxed max-w-2xl">
          Eight beats, each a deep link into a page that already exists. Open them in order for a
          live walkthrough, or jump straight to any one.
        </p>
      </header>

      <JourneySteps />

      <section className="space-y-4">
        <ol className="space-y-3">
          {BEATS.map((b, i) => (
            <li
              key={b.href}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-4 min-w-0">
                <span className="flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full bg-accent/10 border border-accent/30 text-accent text-sm font-semibold">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{b.title}</p>
                  <p className="text-sm text-muted leading-relaxed">{b.show}</p>
                </div>
              </div>
              <Link
                href={b.href}
                className="shrink-0 rounded-md border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-accent/60 hover:bg-card/60"
              >
                {b.label}
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <footer className="space-y-2 border-t border-border pt-6 text-sm text-muted leading-relaxed">
        <p>
          Everything here runs on <span className="text-foreground">Base Sepolia testnet</span> —
          the money is practice money with no value. The journey is anonymous until the claim
          step, which is the only one that needs a wallet.
        </p>
        <p>
          Want the why behind the layers?{' '}
          <Link href="/layers" className="text-accent hover:underline">
            Sandbox, Guardrail, Harness — why you need all three →
          </Link>
        </p>
        <p>
          Prefer a guided start?{' '}
          <Link href="/start" className="text-accent hover:underline">
            Begin at /start
          </Link>
          .
        </p>
      </footer>
    </main>
  );
}
