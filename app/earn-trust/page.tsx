import Link from 'next/link';
import { OG_IMAGE } from '@/lib/site';
import { TrustBadge } from '@/components/trust-state';

export const metadata = {
  title: 'Earn trust — TrustShell',
  description:
    'Guardrails alone cannot make an autonomous agent safe. It takes a trust ecosystem: a sandbox that contains execution, a harness that carries memory, context, permissions and the refuse across models, and trust the agent has earned — RepID. Each part marked for what it is today: shipped or a direction.',
  openGraph: {
    title: 'Earn trust — TrustShell',
    description:
      'Why safe autonomy needs more than a prompt filter: a sandbox, a harness, and earned reputation — stated as a direction we are committed to, with every claim marked shipped or direction.',
    images: OG_IMAGE,
    type: 'article',
    url: 'https://trustshell.dev/earn-trust',
  },
};

/**
 * /earn-trust — the case for a trust ecosystem.
 *
 * The thesis Sean has long wanted stated in one place: an autonomous agent needs more than
 * guardrails. It needs a SANDBOX (contained execution, no blast radius), a HARNESS (the portable
 * four — memory · context · permissions · the refuse — plus quarantine and live-vs-direction), and
 * the ability to EARN TRUST (reputation earned through verified behaviour — RepID). Those three are
 * what let an agent act autonomously AND safely, and no one of them alone does it.
 *
 * SIBLING PAGES, ONE VOICE. This extends the explainer family — /layers (the three controls),
 * /trust-harness (the ladder), /how-verification (disjoint families × HAL), /vision (the story) —
 * and must read as one of them. Same shell, same shipped/direction tag, same hedged register, same
 * three-outcome discipline. It links to the deep-dives rather than restating their numbers.
 *
 * HONESTY, because this repo is public and ships @hyperdag/trustshell to outside builders:
 *   - Definitions are the glossary's (lib/glossary.ts), not invented here. Quarantine, the four
 *     portable parts, live-vs-direction, RepID, HAL, the three outcomes all trace to a Term.
 *   - The SANDBOX section is accurate to the kernel code (repid-engine/src/kernel/*). The decision
 *     logic and the reference-equality primitive are shipped and tested; arming enforcement is one
 *     flag (KERNEL_CAPABILITY_REGISTRY_ENABLED) that is DEFAULT OFF, and whether it is switched on
 *     in production is NOT something this page measured — so enforcement is tagged `direction`.
 *   - No scoring formula, no ANFIS parameters, no tuning constants — those stay off a public page;
 *     the mechanism lives on /how-verification and /repid and is linked, not restated.
 *   - Example belts beyond the three that exist (CMO/CFO/CTO) are tagged `direction`.
 *   - Everything that runs at all runs on Base Sepolia testnet; the money there has no value.
 */

type State = 'shipped' | 'live' | 'direction';

