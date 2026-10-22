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
 * "launched"; nothing unbuilt is described as working. Each section names one thing not built yet;
 * the full list lives in the table at the bottom, so the two can never disagree.
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
function Status({ state, children }: { state: 'MEASURED' | 'NOT_CHECKED'; children: ReactNode }) {
  return (
    <li className="flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:gap-3">
      <TrustBadge state={state} className="shrink-0" />
      <span className="text-base leading-relaxed text-slate-300">{children}</span>
    </li>
  );
}

/** A command breaks only at spaces and after "/", and a flag never splits at its own hyphens, so a
 * wrapped URL stays readable and "--claims-file" never becomes "--claims-" + "file". */
function Cmd({ text }: { text: string }) {
  return (
    <>
      {text.split(' ').map((word, i) => (
        <span key={i}>
          {i > 0 && ' '}
          {word.startsWith('-') ? (
            <span className="whitespace-nowrap">{word}</span>
          ) : (
            word.split('/').map((part, j, all) => (
              <span key={j}>
                {part}
                {j < all.length - 1 && (all[j + 1] === '' ? '/' : (
                  <>
                    /<wbr />
                  </>
                ))}
              </span>
            ))
          )}
        </span>
      ))}
    </>
  );
}

// A prompt line keeps "$" and its command together ( ), so a wrapped line never leaves a lone "$".
/** A transcript or data block: real output only, so mono is the material, not a costume. Output
 * always wraps so the deciding line is never cut off on a phone; a script keeps its code lines
 * (wrap=false) and scrolls instead. */
