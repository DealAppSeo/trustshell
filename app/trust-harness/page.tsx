import Link from 'next/link';
import { JourneySteps } from '@/components/journey-steps';

export const metadata = {
  title: 'The trust harness — TrustShell',
  description:
    'A sandbox limits where an agent can reach, a guardrail limits what it can try, and a harness is the signed record that travels with it. Together they make an agent both safer and cheaper: it earns trust, learns skills, uses tools, and unlocks autonomy inside a ceiling its owner already signed.',
};

/**
 * /trust-harness — the full arc in one page.
 *
 * It extends /layers (the sandbox/guardrail/harness spine) and /why/harness (the
 * portable-across-models prose) with the half those pages under-tell: that the three controls are
 * there for EFFICIENCY as much as safety, and that autonomy is a ladder an agent climbs — earn
 * trust, learn skills, use tools, unlock more — always inside a ceiling the person already signed.
 *
 * SHAPE ONLY. The reputation tier bands, the fixed score deltas, the clamp and the redemption
 * cadence are engine numbers and are NOT restated here — they live, open by design, on /repid, and
 * this page links there instead of copying them. The router picks models; it does not grade. Nothing
 * is claimed as shipped that is not, and the forward-looking pieces are tagged.
 */

type Tag = 'shipped' | 'rolling' | 'roadmap';

