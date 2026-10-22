/*
 * DIRECTION CONTRACT (impeccable, surface inside the established trustshell.dev world)
 * THESIS: a builders' page that reads like a session log. Every claim is something you can run
 *   or open, and what is not built prints its absence; it refuses the feature-card grid.
 * OWN-WORLD: the site's own: slate-950 ground, Plex Serif headings, amber primary action, and the
 *   receipt card's verdict badges (teal measured, dashed grey not checked) on real transcripts.
 * STORY: an ERC-8004, x402 or OpenClaw builder sees the real output first, finds their question,
 *   learns what is measured and what is not built, and tries Inspect or picks something to break.
 * FIRST VIEWPORT: headline left with Try Inspect; the challenge transcript right, CONTRADICTED
 *   visible without scrolling at 1280 px; on phones the transcript follows the action.
 * FORM: session log, dealt 6 of 7 (lead), seed key c9e9c8ab, chosen by Sean 2026-10-22.
 * FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the
 *   verdict, DESIGN.md, and every shipping raster carrying its provenance.
 *
 * Copy rules: every factual sentence maps to evidence (see the PR body); developer preview, never
 * "launched"; nothing unbuilt is described as working.
 */
import type { ReactNode } from 'react';
import { TrustBadge } from '@/components/trust-state';

export const metadata = {
  title: 'Build with us — TrustShell',
  description:
    'For builders on ERC-8004, x402 and OpenClaw: what runs today, what is not built yet, and how to help test it. Developer preview.',
};

type Tone = 'cmd' | 'out' | 'dim' | 'measured' | 'failed' | 'absent';

const TONE: Record<Tone, string> = {
  cmd: 'text-white',
  out: 'text-slate-300',
  dim: 'text-slate-400',
  measured: 'text-[#5eead4]',
  failed: 'text-[#fda4af]',
  absent: 'text-[#a8b3c2]',
};

/** One status, readable: the site's verdict badge (word + icon + colour) and its explanation at body size. */
function Status({ state, children }: { state: "MEASURED" | "NOT_CHECKED"; children: ReactNode }) {
  return (
    <li className="flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:gap-3">
      <TrustBadge state={state} className="shrink-0" />
      <span className="text-base leading-relaxed text-slate-300">{children}</span>
    </li>
  );
}

/** A transcript or data block: real output only, so mono is the material, not a costume. Wraps on
 * phones so the deciding line is never cut off; a script keeps its lines (wrap=false). */
function Session({ label, lines, caption, wrap = true }: { label: string; lines: [Tone, string][]; caption: ReactNode; wrap?: boolean }) {
  return (
    <figure className="min-w-0">
      <pre
        tabIndex={0}
        aria-label={label}
        className="overflow-x-auto rounded-lg border border-slate-800 bg-[#0b1220] px-4 py-4 font-mono text-[13px] leading-6 shadow-[0_12px_32px_-16px_rgba(0,0,0,0.8)]"
      >
        {lines.map(([tone, text], i) => (
          <span key={i} className={`block ${wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"} ${TONE[tone]}`}>
            {text || ' '}
          </span>
        ))}
      </pre>
      <figcaption className="mt-3 text-sm leading-relaxed text-slate-400">{caption}</figcaption>
    </figure>
  );
}

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="text-amber-400 underline underline-offset-4 hover:text-amber-300">
      {children}
    </a>
  );
}

const CHALLENGE: [Tone, string][] = [
  ['dim', '# claims.txt: what the agent said'],
  ['out', 'The check workflow succeeded, run 39619591025.'],
  ['out', 'The check workflow succeeded on commit 5d1c5e3f57e1, run 39619591025.'],
  ['dim', ''],
  ['cmd', '$ RUN=https://github.com/DealAppSeo/trustshell/actions/runs/39619591025'],
  ['cmd', '$ npx trustshell check "$RUN" --claims-file claims.txt'],
  ['dim', ''],
  ['out', 'Claims: 3 supported · 1 contradicted · 1 not checked'],
  ['failed', 'CONTRADICTED  commit 5d1c5e3f57e1'],
  ['dim', '  cites 5d1c5e3f57e1; the run is on 392797a69b6a'],
  ['measured', 'SUPPORTED     The check workflow succeeded'],
  ['measured', 'SUPPORTED     run 39619591025'],
  ['dim', ''],
  ['out', 'exit 1'],
];