function Session({ label, lines, caption, wrap = true }: { label: string; lines: [Tone, string][]; caption?: ReactNode; wrap?: boolean }) {
  return (
    <figure className="min-w-0">
      <pre
        tabIndex={0}
        role="region"
        aria-label={label}
        className="overflow-x-auto rounded-lg border border-slate-800 bg-[#0b1220] px-4 py-4 font-mono text-[13px] leading-6 [font-variant-ligatures:none] shadow-[0_12px_32px_-16px_rgba(0,0,0,0.8)]"
      >
        {lines.map(([tone, text], i) => {
          const keep = !wrap && tone === 'out';
          const flow = keep ? 'whitespace-pre' : tone === 'cmd' ? 'whitespace-pre-wrap [overflow-wrap:normal]' : 'whitespace-pre-wrap break-words';
          return (
            <span key={i} className={`block ${flow} ${TONE[tone]}`}>
              {tone === 'cmd' ? <Cmd text={text} /> : text || ' '}
            </span>
          );
        })}
      </pre>
      {caption && <figcaption className="mt-3 text-sm leading-relaxed text-slate-400">{caption}</figcaption>}
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

function Code({ children }: { children: ReactNode }) {
  return <code className="font-mono text-[0.95em] text-slate-200">{children}</code>;
}

/** The section's builder-side opener: what you can do with this in your stack today. */
function Lead({ children }: { children: ReactNode }) {
  return <p className="max-w-prose text-lg leading-relaxed text-white">{children}</p>;
}

const RUN_URL = 'https://github.com/DealAppSeo/trustshell/actions/runs/39619591025';

// Commands are /inspect's (docs/challenge.md), so the two pages can never teach different steps.
// Output lines are verbatim from stdout, run in an empty folder with no credential variables set.
const CHALLENGE: [Tone, string][] = [
  ['cmd', `$ RUN=${RUN_URL}`],
  ['cmd', "$ printf 'The check workflow succeeded, run 39619591025.\\n\\nThe check workflow succeeded on commit 5d1c5e3f57e1, run 39619591025.\\n' > claims.txt"],
  ['cmd', '$ npx @hyperdag/trustshell@next check "$RUN" --claims-file claims.txt'],
  ['dim', '…'],
  ['out', '### Claims: 3 supported · 1 contradicted · 1 not checked'],
  ['failed', '- **CONTRADICTED** `commit 5d1c5e3f57e1`'],
  ['dim', '  - **Why** The claim cites commit 5d1c5e3f57e1; the inspected run is on 392797a69b6a.'],
  ['measured', '- **SUPPORTED** `The check workflow succeeded`'],
  ['measured', '- **SUPPORTED** `run 39619591025`'],
  ['dim', '…'],
  ['absent', '- **This workflow run succeeding: not checked.** `The check workflow succeeded` …'],
  ['dim', '…'],
  ['cmd', '$ echo $?'],
  ['out', '1'],
];

const CHALLENGE_PS: [Tone, string][] = [
  ['cmd', `PS> $run = "${RUN_URL}"`],
  ['cmd', 'PS> "The check workflow succeeded, run 39619591025.", "", "The check workflow succeeded on commit 5d1c5e3f57e1, run 39619591025." | Set-Content claims.txt'],
  ['cmd', 'PS> npx @hyperdag/trustshell@next check $run --claims-file claims.txt; "exit $LASTEXITCODE"'],
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
  ['out', '  try { await guardedX402Payment({ ...base, ...p });'],
  ['out', "        console.log('ALLOWED', label); }"],
  ['out', "  catch (e) { console.log('REFUSED', label, '-', e.message); }"],
  ['out', '}'],
  ['dim', ''],
  ['cmd', '$ node spend.mjs'],
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

const REPORT: [Tone, string][] = [
  ['cmd', '$ npx @hyperdag/trustshell@next check "$RUN" --claims-file claims.txt --out card'],
  ['out', 'wrote record.json, card.md and card.html to card'],
];

const sectionClass = 'scroll-mt-20 border-t border-slate-800 pt-14 mt-16 grid gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-start';
const h2Class = 'text-2xl sm:text-3xl font-semibold leading-tight text-white';
const proseClass = 'space-y-4 text-base sm:text-lg leading-relaxed text-slate-300 max-w-prose';
const statusLink = (
  <a href="#status" className="text-slate-300 underline underline-offset-4 hover:text-white">
    everything not built yet
  </a>
);

export default function BuildPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 sm:px-6 py-16 text-slate-300">
      <div className="mx-auto max-w-6xl">
        <section className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
          <div className="space-y-6">
            <h1 className="text-4xl sm:text-5xl font-semibold leading-[1.1] text-white">
              Your AI says the job is done. TrustShell checks the evidence.
            </h1>
            <p className="max-w-prose text-lg leading-relaxed text-white">
              Your agent claims a CI run passed. Inspect checks the run itself.
            </p>
            <p className="max-w-prose text-lg leading-relaxed">
              For teams already using ERC-8004 identities, x402 payments or OpenClaw hooks. Everything on this page
              is a command you can run or a source you can open, and each section says what is not built yet.
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
              Developer preview on npm: <Code>@hyperdag/trustshell@next</Code> (1.8.0-rc.0). No account and no key
              unless a section says so. Help us test it.
            </p>
          </div>
          <div className="min-w-0 space-y-3">
            <Session
              label="Inspect checks two claims about a pinned CI run"
              lines={CHALLENGE}
              caption={
                <>
                  Run with <Code>@hyperdag/trustshell</Code> 1.8.0-rc.0 from npm on 21 October 2026, in an empty
                  folder, with no account and no key; … marks lines left out. The agent cited a green run as proof for
                  the wrong commit, so that commit is contradicted. The same sentence&apos;s &ldquo;succeeded&rdquo; is
                  not checked, because it names a commit this run is not on. Exit 1 means a claim was contradicted.
                  The run is <Ext href={RUN_URL}>public</Ext>; check it yourself.
                </>
              }
            />
            <details className="rounded-lg border border-slate-800">
              <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold text-white marker:text-slate-400 hover:text-amber-300">
                The same three commands in Windows PowerShell
              </summary>
              <div className="px-4 pb-4">
                <Session label="The challenge commands in Windows PowerShell" lines={CHALLENGE_PS} />
              </div>
            </details>
          </div>
        </section>

        <nav aria-label="On this page" className="mt-14 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <a href="#erc-8004" className="inline-flex min-h-11 items-center text-slate-300 underline-offset-4 hover:text-white hover:underline">ERC-8004</a>
          <a href="#x402" className="inline-flex min-h-11 items-center text-slate-300 underline-offset-4 hover:text-white hover:underline">x402</a>
          <a href="#openclaw" className="inline-flex min-h-11 items-center text-slate-300 underline-offset-4 hover:text-white hover:underline">OpenClaw</a>
          <a href="#break-it" className="inline-flex min-h-11 items-center text-slate-300 underline-offset-4 hover:text-white hover:underline">Break it</a>
          <a href="#status" className="inline-flex min-h-11 items-center text-slate-300 underline-offset-4 hover:text-white hover:underline">What is built</a>
        </nav>

        <section id="erc-8004" className={sectionClass} aria-labelledby="erc-8004-h">
          <div className="space-y-5">
            <h2 id="erc-8004-h" className={h2Class}>
              An agent can have an identity and a reputation. Can you verify what earned it?
            </h2>
            <Lead>
              If you read ERC-8004 feedback, you can check one of ours on Base Sepolia today. Help us bind feedback
              to its evidence.
            </Lead>
            <div className={proseClass}>
              <p>
                ERC-8004 gives an agent an on-chain identity and a reputation registry. A reputation is only as good
                as the feedback behind it. In a study of the ERC-8004 ecosystem, 59–91% of reviewers on Ethereum, BSC
                and Base showed coordinated Sybil behaviour, and once their feedback was removed, 16–87% of rated
                agents had no valid feedback left (
                <Ext href="https://arxiv.org/abs/2606.26028v2">Xiong et al., arXiv:2606.26028 v2, 8 July 2026</Ext>).
              </p>
              <p>
                Our own agents have the same question to answer: none of the 34 trades they settled in the 30 days
                to 21 October 2026 is yet proven to be between different owners.
              </p>
              <p>
                What we want to show you: one piece of feedback bound to its receipt, its payment, the delivered work
                and an independent check of that work.
              </p>
            </div>
            <ul className="space-y-3">
              <Status state="MEASURED">Our engine writes RepID feedback to the ERC-8004 reputation registry on Base Sepolia. The write shown here was read back from chain.</Status>
              <Status state="NOT_CHECKED">
                Feedback bound to its evidence: not built yet. One live agent&apos;s proof currently points at another
                agent&apos;s attestation (<Ext href="https://github.com/DealAppSeo/trustshell/issues/589">issue #589</Ext>). See {statusLink}.
              </Status>
            </ul>
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
            <Lead>
              If your agent pays with x402, run this script with a throwaway key and watch TrustShell refuse payments
              its owner never allowed, before anything is signed.
            </Lead>
            <div className={proseClass}>
              <p>
                x402 lets an agent pay for a request with a signed USDC authorization. TrustShell&apos;s default way to
                pay, <Code>guardedX402Payment</Code>, refuses before anything is signed when the origin may not pay, the
                owner gave no policy or no cap, or the amount is over the cap. The lower-level signer it wraps still
                enforces the cap.
              </p>
              <p>
                This script runs on your machine against the npm package. Its key is random and holds nothing, and it
                moves nothing. Making a real payment is a different step: it runs on Base Sepolia testnet only and
                needs an API key and a funded testnet wallet.
              </p>
            </div>
            <ul className="space-y-3">
              <Status state="MEASURED">Both refusals, before signing, run from the npm developer preview on 21 October 2026.</Status>
              <Status state="NOT_CHECKED">Paying only for work that checked out: not built yet. This is the part we want to build with you. See {statusLink}.</Status>
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
            <Lead>
              If you already use <Code>before_tool_call</Code> and <Code>after_tool_call</Code>, that is exactly where
              a policy check and a receipt would attach. Build the adapter with us.
            </Lead>
            <div className={proseClass}>
              <p>
                <Code>before_tool_call</Code> can rewrite a tool call&apos;s parameters, block it or require approval,
                and <Code>after_tool_call</Code> sees each result, error and duration (
                <Ext href="https://docs.openclaw.ai/plugins/hooks/reference">OpenClaw hook reference</Ext>). A TrustShell
                adapter would use them to check each call against the owner&apos;s policy and keep a receipt of what
                ran.
              </p>
              <p>
                What works today: when your agent says last night&apos;s CI run passed, Inspect checks that claim
                against the run itself, as in the challenge at the top of this page.
              </p>
            </div>
            <ul className="space-y-3">
              <Status state="NOT_CHECKED">A TrustShell adapter for OpenClaw: not built yet. See {statusLink}.</Status>
            </ul>
          </div>
          <Session
            label="The OpenClaw hooks an adapter would use"
            lines={HOOKS}
            caption="The two hooks are OpenClaw's own; the adapter lines are what is missing."
          />
        </section>

        <section id="break-it" className={sectionClass} aria-labelledby="break-it-h">
          <div className="space-y-6">
            <h2 id="break-it-h" className={h2Class}>Bring your own agent. Show us where we&apos;re wrong.</h2>
            <Lead>
              The finding we want most: a claim we wrongly supported. The card said SUPPORTED and the record does not
              back it. That is the worst bug this tool can have.
            </Lead>
            <dl className="space-y-5">
              <div className="space-y-1">
                <dt className="text-lg font-semibold text-white">A permission we failed to enforce</dt>
                <dd className="leading-relaxed">The owner did not allow something, and it happened anyway.</dd>
              </div>
              <div className="space-y-1">
                <dt className="text-lg font-semibold text-white">A record another machine cannot verify</dt>
                <dd className="leading-relaxed">We wrote a record, and checking it somewhere else fails, or passes when it should not.</dd>
              </div>
            </dl>
            <p className="max-w-prose leading-relaxed">
              Every reproducible finding becomes a permanent case in our red-team tests, so the next release has to
              survive it. Report it on the{' '}
              <Ext href="https://github.com/DealAppSeo/trustshell/issues/new?template=wrong-verdict.yml">wrong-verdict form</Ext>, or start
              with the <Ext href="https://github.com/DealAppSeo/trustshell/blob/main/CONTRIBUTING.md">contributing guide</Ext> or the{' '}
              <Ext href="https://github.com/DealAppSeo/trustshell/blob/main/docs/good-first-issues.md">starter tasks</Ext>.
            </p>
          </div>
          <Session
            label="The command that makes a report to attach"
            lines={REPORT}
            caption={
              <>
                Set <Code>RUN</Code> to the run you checked, as in the challenge at the top. Attach{' '}
                <Code>card.md</Code> and <Code>record.json</Code> with the run URL, your claims file as you ran it and the
                exit code. Public runs only; never paste a secret.
              </>
            }
          />
        </section>

        <section id="status" className="scroll-mt-20 border-t border-slate-800 pt-14 mt-16 space-y-6" aria-labelledby="status-h">
          <h2 id="status-h" className={h2Class}>What runs today, and what does not yet</h2>
          <dl className="max-w-4xl divide-y divide-slate-800 border-y border-slate-800">
            {[
              ['Inspect', 'Check what an agent says about a CI run against the run itself.', 'In the npm developer preview'],
              ['Guard', 'An owner policy the CLI enforces.', 'Prototype, in review, not released'],
              ['Carry', 'Your settings and memory, moved to another model as one signed file.', 'Prototype, in review, not released'],
              ['Earn', 'Verified work raising what an agent is allowed to do.', 'Roadmap'],
              ['ERC-8004 feedback bound to its evidence', 'Feedback tied to its receipt, payment, delivered work and an independent check.', 'Not built yet'],
              ['Paying only for verified work', 'An x402 payment released only when the delivered work checks out.', 'Not built yet'],
              ['OpenClaw adapter', 'A policy check before each tool call and a receipt after it.', 'Not built yet'],
            ].map(([name, what, status]) => (
              <div key={name} className="grid gap-1 py-4 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_minmax(0,14rem)] sm:gap-6">
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
