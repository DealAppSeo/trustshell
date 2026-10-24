import type { Metadata } from 'next';
import { AI_INCIDENTS } from '@/lib/ai-incidents';
import { GatewayInstall } from '@/components/gateway-install';
import { GatewayJoin } from '@/components/gateway-join';
import { JourneySteps } from '@/components/journey-steps';

const DESCRIPTION =
  'AI is useful and not yet trustworthy: real cases, each with its source. How we are building trust in, piece by piece, what runs today and what is still direction, and how to run it on your own machine.';

export const metadata: Metadata = {
  title: 'Trust before autonomy — TrustShell',
  description: DESCRIPTION,
  // A candidate front door, kept out of search until Sean decides whether it replaces the landing page.
  robots: { index: false, follow: true },
  openGraph: { title: 'Trust before autonomy — TrustShell', description: DESCRIPTION, type: 'website' },
};

/**
 * /gateway: a candidate front door (Sean, 2026-10-24). Four jobs, in order: show that today's AI is
 * not yet trustworthy (real cases, lib/ai-incidents.ts), say how we believe trust gets built in, get
 * the visitor to install it locally, and let them join.
 *
 * THE BELIEF IS SEAN'S, THE STATUS LINES ARE THE CODE'S. Each piece pairs the idea with a "Today" line
 * that is true of the shipped package and the live engine, and a "Not yet" line for the rest. The
 * Today lines follow the README after the 2026-10-23 claims audit (#615, #619, #644): the hosted check
 * is two checkers and a second opinion, not proof; reputation that moves with an agent is the aim;
 * Carry is built and not released; x402 buying is key-gated; the Inspect record is digested, not
 * signed. A piece moves from "Not yet" to "Today" when the code does, not when the copy does.
 *
 * The two on-chain receipts are the engine's own hero receipt (GET /api/v1/receipts/hero), both
 * transactions read back from Base Sepolia on 2026-10-24 with status 1: the USDC transfer to the
 * Base Sepolia USDC contract and the write to the ERC-8004 ReputationRegistry 0x8004B663….
 */
const SETTLEMENT_TX = '0x2a7ac151c23983f59564fc3da5c7ea74fdbe390f9e97fcbf70c79be27089967a';
const REPUTATION_TX = '0xd362c1b0c819e2e1ee7bce601531afb0be1eef20c1be4ab8dc643e524d19e917';
const basescan = (tx: string) => `https://sepolia.basescan.org/tx/${tx}`;