const CHAIN: [Tone, string][] = [
  ['dim', '# Base Sepolia · ERC-8004 reputation registry · read-only'],
  ['out', 'tx      0xcdb4f83f5843…8eb8f481ff1c8c'],
  ['out', 'event   NewFeedback'],
  ['out', 'agent   5863 (trinity-shofet)'],
  ['out', 'value   2276    tag hyperdag_repid'],
  ['out', 'mined   2026-10-20 12:05 UTC'],
  ['dim', ''],
  ['measured', 'read back from chain     yes'],
  ['absent', 'bound to its evidence   not built yet'],
];

const SPEND: [Tone, string][] = [
  ['dim', '// spend.mjs: npm i @hyperdag/trustshell@next, then node spend.mjs'],
  ['out', "import { randomBytes } from 'node:crypto';"],
  ['out', "import { guardedX402Payment } from '@hyperdag/trustshell';"],
  ['dim', ''],
  ['out', "const base = { privateKey: '0x' + randomBytes(32).toString('hex'),"],
  ['out', "  to: '0x000000000000000000000000000000000000dEaD', agentId: 'demo' };"],
  ['out', 'for (const [label, p] of ['],
  ['out', "  ['no policy', { origin: 'Cli', amount: 50000n, cap: 100000n }],"],
  ['out', "  ['over the cap', { origin: 'Cli', amount: 150000n, cap: 100000n,"],
  ['out', '                    policy: { allow: true } }],'],
  ['out', ']) {'],
  ['out', "  try { await guardedX402Payment({ ...base, ...p }); console.log('ALLOWED', label); }"],
  ['out', "  catch (e) { console.log('REFUSED', label, '-', e.message); }"],
  ['out', '}'],
  ['dim', ''],
  ['cmd', '$ node spend.mjs'],
  ['failed', 'REFUSED no policy - policy_required: spend intent has no policy (fail-closed — missing policy refuses)'],
  ['failed', 'REFUSED over the cap - cap_exceeded: amount 150000 > cap 100000'],
];

const HOOKS: [Tone, string][] = [
  ['dim', '# OpenClaw plugin hooks'],
  ['out', 'before_tool_call     rewrite params · block · require approval'],
  ['out', 'after_tool_call      observe result · error · duration'],
  ['dim', ''],
  ['dim', '# what a TrustShell adapter would add'],
  ['absent', 'policy check per call     not built yet'],
  ['absent', 'receipt per call          not built yet'],
];

const sectionClass = 'scroll-mt-20 border-t border-slate-800 pt-14 mt-16 grid gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-start';
const h2Class = 'text-2xl sm:text-3xl font-semibold leading-tight text-white';
const proseClass = 'space-y-4 text-base sm:text-lg leading-relaxed text-slate-300 max-w-prose';