function StateTag({ state }: { state: State }) {
  // Readiness metadata, deliberately NOT the accent and NOT a verdict colour, so it reads as
  // neither a measurement nor a call to action. Shipped is solid; a direction is dashed and hollow.
  // Each carries its word and a shape, so it survives greyscale and colour-vision loss. Matches the
  // tag on /vision exactly, so the two pages read as one system.
  const map: Record<State, { label: string; dashed: boolean }> = {
    shipped: { label: 'Shipped', dashed: false },
    live: { label: 'Live', dashed: false },
    direction: { label: 'Direction', dashed: true },
  };
  const { label, dashed } = map[state];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted ${
        dashed ? 'border-dashed border-border' : 'border-border bg-card'
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-1.5 w-1.5 rounded-full ${dashed ? 'border border-muted' : 'bg-muted'}`}
      />
      {label}
    </span>
  );
}

type Pillar = {
  name: string;
  verb: string;
  one: string;
  body: string;
  link: { href: string; label: string };
};

// The three parts of a trust ecosystem. The order is the order of a request: contain WHERE it can
// reach, carry WHO is behind it and what it may do, then let it EARN more. Each links to its own
// deeper page rather than trying to be that page.
const PILLARS: ReadonlyArray<Pillar> = [
  {
    name: 'Sandbox',
    verb: 'contains execution',
    one: 'A room with no blast radius.',
    body:
      'The files, hosts and money the agent can reach at all. A prompt injection that lands still cannot touch what the room walls off, because the wall is upstream of the answer, not a reaction to it.',
    link: { href: '/layers', label: 'Sandbox, Guardrail, Harness' },
  },
  {
    name: 'Harness',
    verb: 'carries the record',
    one: 'Four things that travel with the agent, not the vendor.',
    body:
      'Its memory of what it has done, its working context, the permissions it has been granted, and its constitution — the ability to refuse. Switching models resets none of them. A person is at the root, and the owner can stop everything under a grant at once.',
    link: { href: '/trust-harness', label: 'The trust harness, end to end' },
  },
  {
    name: 'Earn trust',
    verb: 'earns standing',
    one: 'Reputation from verified behaviour, not a badge someone assigned.',
    body:
      'RepID moves when a confirmed action helped someone who is not the actor. It is weighted so substance counts and activity does not, and anchored on-chain so it belongs to the agent rather than to whoever hosts it today.',
    link: { href: '/repid', label: 'How RepID is governed' },
  },
];

type SandboxFact = {
  title: string;
  body: string;
};

// Accurate to repid-engine/src/kernel/*: capability-registry.ts, gate.ts (runUnderKernel), decide.ts,
// and the client half in src/lib/kernel-client.ts. Mechanisms only — no thresholds, no tuning.
const SANDBOX_FACTS: ReadonlyArray<SandboxFact> = [
  {
    title: 'A decision is a dry run, marked not-run',
    body:
      'The kernel is asked before the agent acts. Its answer is a preview receipt stamped executed: false — a would-allow, never a run. Only one path (runUnderKernel) ever executes a tool, and a preview that claims the call already ran is refused on sight.',
  },
  {
    title: 'The kernel runs its own registered implementation',
    body:
      'A tool runs only if it resolves to a function the kernel loaded at boot, that identity is authorized by the owner’s signed policy, and its capability is not on a hard-prohibited floor — exporting a secret, writing trusted memory — refused regardless of policy, trust or stake.',
  },
  {
    title: 'Identity is reference-equality, not a name or a hash',
    body:
      'A look-alike closure with identical source code is not the object the kernel registered, so a swapped implementation is denied before it runs. Capability is never read from a caller-supplied name, class or hash — the lie a name-matching screen falls for.',
  },
  {
    title: 'Poisoned input has no door to the registry',
    body:
      'The registry can only be written at boot, by trusted module code. The request path is handed a read-only view with no mutator, so content an agent ingested from outside has no code path to insert or swap an entry.',
  },
  {
    title: 'Not checked is never a quiet yes',
    body:
      'A timeout, a non-200, an answer that does not parse, or an ALLOW bound to a different request, tool, agent or amount is a refusal with a reason — fail-closed. The client’s whole job is to be unable to turn “I did not get an answer” into “yes”.',
  },
];

type HarnessPart = {
  name: string;
  body: string;
  /** What @hyperdag/trustshell 1.8.0 actually does for this part. null = nothing live yet. */
  live: string | null;
  /** What is designed and not shipped. */
  direction: string;
};

// The four portable parts, verbatim in substance from the glossary `trust-harness` term's note.
// Each carries LIVE (what the published 1.8.0 package does, per its README and tests) and DIRECTION
// (designed, not shipped). tests/earn-trust-harness-tags.test.ts pins the tags so a part cannot
// drift to "live" without the copy saying what runs.
const HARNESS_PARTS: ReadonlyArray<HarnessPart> = [
  {
    name: 'Memory',
    body: 'What the agent has actually done — carried across every surface, not rebuilt from scratch when the model changes.',
    live: 'Local only: trustshell remember and recall keep notes in a file on your machine, sealed at rest if you turn on TRUSTSHELL_MEMORY_ENCRYPT. Since 1.7.0 every note carries a taint label, and untrusted notes are quarantined (below).',
    direction: 'Carrying that memory across every surface and machine, so switching the model or the device rebuilds nothing. Today it stays where you ran the command.',
  },
  {
    name: 'Context',
    body: 'The working state it is reasoning over right now, kept with the agent rather than with the runtime that happens to hold it.',
    live: null,
    direction: 'Nothing in the package carries an agent’s working context between runtimes yet. This part is designed, not shipped.',
  },
  {
    name: 'Permissions',
    body: 'The scoped, budgeted, expiring grants it has been given — what it may do, up to what value, until when. Revoking one is meant to cascade to everything beneath it.',
    live: 'The MCP tool my_job reads the role, tools and expiry the owner granted on trustshell.dev. In the SDK, guardedX402Payment refuses a spend with no paying origin or no policy, and signs only under the cap.',
    direction: 'Enforcing every grant on every tool call, so revoking one stops everything under it. That is the kernel’s job, and its enforcement flag is off by default (the sandbox, above).',
  },
  {
    name: 'The refuse',
    body: 'Its constitution: the rules it must satisfy before acting, so it can decline or escalate an unsafe or ungrounded action instead of performing it.',
    live: 'trustshell check and verify answer pass, veto or not checked, and not checked is never a pass. Since 1.7.0, trustshell ground vetoes a quote its cited page does not hold, locally, and trustshell receipt reads a kernel receipt back and refuses one that does not match its own hash.',
    direction: 'The kernel refusing the action itself, before any tool runs, in production. The decision logic is shipped and tested; arming it is a flag that is off by default.',
  },
];

type Diff = {
  dimension: string;
  guardrail: string;
  ecosystem: string;
};

// The differentiator. Left: what a prompt-filter / guardrail does on its own. Right: what the trust
// ecosystem adds. Every right-hand claim traces to a shipped surface or a linked mechanism page.
const DIFFS: ReadonlyArray<Diff> = [
  {
    dimension: 'Is the claim true?',
    guardrail: 'A filter scans the wording and hopes. One model marking its own homework.',
    ecosystem: 'Today two model families, from different builders, must both agree for a pass, so one provider’s bias or outage cannot fake a pass on its own. A golden-ratio supermajority across more families is the design target, not what runs.',
  },
  {
    dimension: 'When a check cannot run',
    guardrail: 'Silence reads as approval — the unmeasured case quietly becomes a yes.',
    ecosystem: 'A kernel that fails closed. Not checked is an absence, rendered neutral, and it blocks a post or a spend rather than defaulting to one.',
  },
  {
    dimension: 'Who is responsible',
    guardrail: 'A system prompt names no accountable owner a third party can check.',
    ecosystem: 'On-chain ERC-8004 identity and earned RepID: a named agent with a person at the root and standing it had to earn.',
  },
  {
    dimension: 'What it may spend',
    guardrail: 'A sentence in the prompt. A jailbreak argues straight past it.',
    ecosystem: 'x402 payment conditioned on a signed grant — an amount, a payee, an expiry, a purpose — that the account itself is built to enforce.',
  },
  {
    dimension: 'What you can show afterwards',
    guardrail: 'A single green tick that hides whatever it did not look at.',
    ecosystem: 'Two receipts. A paid deal\'s public receipt, which anyone can open at trustshell.dev/receipt/<id> with no key. And the policy kernel\'s six-claim receipt, which you read back with your own key: three honest outcomes (Verified, Not checked, Failed) and a line naming what it does not establish.',
  },
];

type Belt = {
  name: string;
  state: State;
  body: string;
};

// Belts: a belt is the scoped set of tools one agent may use for one role. Three exist today
// (lib/belts.ts: CMO/CFO/CTO), each starter tool read-only by a named setting. The example belts
// beyond those are tagged `direction`, consistent with /vision's surfaces.
const BELTS: ReadonlyArray<Belt> = [
  { name: 'CMO', state: 'shipped', body: 'Reads traffic, search and the web, and checks a claim before anything is posted. Publishing stays in the gated column.' },
  { name: 'CFO', state: 'shipped', body: 'Reads the books, budgets and market data. Every tool that could pay is held back and listed as held back.' },
  { name: 'CTO', state: 'shipped', body: 'Reads code, databases, dashboards and security scans — each started in its own read-only mode. Changes nothing.' },
  { name: 'Research', state: 'direction', body: 'A reading-and-synthesis belt: fetch, search and summarise under the sandbox, with nothing that writes or posts. A direction, not a wired belt.' },
  { name: 'Trading', state: 'direction', body: 'A paper lane first — signals and checks with no real money at risk — before any tool that moves value is ever admitted. The shape before the loop is full.' },
  { name: 'Medical', state: 'direction', body: 'A consent-first belt that shares a proof instead of a record, so only the fields a study needs ever cross. A door, not a trial, and not a clinical offering.' },
];

export default function EarnTrustPage() {
  return (
    <main className="max-w-4xl mx-auto px-4 py-12 space-y-16">
      {/* Header — three beats: thesis / what it takes / the one-line claim. */}
      <header className="space-y-4">
        <p className="text-xs uppercase tracking-widest text-accent font-semibold">
          TrustShell · the case for a trust ecosystem
        </p>
        <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground leading-tight">
          Guardrails are not enough
        </h1>
        <p className="text-lg md:text-xl text-foreground/90 font-medium max-w-2xl">
          An agent you let act on its own needs more than a prompt filter. It needs somewhere safe to
          run, something that carries who it is, and trust it has earned.
        </p>
        <p className="text-base md:text-lg text-muted leading-relaxed max-w-2xl">
          A guardrail is a good idea with no teeth on its own: a jailbreak can argue past a rule
          written in a prompt, and a filter that reads a sentence cannot tell you whether the sentence
          is true, who stands behind it, or what it was allowed to spend. Safe autonomy is three
          things working together — a <span className="text-foreground">sandbox</span>, a{' '}
          <span className="text-foreground">harness</span>, and trust the agent can{' '}
          <span className="text-foreground">earn</span>. That is a trust ecosystem, and it is what
          lets an agent act autonomously and safely at once.
        </p>
      </header>

      {/* 1 — why a prompt filter alone fails */}
      <section className="space-y-5">
        <h2 className="text-2xl font-bold text-foreground">Why a prompt filter alone fails</h2>
        <p className="text-sm md:text-base text-muted leading-relaxed max-w-2xl">
          A prompt is not a control. If the only thing between an agent and a wire transfer is a
          sentence in its instructions, a jailbreak walks straight through it — the model was asked
          nicely, and asking nicely is exactly what an attacker can do too. Scrubbing the input
          harder does not close it either: the gap is not in the wording, it is in trusting the model
          to police itself.
        </p>
        <p className="text-sm md:text-base text-muted leading-relaxed max-w-2xl">
          And even a filter that worked perfectly answers only one question — is this text allowed? —
          while an autonomous agent raises three more it cannot touch. Is the claim actually true?
          Who is accountable when it acts? What is it permitted to spend, post, or change? Those are
          not prompt problems. They need a boundary the model cannot argue with, a record that travels
          with the agent, and a standing it had to earn. One control cannot be all three, because each
          is blind to exactly what the others catch.
        </p>
      </section>

      {/* 2 — the three pillars */}
      <section className="space-y-5">
        <h2 className="text-2xl font-bold text-foreground">What safe autonomy actually takes</h2>
        <p className="text-sm text-muted leading-relaxed max-w-2xl">
          Three parts, in the order a request moves through them. Contain where it can reach, carry
          who is behind it and what it may do, then let it earn more — always inside a ceiling a
          person already signed.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {PILLARS.map((p) => (
            <div key={p.name} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
              <div>
                <p className="text-xl font-bold text-foreground">{p.name}</p>
                <p className="text-[11px] uppercase tracking-widest text-accent font-semibold mt-0.5">
                  {p.verb}
                </p>
              </div>
              <p className="text-sm font-medium text-foreground/90">{p.one}</p>
              <p className="text-sm text-muted leading-relaxed">{p.body}</p>
              <p className="mt-auto pt-2">
                <Link
                  href={p.link.href}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-accent underline-offset-4 hover:underline"
                >
                  {p.link.label}
                  <span aria-hidden="true">→</span>
                </Link>
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 3 — the sandbox, accurate to the kernel code */}
      <section className="space-y-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="text-2xl font-bold text-foreground">The sandbox, concretely</h2>
          <StateTag state="shipped" />
          <StateTag state="direction" />
        </div>
        <p className="text-sm md:text-base text-muted leading-relaxed max-w-2xl">
          The sandbox is not a slogan — it is a policy kernel the agent must ask before it acts, and
          code you can read. Here is what it actually does, stated as the mechanism rather than the
          marketing.
        </p>
        <div className="space-y-3">
          {SANDBOX_FACTS.map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-card p-5 space-y-1.5">
              <p className="font-semibold text-foreground">{f.title}</p>
              <p className="text-sm text-muted leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-dashed border-border bg-card/50 px-5 py-4 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-foreground font-semibold">
              What is shipped, and what is a direction — said exactly.
            </p>
            <TrustBadge state="NOT_CHECKED" detail="enforcement flag state in production — not measured from this page" />
          </div>
          <p className="text-sm text-muted leading-relaxed max-w-2xl">
            The decision logic above, and the reference-equality primitive it rests on, are{' '}
            <span className="text-foreground">shipped and tested</span>. Arming the capability
            control as an enforced gate is a single flag that is{' '}
            <span className="text-foreground">off by default</span>; with it off, the control records
            nothing and behaviour is byte-identical to today. Whether that flag is switched on in
            production is not something this page checked — so the enforced sandbox is a{' '}
            <span className="text-foreground">direction</span>, and the control that decides it, plus
            the client that already refuses anything but a clean, bound ALLOW, is what is live.
          </p>
        </div>
      </section>

      {/* 4 — the harness: four parts + quarantine + live-vs-direction */}
      <section className="space-y-5">
        <h2 className="text-2xl font-bold text-foreground">The harness: four things that travel</h2>
        <p className="text-sm md:text-base text-muted leading-relaxed max-w-2xl">
          A harness wraps an agent you already have rather than replacing it. Four things travel with
          the agent rather than with the vendor, so switching the model that answers the next prompt
          resets none of them to zero.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {HARNESS_PARTS.map((h) => (
            <div key={h.name} className="rounded-xl border border-border bg-card p-5 space-y-3">
              <div className="space-y-1.5">
                <p className="font-semibold text-foreground">{h.name}</p>
                <p className="text-sm text-muted leading-relaxed">{h.body}</p>
              </div>
              {h.live && (
                <div className="space-y-1">
                  <StateTag state="live" />
                  <p className="text-sm text-foreground/90 leading-relaxed">{h.live}</p>
                </div>
              )}
              <div className="space-y-1">
                <StateTag state="direction" />
                <p className="text-sm text-muted leading-relaxed">{h.direction}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-border bg-card p-5 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-foreground">Quarantine, and why a missed catch costs more</p>
            <StateTag state="live" />
            <StateTag state="direction" />
          </div>
          <p className="text-sm text-muted leading-relaxed">
            Anything the agent picks up from outside — a web page, a tool result, another agent’s
            message — is held apart and does not enter its trusted core until a check promotes it. It
            can be read and reasoned about; it cannot silently become a fact the agent acts on. The
            asymmetry is deliberate: a missed prompt-injection, or a falsified fact admitted as true,
            is a <span className="text-foreground">large loss</span> — it costs more than several
            confirmed rights earn, because one poisoned fact can steer every decision made after it.
            Better to quarantine a true thing by mistake than to admit a false one.
          </p>
          <p className="text-sm leading-relaxed">
            <span className="text-foreground font-semibold">Live since 1.7.0, in local memory only.</span>{' '}
            <span className="text-muted">
              A note is stored quarantined unless you vouch for it with remember --trusted, and a note
              an agent saves over MCP always is: recall leaves it out and says how many it held back. It
              is released only by a passing check — the note found in the source document recorded
              with it, locally, or two HAL checkers you ask for — or by your own word, recorded as
              such. Text that reads like an instruction to the agent is screened by fixed patterns, and
              nothing releases it.
            </span>
          </p>
          <p className="text-sm leading-relaxed">
            <span className="text-foreground font-semibold">What it does not do — direction.</span>{' '}
            <span className="text-muted">
              It holds text apart; it runs nothing in a sandbox. The screen is a fixed list, not adaptive
              learning, so a novel phrasing is held as untrusted but not flagged. Web pages, tool results
              and context the agent never saves to this memory are not quarantined. A release is not a
              truth verdict.
            </span>
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 space-y-2">
          <p className="font-semibold text-foreground">Live vs direction</p>
          <p className="text-sm text-muted leading-relaxed">
            The discipline that keeps what is running <span className="text-foreground">now</span>{' '}
            separate from where the design is <span className="text-foreground">headed</span>. A live
            claim points at something you can observe today; a direction describes an intention that
            is not yet a feature. It is why every claim on this page carries a tag, and why
            &ldquo;not live yet&rdquo; is written plainly on the things that are only designed — letting
            a roadmap read as a shipped feature is overclaiming, the same failure the three outcomes
            guard against, one level up.
          </p>
        </div>
      </section>

      {/* 5 — earn trust */}
      <section className="space-y-5">
        <h2 className="text-2xl font-bold text-foreground">Earn trust: standing, not a badge</h2>
        <p className="text-sm md:text-base text-muted leading-relaxed max-w-2xl">
          A sandbox and a harness make an agent safe to run. Earned trust is what lets it do more
          over time without a human breaking every tie. RepID is portable, earned, weighted
          reputation: earned by verified work rather than assigned, weighted so substantive
          contributions move it and activity alone does not, and portable because it is anchored
          on-chain rather than held by one platform.
        </p>
        <p className="text-sm md:text-base text-muted leading-relaxed max-w-2xl">
          Earned is the load-bearing word, and it has a sharp edge: the score should move when a{' '}
          <span className="text-foreground">confirmed action helped someone who is not the actor</span>.
          Helping yourself does not count. A clean record can widen the band an agent is allowed to
          act in; a caught claim, an off-list payee, or a dispute narrows it and asks the person. It
          can never raise the cap above what the owner signed.
        </p>
        <div className="rounded-xl border border-border bg-card px-5 py-4">
          <p className="text-sm leading-relaxed">
            <span className="text-foreground font-semibold">The honest part.</span>{' '}
            <span className="text-muted">
              What should count as earned — how to make it hard to farm and still fair to the smallest
              player — is the unsolved problem underneath all portable reputation. We are working it
              in the open rather than claiming it is handled.
            </span>
          </p>
          <p className="pt-2 text-sm">
            <Link href="/earned-trust" className="inline-flex items-center gap-1 font-semibold text-accent underline-offset-4 hover:underline">
              The open questions on what counts as earned
              <span aria-hidden="true">→</span>
            </Link>
          </p>
        </div>
      </section>

      {/* 6 — differentiation */}
      <section className="space-y-5">
        <h2 className="text-2xl font-bold text-foreground">What this adds over a guardrail</h2>
        <p className="text-sm text-muted leading-relaxed max-w-2xl">
          A guardrail is one layer of the answer, and we keep it. The difference is everything it
          cannot do on its own — which is where the ecosystem lives.
        </p>
        <div className="space-y-3">
          {DIFFS.map((d) => (
            <div key={d.dimension} className="rounded-xl border border-border bg-card p-5 space-y-3">
              <p className="font-semibold text-foreground">{d.dimension}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted/70">
                    A plain guardrail
                  </p>
                  <p className="text-sm text-muted leading-relaxed">{d.guardrail}</p>
                </div>
                <div className="space-y-1 sm:border-l sm:border-border/60 sm:pl-4">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-accent">
                    The trust ecosystem
                  </p>
                  <p className="text-sm text-foreground/90 leading-relaxed">{d.ecosystem}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted/70 leading-relaxed max-w-2xl">
          The verification mechanism is explained in full on{' '}
          <Link href="/how-verification" className="text-accent hover:underline">how verification works</Link>;
          the thresholds and scoring that turn it into a number are engine internals and stay off a
          public page.
        </p>
      </section>

      {/* 7 — specialty tool belts */}
      <section className="space-y-5">
        <h2 className="text-2xl font-bold text-foreground">Specialty tool belts</h2>
        <p className="text-sm md:text-base text-muted leading-relaxed max-w-2xl">
          A belt is a scoped capability bundle — the set of tools one agent may use for one role.
          Each belt is gated by the harness: the starter tools are kept to reads by a named setting,
          and the tools that spend, post, or cannot be undone are listed as held back, never
          pre-approved by appearing on the page. A role is a signed grant another app can check, not
          a click. Three belts exist today; the rest are directions we are shaping.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BELTS.map((b) => (
            <div key={b.name} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-lg font-semibold text-foreground">{b.name}</p>
                <StateTag state={b.state} />
              </div>
              <p className="text-sm text-muted leading-relaxed">{b.body}</p>
            </div>
          ))}
        </div>
        <p className="pt-1">
          <Link href="/belts" className="inline-flex items-center gap-1 text-sm font-semibold text-accent underline-offset-4 hover:underline">
            See the belts and the line between read-only and held back
            <span aria-hidden="true">→</span>
          </Link>
        </p>
      </section>

      {/* 8 — the receipt that ties it together */}
      <section className="space-y-5">
        <h2 className="text-2xl font-bold text-foreground">The receipt ties it together</h2>
        <p className="text-sm md:text-base text-muted leading-relaxed max-w-2xl">
          Sandbox, harness and earned trust each leave a mark, and the mark is a trust receipt that
          never collapses to one green badge. It makes six separate claims, each with its own status
          and its own gaps — a run can be authentic and authorized and still be wrong, and a single
          tick would hide exactly that.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-5 space-y-2">
            <p className="font-semibold text-foreground">Containment is the sandbox, on the receipt</p>
            <p className="text-sm text-muted leading-relaxed">
              One of the six claims answers a single question — did the execution boundary hold? When
              that cannot be established from inside the boundary, it reads Not checked, not a pass.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 space-y-2">
            <p className="font-semibold text-foreground">Three outcomes, kept apart</p>
            <div className="flex flex-wrap gap-2">
              <TrustBadge state="MEASURED" />
              <TrustBadge state="NOT_CHECKED" />
              <TrustBadge state="FAILED" />
            </div>
            <p className="text-sm text-muted leading-relaxed">
              Collapse them into two and &ldquo;we did not look&rdquo; silently becomes &ldquo;it
              passed&rdquo; — the specific way trust software usually lies.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/check"
            className="rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:brightness-110"
          >
            Run a check
          </Link>
          {/* A plain <a>, not <Link>: /receipt/latest is a redirect (next.config.ts) to the engine's
              newest settled deal, not a page here, so there is nothing for Next to prefetch. */}
          <a
            href="/receipt/latest"
            className="rounded-md border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-card/60"
          >
            See the newest real receipt
          </a>
        </div>
      </section>

      {/* 9 — how to read this page (shipped/direction legend + testnet) */}
      <section className="space-y-4 rounded-xl border border-border bg-card p-6">
        <h2 className="text-xl font-bold text-foreground">How to read this page</h2>
        <div className="space-y-3 text-sm md:text-base text-muted leading-relaxed">
          <p>
            <span className="text-foreground font-semibold">Shipped</span> means it is live today and
            you can observe it — the check, the harness, the kernel that refuses anything but a clean,
            bound ALLOW.
          </p>
          <p>
            <span className="text-foreground font-semibold">Direction</span> means we are building
            toward it and say so — an aim we are committed to, not a feature we are claiming. The
            enforced capability sandbox and the example belts beyond the three that exist are marked
            that way for a reason.
          </p>
          <p>
            Everything that runs at all runs on{' '}
            <span className="text-foreground">Base Sepolia testnet</span> — the money there is
            practice money with no value, and the on-chain spend path and escrow are still being
            wired.
          </p>
        </div>
      </section>

      {/* Go deeper */}
      <section className="space-y-3 border-t border-border pt-10">
        <p className="text-xs uppercase tracking-widest text-muted/70 font-semibold">Go deeper</p>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link href="/layers" className="text-accent hover:underline">Sandbox, Guardrail, Harness</Link>
          <Link href="/trust-harness" className="text-accent hover:underline">The trust harness, end to end</Link>
          <Link href="/how-verification" className="text-accent hover:underline">How verification works</Link>
          <Link href="/repid" className="text-accent hover:underline">How RepID is governed</Link>
          <Link href="/earned-trust" className="text-accent hover:underline">What counts as earned</Link>
          <Link href="/belts" className="text-accent hover:underline">Belts and tools</Link>
          <Link href="/glossary" className="text-accent hover:underline">Every term, defined</Link>
          <Link href="/vision" className="text-accent hover:underline">The vision</Link>
        </div>
      </section>
    </main>
  );
}