const PIECES: ReadonlyArray<{ id: string; name: string; idea: string; today: React.ReactNode; notYet: string }> = [
  {
    id: 'hal',
    name: 'HAL, the Hallucination Assessment Layer',
    idea: 'AIs fact-check each other, so no single model gets the last word.',
    today:
      'Send a sentence and secrets are scrubbed on your device first. Then two AI checkers from different model families read it. Both must agree for Checks out or Caught; anything else is Not checked, never a pass. Two checkers agreeing is a second opinion, not proof.',
    notYet: 'More checkers, each weighted by a reputation it has earned.',
  },
  {
    id: 'repid',
    name: 'RepID, reputation that is earned',
    idea: 'An agent’s standing comes from what it has done, not from what it says about itself.',
    today:
      'Our engine scores agents and writes the score as ERC-8004 feedback on Base Sepolia, where anyone can read it. The scoring code is public. A new agent starts at the bottom tier.',
    notYet: 'Reputation that moves with your agent to other platforms. That is the aim, and it is not a property of this release.',
  },
  {
    id: 'receipts',
    name: 'Receipts: provenance and history',
    idea: 'Your agent’s work is checked and recorded, so it learns and earns trust before it gets autonomy.',
    today: (
      <>
        Inspect checks what an agent said about a GitHub Actions run against GitHub&apos;s own record. Its record is canonical
        JSON with a SHA-256 digest; it is not signed yet. On chain, our own house agents trade with each other: the first
        settlement, on 24 May 2026, moved 0.10 test USDC (
        <a href={basescan(SETTLEMENT_TX)} className="underline underline-offset-4 hover:text-white">
          payment
        </a>
        ), and the reputation write that followed is on Base Sepolia too (
        <a href={basescan(REPUTATION_TX)} className="underline underline-offset-4 hover:text-white">
          ERC-8004 write
        </a>
        ).
      </>
    ),
    notYet: 'Feedback bound to its receipt, its payment, the delivered work and an independent check is not built yet.',
  },
  {
    id: 'x402',
    name: 'x402: agents exchanging value',
    idea: 'As your agent proves it keeps the guardrails you set for your Personal AI, it can trade with other agents, and its value grows.',
    today:
      'The package refuses a payment that has no policy, or is over the cap the policy states, before anything is signed. The calling code supplies the policy, so this stops a mistaken agent, not one that writes its own. Buying from another agent needs an API key and a funded test wallet, so it is paused for anyone without them.',
    notYet: 'Paying only for work that checked out.',
  },
  {
    id: 'testnet',
    name: 'A test network, so nothing real is at risk',
    idea: 'Train and test an agent with no money on the line.',
    today:
      'Everything on chain here runs on Base Sepolia, a test network, not mainnet. Its tokens are free from a public faucet and worth nothing.',
    notYet: 'Mainnet.',
  },
  {
    id: 'yours',
    name: 'Portable, private, yours',
    idea: 'Use any model without vendor lock-in, and keep your privacy and your controls.',
    today:
      'Inspect’s only network call is to api.github.com. The MCP server runs on your machine inside Claude Desktop, Cursor or Claude Code, and the sentence check works on what any model told you. The code is open source, Apache 2.0.',
    notYet: 'Carry, which takes your profile, rules and notes to another machine, is built and not yet released.',
  },
];

const H2 = 'text-2xl sm:text-3xl font-bold text-white text-wrap';
const SECTION = 'px-4 sm:px-6 py-14 border-t border-slate-800';