export default function BuildPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 sm:px-6 py-16 text-slate-300">
      <div className="mx-auto max-w-6xl">
        <section className="grid gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-start">
          <div className="space-y-6">
            <h1 className="text-4xl sm:text-5xl font-semibold leading-[1.1] text-white">
              Your AI says the job is done. TrustShell checks the evidence.
            </h1>
            <p className="max-w-prose text-lg leading-relaxed">
              For builders on ERC-8004, x402 and OpenClaw. Everything on this page is a command you can run or a
              source you can open. Anything we have not built yet says so.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href="/inspect"
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-amber-600 px-5 py-3 text-sm font-bold text-black transition-colors hover:bg-amber-500"
              >
                Try Inspect
              </a>
              <a
                href="https://github.com/DealAppSeo/trustshell"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-700 px-5 py-3 text-sm font-bold text-white transition-colors hover:border-slate-500"
              >
                Read the source
              </a>
            </div>
            <p className="max-w-prose text-sm leading-relaxed text-slate-400">
              Developer preview on npm: <code className="font-mono text-slate-200">@hyperdag/trustshell@next</code>{' '}
              (1.8.0-rc.0). No account and no key unless a section says so. Help us test it.
            </p>
          </div>
          <Session
            label="Inspect checks two claims about a pinned CI run"
            lines={CHALLENGE}
            caption={
              <>
                Run from npm with no account and no key on 21 October 2026. The agent cited a green run as proof for
                the wrong commit. The run is <Ext href="https://github.com/DealAppSeo/trustshell/actions/runs/39619591025">public</Ext>; check it yourself.
              </>
            }
          />
        </section>

        <nav aria-label="On this page" className="mt-14 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <a href="#erc-8004" className="text-slate-300 underline-offset-4 hover:text-white hover:underline">ERC-8004</a>
          <a href="#x402" className="text-slate-300 underline-offset-4 hover:text-white hover:underline">x402</a>
          <a href="#openclaw" className="text-slate-300 underline-offset-4 hover:text-white hover:underline">OpenClaw</a>
          <a href="#break-it" className="text-slate-300 underline-offset-4 hover:text-white hover:underline">Break it</a>
        </nav>

        <section id="erc-8004" className={sectionClass} aria-labelledby="erc-8004-h">
          <div className="space-y-5">
            <h2 id="erc-8004-h" className={h2Class}>
              An agent can have an identity and a reputation. Can you verify what earned it?
            </h2>
            <div className={proseClass}>
              <p>
                ERC-8004 gives an agent an on-chain identity and a reputation registry. A reputation is only as good
                as the feedback behind it. In a study of the ERC-8004 ecosystem, 59–91% of reviewers on Ethereum, BSC
                and Base showed coordinated Sybil behaviour, and once their feedback was removed, 16–87% of rated
                agents had no valid feedback left (
                <Ext href="https://arxiv.org/abs/2606.26028v2">Xiong et al., arXiv:2606.26028 v2, 8 July 2026</Ext>).
              </p>
              <p>
                What we want to show you: one piece of feedback bound to its receipt, its payment, the delivered work
                and an independent check of that work, verifiable on your own machine with the chain and our servers
                switched off.
              </p>
            </div>
            <ul className="space-y-3">
              <Status state="MEASURED">Our engine writes RepID feedback to the ERC-8004 reputation registry on Base Sepolia; the write on the right was read back from chain.</Status>
              <Status state="NOT_CHECKED">Feedback bound to its evidence: not built yet. One live agent&apos;s proof currently points at another agent&apos;s attestation.</Status>
              <Status state="NOT_CHECKED">Trades between different owners: none proven yet (0 of 34 settled trades in the 30 days to 21 October 2026).</Status>
            </ul>
            <p className="text-base">
              <Ext href="https://github.com/DealAppSeo/trustshell/issues/589">Help us build evidence-bound feedback (issue #589)</Ext>
            </p>
          </div>
          <Session
            label="One ERC-8004 reputation write read back from Base Sepolia"
            lines={CHAIN}
            caption={
              <>
                Read-only, from the public Base Sepolia RPC.{' '}
                <Ext href="https://sepolia.basescan.org/tx/0xcdb4f83f5843ec029513d6416564afc5c57b7951dfcb98880c2eb8f481ff1c8c">See the transaction</Ext>.
                Testnet only.
              </>
            }
          />
        </section>

        <section id="x402" className={sectionClass} aria-labelledby="x402-h">
          <div className="space-y-5">
            <h2 id="x402-h" className={h2Class}>
              An agent can pay per request. Does it refuse what its owner never allowed?
            </h2>
            <div className={proseClass}>
              <p>
                x402 lets an agent pay for a request with a signed USDC authorization. TrustShell&apos;s default way to
                pay, <code className="font-mono text-[0.95em] text-slate-200">guardedX402Payment</code>, refuses before
                anything is signed when the origin may not pay, the owner gave no policy or no cap, or the amount is
                over the cap. The lower-level signer it wraps still enforces the cap.
              </p>
              <p>
                The script on the right runs on your machine against the npm package, with a throwaway key. It
                moves nothing.
              </p>
            </div>
            <ul className="space-y-3">
              <Status state="MEASURED">Refusals before signing, run from the npm developer preview on 21 October 2026.</Status>
              <Status state="MEASURED">Paying runs on Base Sepolia testnet only, and needs an API key and a funded testnet wallet.</Status>
              <Status state="NOT_CHECKED">Paying only for work that checked out: not built yet. This is the part we want to build with you.</Status>
            </ul>
          </div>
          <Session
            label="The spend guard refusing two payments before signing"
            lines={SPEND}
            wrap={false}
            caption="Output from the npm developer preview, 1.8.0-rc.0. Signing an allowed payment also needs the ethers package, which the error tells you to install."
          />
        </section>

        <section id="openclaw" className={sectionClass} aria-labelledby="openclaw-h">
          <div className="space-y-5">
            <h2 id="openclaw-h" className={h2Class}>
              Your agent worked overnight. What did it do, what was allowed, what should you trust?
            </h2>
            <div className={proseClass}>
              <p>
                OpenClaw already gives plugins the two places this needs.{' '}
                <code className="font-mono text-[0.95em] text-slate-200">before_tool_call</code> can rewrite a tool
                call&apos;s parameters, block it or require approval, and{' '}
                <code className="font-mono text-[0.95em] text-slate-200">after_tool_call</code> sees each result, error
                and duration (<Ext href="https://docs.openclaw.ai/plugins/hooks/reference">OpenClaw hook reference</Ext>).
              </p>
              <p>
                A TrustShell adapter would use them to check each call against the owner&apos;s policy and keep a receipt
                of what ran. It does not exist yet. If you build on OpenClaw, build it with us.
              </p>
              <p>
                What works today: when your agent says last night&apos;s CI run passed, Inspect checks that claim
                against the run itself.
              </p>
            </div>
            <ul className="space-y-3">
              <Status state="MEASURED">Inspect checks an agent&apos;s claim about a CI run: the challenge at the top of this page.</Status>
              <Status state="NOT_CHECKED">An OpenClaw adapter: not built yet.</Status>
            </ul>
          </div>
          <Session
            label="The OpenClaw hooks an adapter would use"
            lines={HOOKS}
            caption="The two hooks are OpenClaw's own; the adapter lines are what is missing."
          />
        </section>

        <section id="break-it" className="scroll-mt-20 border-t border-slate-800 pt-14 mt-16 space-y-8" aria-labelledby="break-it-h">
          <div className="space-y-4">
            <h2 id="break-it-h" className={h2Class}>Bring your own agent. Show us where we&apos;re wrong.</h2>
            <p className="max-w-prose text-base sm:text-lg leading-relaxed">
              Run the challenge, then try to break it. Three kinds of finding matter most.
            </p>
          </div>
          <dl className="grid gap-x-10 gap-y-6 md:grid-cols-3">
            <div className="space-y-2">
              <dt className="text-lg font-semibold text-white">A claim we wrongly supported</dt>
              <dd className="leading-relaxed">The card said SUPPORTED and the record does not back it. This is the worst bug the tool can have.</dd>
            </div>
            <div className="space-y-2">
              <dt className="text-lg font-semibold text-white">A permission we failed to enforce</dt>
              <dd className="leading-relaxed">The owner did not allow something, and it happened anyway.</dd>
            </div>
            <div className="space-y-2">
              <dt className="text-lg font-semibold text-white">A record another machine cannot verify</dt>
              <dd className="leading-relaxed">We wrote a record, and checking it somewhere else fails, or passes when it should not.</dd>
            </div>
          </dl>
          <p className="max-w-prose leading-relaxed">
            Every reproducible finding becomes a permanent case in our red-team tests, so the next release has to
            survive it. Start with the{' '}
            <Ext href="https://github.com/DealAppSeo/trustshell/issues/new?template=wrong-verdict.yml">wrong-verdict form</Ext>, the{' '}
            <Ext href="https://github.com/DealAppSeo/trustshell/blob/main/CONTRIBUTING.md">contributing guide</Ext> or the{' '}
            <Ext href="https://github.com/DealAppSeo/trustshell/blob/main/docs/good-first-issues.md">starter tasks</Ext>.
          </p>
        </section>

        <section className="border-t border-slate-800 pt-14 mt-16 space-y-6" aria-labelledby="status-h">
          <h2 id="status-h" className={h2Class}>What runs today, and what does not yet</h2>
          <dl className="max-w-3xl divide-y divide-slate-800 border-y border-slate-800">
            {[
              ['Inspect', 'Check what an agent says against the record.', 'In the npm developer preview'],
              ['Guard', 'An owner policy the CLI enforces.', 'Prototype, in review, not released'],
              ['Carry', 'Your settings and memory, moved to another model as one signed file.', 'Prototype, in review, not released'],
              ['Earn', 'Verified work raising what an agent is allowed to do.', 'Roadmap'],
            ].map(([name, what, status]) => (
              <div key={name} className="grid gap-1 py-4 sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,16rem)] sm:gap-6">
                <dt className="font-semibold text-white">{name}</dt>
                <dd className="text-slate-300">{what}</dd>
                <dd className="text-slate-400">{status}</dd>
              </div>
            ))}
          </dl>
          <a
            href="/inspect"
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-amber-600 px-5 py-3 text-sm font-bold text-black transition-colors hover:bg-amber-500"
          >
            Try Inspect
          </a>
        </section>
      </div>
    </main>
  );
}