function ClaimTag({ tag }: { tag: Tag }) {
  const map: Record<Tag, { label: string; dashed: boolean }> = {
    shipped: { label: 'Shipped today', dashed: false },
    rolling: { label: 'Rolling out', dashed: true },
    roadmap: { label: 'Roadmap', dashed: true },
  };
  const { label, dashed } = map[tag];
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted ${
        dashed ? 'border-dashed border-border' : 'border-border bg-card'
      }`}
    >
      {label}
    </span>
  );
}

type Control = { name: string; verb: string; one: string; safety: string; efficiency: string };

const CONTROLS: ReadonlyArray<Control> = [
  {
    name: 'Sandbox',
    verb: 'limits WHERE',
    one: 'A room: the files, hosts and money the agent can reach at all.',
    safety: 'A prompt injection that lands still cannot touch what the room walls off.',
    efficiency: 'A specialist only needs its own corner, so you run a smaller, cheaper model in a tighter space instead of one giant one with the run of the house.',
  },
  {
    name: 'Guardrail',
    verb: 'limits WHAT',
    one: 'A rule the agent cannot edit: a schema, a payee list, an amount, a two-family check.',
    safety: 'The limit is named, not hoped for — this tool, this host, this cap. A jailbreak cannot argue it away.',
    efficiency: 'A typed, bounded task is one a small model can do reliably. The guardrail is what makes cheap models safe to delegate to.',
  },
  {
    name: 'Harness',
    verb: 'the signed RECORD',
    one: 'Who owns the agent, what it agreed to, and what it has earned — carried across every surface.',
    safety: 'A person is at the root. The owner revokes, and everything under that grant stops at once.',
    efficiency: 'Standing travels with the agent, not the vendor, so switching to a cheaper or better model is a routing change, not starting over.',
  },
];

export default function TrustHarnessPage() {
  return (
    <main className="max-w-4xl mx-auto px-4 py-12 space-y-16">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-accent font-semibold">
          TrustShell · the trust harness
        </p>
        <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground leading-tight">
          Earned autonomy, inside a signed ceiling
        </h1>
        <p className="text-lg md:text-xl text-foreground/90 font-medium">
          Safer and cheaper are the same design, not a trade.
        </p>
        <p className="text-base md:text-lg text-muted leading-relaxed max-w-2xl">
          Three controls work together: a <span className="text-foreground">sandbox</span> limits
          where an agent can reach, a <span className="text-foreground">guardrail</span> limits what
          it can try, and a <span className="text-foreground">harness</span> is the signed record
          that travels with it. An agent earns trust, learns skills, uses tools, and unlocks more
          autonomy — but only ever inside a ceiling the person already signed. The same structure
          that keeps it safe is what lets it run on small, cheap models.
        </p>
      </header>

      {/* 1 — three in one, safety AND efficiency */}
      <section className="space-y-5">
        <h2 className="text-2xl font-bold text-foreground">Three controls, pulling the same direction</h2>
        <p className="text-sm text-muted leading-relaxed max-w-2xl">
          Each one is blind to exactly what the others catch, so you need all three —{' '}
          <Link href="/layers" className="text-accent hover:underline">/layers</Link> is the deeper
          tour. The part told less often: the same three controls are what make an agent cheap to run.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {CONTROLS.map((c) => (
            <div key={c.name} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
              <div>
                <p className="text-xl font-bold text-foreground">{c.name}</p>
                <p className="text-[11px] uppercase tracking-widest text-accent font-semibold mt-0.5">
                  {c.verb}
                </p>
              </div>
              <p className="text-sm text-muted leading-relaxed">{c.one}</p>
              <div className="pt-3 border-t border-border/40 space-y-2">
                <p className="text-xs leading-relaxed">
                  <span className="text-[#2dd4bf] font-semibold uppercase tracking-wider text-[10px]">Safety</span>{' '}
                  <span className="text-muted">{c.safety}</span>
                </p>
                <p className="text-xs leading-relaxed">
                  <span className="text-accent font-semibold uppercase tracking-wider text-[10px]">Efficiency</span>{' '}
                  <span className="text-muted">{c.efficiency}</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 2 — the ladder */}
      <section className="space-y-5">
        <h2 className="text-2xl font-bold text-foreground">The ladder: earn trust, then climb</h2>
        <p className="text-sm text-muted leading-relaxed max-w-2xl">
          Autonomy is not granted up front; it is earned and it is reversible. An agent starts
          narrow, builds a record of checked behaviour, and that record is what widens — or, after a
          bad call, narrows — the band it is allowed to act in.
        </p>
        <div className="rounded-xl border border-border bg-card p-5">
          <JourneySteps />
        </div>
        <ol className="space-y-3">
          <li className="rounded-xl border border-border bg-card p-5">
            <p className="font-semibold text-foreground">Earn trust</p>
            <p className="mt-1 text-sm text-muted leading-relaxed">
              Behaviour that checks out builds a portable reputation. A clean streak can restore a
              band the owner granted — it can never raise the cap above what the person signed. A
              Caught, an off-list payee, or a dispute drops the band and asks the person.
            </p>
          </li>
          <li className="rounded-xl border border-border bg-card p-5">
            <p className="font-semibold text-foreground">Learn skills, then use tools</p>
            <p className="mt-1 text-sm text-muted leading-relaxed">
              Skills are added read-only first; the tools that spend, post, or cannot be undone sit
              behind the higher bands. More standing unlocks more reach — never the reverse order.
            </p>
          </li>
          <li className="rounded-xl border border-border bg-card p-5">
            <p className="font-semibold text-foreground">Unlock autonomy, inside the ceiling</p>
            <p className="mt-1 text-sm text-muted leading-relaxed">
              The ceiling is a grant the owner signs once: a cap, a payee list, an expiry, a purpose.
              Lowering the cap and pulling the grant happen immediately; raising it waits and can be
              cancelled. On money and health, a person still breaks the tie. A rented agent gets the
              session, not the key, the memory, or root.
            </p>
          </li>
        </ol>
        <p className="text-xs text-muted/70 leading-relaxed max-w-2xl">
          The tier bands, the exact score moves and the restore cadence are engine governance and are
          published, open by design, on <Link href="/repid" className="text-accent hover:underline">/repid</Link> —
          this page describes the shape and links there rather than restating the numbers.
        </p>
      </section>

      {/* 3 — why more than one family checks a claim. TODAY: two families on /check. The third vote and the
          golden-ratio supermajority are the design target (see /how-verification), tagged Roadmap. */}
      <section className="space-y-5">
        <h2 className="text-2xl font-bold text-foreground">Why more than one family checks a claim</h2>
        <p className="text-sm text-muted leading-relaxed max-w-2xl">
          <ClaimTag tag="shipped" /> Today the check on{' '}
          <Link href="/check" className="text-accent hover:underline">/check</Link> asks two model
          families, from different builders, and both must agree for a pass. A lone FALSE flags the
          claim, and a lone TRUE with no independent second abstains, so one family that is wrong or
          offline cannot carry a verdict alone. This is the same principle as{' '}
          <Link href="/how-verification" className="text-accent hover:underline">disjoint-family verification</Link>.
        </p>
        <p className="text-sm text-muted leading-relaxed max-w-2xl">
          <ClaimTag tag="roadmap" /> The design goes further, and none of this runs today. A third vote
          from a different family would break a tie without letting one lineage decide alone, and
          agreement would have to clear a golden-ratio supermajority across more families. A split
          would be handled honestly: a clear supermajority would be a real result, while a{' '}
          <span className="text-foreground">2&#8211;1</span> split would only set a{' '}
          <em>provisional</em> label and <span className="text-foreground">not move the score</span>. A
          bare majority is a note that something is contested, not a verdict that it is settled.
        </p>
        <p className="text-sm text-muted leading-relaxed max-w-2xl">
          Neither writes anything to a score on this site. How scores do move is documented on{' '}
          <Link href="/repid" className="text-accent hover:underline">/repid</Link>.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-5 space-y-2">
            <p className="font-semibold text-foreground">Design: a clear supermajority</p>
            <ClaimTag tag="roadmap" />
            <p className="text-sm text-muted leading-relaxed">
              Independent families would clear the bar. It would count as a real check. A check on this
              site writes nothing to a score.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 space-y-2">
            <p className="font-semibold text-foreground">Design: a 2&#8211;1 split</p>
            <ClaimTag tag="roadmap" />
            <p className="text-sm text-muted leading-relaxed">
              Not a clean result, so it would not be treated as one. The label would record the
              disagreement; the score would stay where it was.
            </p>
          </div>
        </div>
      </section>

      {/* 4 — the intelligent router */}
      <section className="space-y-5">
        <h2 className="text-2xl font-bold text-foreground">
          The router: cheaper <em>because</em> safer <ClaimTag tag="shipped" />
        </h2>
        <p className="text-sm text-muted leading-relaxed max-w-2xl">
          Behind the check is a router over many models — open-source LLMs and specialized small
          models (SLMs), each good at a narrow job. Work routes to free-tier models first and reaches
          paid ones only when the free tier is exhausted or the task needs more, with the paid
          fallbacks ordered cheapest-first.
        </p>
        <p className="text-sm text-muted leading-relaxed max-w-2xl">
          That is where safety and cost stop fighting. Because each check only needs a handful of
          <em> independent</em> families — not one enormous model doing everything — more
          independence is also <em>cheaper</em> per check. Adding a decorrelated family hardens the
          quorum and lowers the bill at the same time. The router chooses who answers; it does not
          grade the answer — grading is the families&apos; job, and the constitutional-audit layer
          that would add a fuzzy score on top is a gated-off stub, carrying no weight today.
        </p>
      </section>

      {/* 5 — skills & tools surface */}
      <section className="space-y-5">
        <h2 className="text-2xl font-bold text-foreground">Skills and tools: a note is not an install</h2>
        <p className="text-sm text-muted leading-relaxed max-w-2xl">
          The skills and tools surface is built to do less than it looks like — on purpose, because a
          control that reads as doing more than it does is worse than none.
        </p>
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="font-semibold text-foreground">Picking a belt is a note in your browser</p>
            <p className="mt-1 text-sm text-muted leading-relaxed">
              Choosing a belt writes a preference down locally. It does not give any agent a role and
              it installs nothing. A role is a <span className="text-foreground">signed grant</span>{' '}
              another app can check — made on the Agents page, not by a click here. The tools a belt
              lists start read-only, with the setting that keeps them read-only shown beside each one.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="font-semibold text-foreground">Suggesting a skill stores a link, nothing more</p>
            <p className="mt-1 text-sm text-muted leading-relaxed">
              The box keeps the link, in your browser. It does not install, download, run, fetch or
              even open it — the saved address is shown as plain text, not a clickable link, so there
              is no action from that screen that reaches it.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/belts"
            className="rounded-md border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-card/60"
          >
            Pick a belt
          </Link>
          <Link
            href="/pai"
            className="rounded-md border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-card/60"
          >
            Meet the PAI
          </Link>
        </div>
      </section>

      {/* 6 — try it */}
      <section className="space-y-4 rounded-xl border border-border bg-card p-6">
        <h2 className="text-xl font-bold text-foreground">Try the harness</h2>
        <p className="text-sm text-muted leading-relaxed max-w-2xl">
          The PAI is the agent at the root that holds the session. Claiming an agent is the signature
          that makes it yours. Both run on Base Sepolia testnet — the money there is practice money
          with no value, and the on-chain spend path and escrow are still being wired.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/pai"
            className="rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:brightness-110"
          >
            Start with the PAI
          </Link>
          <Link
            href="/bind"
            className="rounded-md border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-card/60"
          >
            Claim an agent
          </Link>
        </div>
      </section>

      {/* Related */}
      <section className="space-y-3 border-t border-border pt-10">
        <p className="text-xs uppercase tracking-widest text-muted/70 font-semibold">Go deeper</p>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link href="/layers" className="text-accent hover:underline">Sandbox, Guardrail, Harness</Link>
          <Link href="/how-verification" className="text-accent hover:underline">How verification works</Link>
          <Link href="/why/harness" className="text-accent hover:underline">A check you can carry</Link>
          <Link href="/repid" className="text-accent hover:underline">How RepID is governed</Link>
          <Link href="/belts" className="text-accent hover:underline">Belts and tools</Link>
        </div>
      </section>
    </main>
  );
}