export default function GatewayPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="px-4 sm:px-6 pt-16 pb-12">
        <div className="mx-auto max-w-3xl min-w-0 space-y-5">
          <p className="text-xs font-mono uppercase tracking-widest text-amber-400">Trust before autonomy</p>
          <h1 className="font-display text-4xl sm:text-5xl font-semibold leading-tight text-wrap">
            AI is useful. It is not yet trustworthy.
          </h1>
          <p className="text-lg text-slate-300">
            It invents policies, cites cases that do not exist, and acts without permission, and it sounds just as sure when
            it is wrong. Below: what that has already cost, each case with its source, then how we believe trust gets built
            in, and how to run it on your own machine today.
          </p>
          <p className="flex flex-wrap gap-3">
            <a href="#install" className="inline-flex min-h-11 items-center rounded-lg bg-amber-600 px-5 py-3 text-sm font-bold text-black hover:bg-amber-500">
              Install it
            </a>
            <a href="#join" className="inline-flex min-h-11 items-center rounded-lg border border-slate-600 px-5 py-3 text-sm font-bold text-white hover:border-amber-500">
              Join us
            </a>
          </p>
        </div>
      </section>

      <section id="record" aria-labelledby="record-heading" className={SECTION}>
        <div className="mx-auto max-w-3xl min-w-0 space-y-6">
          <h2 id="record-heading" className={H2}>
            It has already happened
          </h2>
          <p className="text-slate-300">
            Seven documented cases from 2024 and 2025. Every detail comes from the linked source, and every quote matches it
            word for word. If you find one we got wrong, tell us.
          </p>
          <ol className="space-y-4">
            {AI_INCIDENTS.map((c) => (
              <li key={c.id} data-testid="incident" className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-2 min-w-0">
                <p className="text-xs font-mono uppercase tracking-wider text-slate-400">
                  {c.when} · {c.failure}
                </p>
                <h3 className="text-lg font-semibold text-white">{c.title}</h3>
                <p className="text-sm text-slate-300">{c.what}</p>
                <blockquote className="border-l-2 border-amber-600 pl-3 text-sm italic text-slate-200">“{c.quote}”</blockquote>
                <p className="text-sm text-slate-400 break-words">
                  Source:{' '}
                  <a href={c.source.url} className="underline underline-offset-4 hover:text-white" rel="noopener noreferrer">
                    {c.source.outlet}
                  </a>
                  , {c.source.published}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="how" aria-labelledby="how-heading" className={SECTION}>
        <div className="mx-auto max-w-3xl min-w-0 space-y-6">
          <h2 id="how-heading" className={H2}>
            How we believe trust gets built in
          </h2>
          <p className="text-slate-300">
            We believe a safe and ethical AI people can trust is built, not announced. It should be portable, so you can use
            any model without vendor lock-in, and it should leave you holding your own privacy and controls. We are building
            that trust harness and calling it TrustShell. Here is each piece: the idea, what runs today, and what does not yet.
          </p>
          <ul className="space-y-4">
            {PIECES.map((p) => (
              <li key={p.id} data-testid="piece" className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-3 min-w-0">
                <h3 className="text-lg font-semibold text-white">{p.name}</h3>
                <p className="text-slate-200">{p.idea}</p>
                <p className="text-sm text-slate-300">
                  <span className="mr-2 rounded bg-emerald-900/60 px-2 py-0.5 font-mono text-xs text-emerald-200">Today</span>
                  {p.today}
                </p>
                <p className="text-sm text-slate-400">
                  <span className="mr-2 rounded bg-slate-800 px-2 py-0.5 font-mono text-xs text-slate-300">Not yet</span>
                  {p.notYet}
                </p>
              </li>
            ))}
          </ul>
          <p className="text-slate-300">
            Coming soon: TrustMarket.dev and TrustTrader.dev. Neither is part of TrustShell today.
          </p>
        </div>
      </section>

      <section id="install" aria-labelledby="install-heading" className={SECTION}>
        <div className="mx-auto max-w-3xl min-w-0 space-y-6">
          <h2 id="install-heading" className={H2}>
            Install it and try it on your own machine
          </h2>
          <p className="text-slate-300">
            A browser demo shows you a result. Running it yourself shows you how it gets there: the command line, the npm
            package in your own code, or the MCP server inside the AI app you already use. All three are the free, open-source
            package <span className="font-mono">@hyperdag/trustshell</span>.
          </p>
          <GatewayInstall />
          <div className="space-y-3 pt-4">
            <h3 className="text-lg font-semibold text-white">Then take an agent through the whole ramp</h3>
            <p className="text-sm text-slate-300">
              Create an agent, claim it with two signatures from your own wallet, fund it from a public faucet, back it with a
              deposit, let it trade, and watch its RepID move. No step uses real money: the chain is the Base Sepolia test
              network. TrustShell never sends you tokens; a public faucet does.
            </p>
            <JourneySteps />
          </div>
        </div>
      </section>

      <section id="join" aria-labelledby="join-heading" className={SECTION}>
        <div className="mx-auto max-w-3xl min-w-0 space-y-6">
          <h2 id="join-heading" className={H2}>
            Help us build agents people can depend on
          </h2>
          <p className="text-slate-300">
            We are learning, in the open, how to train agents to be dependable and trustworthy, so that together we can build a
            safe, ethical and benevolent AGI for human flourishing. Leave your email, tell us what would earn your trust, and
            join the conversation.
          </p>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <GatewayJoin />
          </div>
          <ul className="space-y-2 text-sm text-slate-300">
            <li>
              <a href="https://github.com/DealAppSeo/trustshell/issues/new/choose" className="underline underline-offset-4 hover:text-white">
                Start a conversation on GitHub
              </a>
              : ideas, questions, and anything that broke.
            </li>
            <li>
              <a
                href="https://github.com/DealAppSeo/trustshell/issues/new?template=wrong-verdict.yml"
                className="underline underline-offset-4 hover:text-white"
              >
                Report a wrong verdict
              </a>
              : a claim we marked SUPPORTED that we should not have is the bug we most want to hear about.
            </li>
            <li>
              <a href="/build" className="underline underline-offset-4 hover:text-white">
                Build with us
              </a>
              : ERC-8004, x402 and OpenClaw, with what runs today and what is not built yet.
            </li>
          </ul>
        </div>
      </section>
    </main>
  );
}
