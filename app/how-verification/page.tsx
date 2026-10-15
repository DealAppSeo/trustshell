import Link from 'next/link';
import { CompatibilityInfo } from '@/components/compatibility-info';
import { TrustBadge } from '@/components/trust-state';

export const metadata = {
  title: 'Disjoint-family verification — TrustShell',
  description:
    'Why a claim is checked by uncorrelated model families, why two must agree so no single provider’s bias or outage can fake a pass, and the golden-ratio supermajority on the roadmap. What HAL fact-check looks at, and what "Not checked" means.',
};

/**
 * /how-verification — "Disjoint-family verification × HAL", the canonical mechanism page.
 *
 * It pulls together one-liners that were scattered across /layers (beat 3), /mission (the
 * "SBFA — decorrelated validators" paragraph), /why/harness and the check form into one home for
 * the question: why do many uncorrelated model families plus a golden-ratio quorum mean no one
 * provider's bias or outage can fake a PASS, and what does "Not checked" actually mean.
 *
 * SHAPE ONLY. The scoring formula, the fuzzy-routing parameters, the exact signal thresholds and
 * the numeric reputation constants are deliberately NOT on this page — they are engine internals,
 * and a public explainer that printed them would be leaking tuning, not teaching a mechanism. The
 * golden-ratio supermajority is named by its shape (phi-inverse), never reduced to a tuning table.
 * Every forward-looking claim is tagged, in the same hedged register /layers and /mission use for
 * themselves.
 */

type Tag = 'shipped' | 'rolling' | 'roadmap';

function ClaimTag({ tag }: { tag: Tag }) {
  // Metadata about readiness — deliberately NOT a verdict colour and NOT the accent, so it reads
  // as neither a measurement nor a call to action. Shipped is solid; anything not-yet is dashed.
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

type Signal = { name: string; reads: string; field: string; source: string };

// Qualitative only — WHAT each signal looks at, never a threshold or a weight. The numbers that
// turn these into a verdict are engine tuning and stay off a public page.
const SIGNALS: ReadonlyArray<Signal> = [
  {
    name: 'Evidence grounding',
    reads: 'Is the claim supported by something retrievable, or asserted into the air? A fluent sentence with nothing behind it is the common shape of a fabrication.',
    field: 'evidenceQuality',
    source: 'whatever the engine returns; the SDK reads 0 when it is absent',
  },
  {
    name: 'Confidence vs. content',
    reads: 'How sure the wording sounds, set against how much the answer actually commits to. Stated certainty that outruns the evidence is a flag, not a pass.',
    field: 'certaintyAtClaim',
    source: 'whatever the engine returns; the SDK reads 0 when it is absent',
  },
  {
    name: 'Scope',
    reads: 'Did the answer stay inside what was asked, or drift into territory it was never given? Drift is where confident, off-topic invention lives.',
    field: 'scopeAppropriateness',
    source: 'whatever the engine returns; the SDK reads 0 when it is absent',
  },
  {
    name: 'Model uncertainty',
    reads: 'The genuine spread in the underlying model’s own distribution for this prompt — the difference between "it knows" and "it is guessing smoothly".',
    field: 'epistemicUncertainty',
    source: 'the style-only extractor',
  },
  {
    name: 'Harm',
    reads: 'Whether the output carries a safety risk worth stopping before it reaches anything that can act on it.',
    field: 'harmProbability',
    source: 'the style-only extractor',
  },
];

type Outcome = {
  word: string;
  state: 'MEASURED' | 'NOT_CHECKED' | 'FAILED';
  means: string;
  blocks: string;
};

const OUTCOMES: ReadonlyArray<Outcome> = [
  {
    word: 'Checks out',
    state: 'MEASURED',
    means: 'Two independent families looked at the claim and agreed it holds.',
    blocks: 'Nothing — this is the clean result. It counts as a real check. A check on this site writes nothing to a score.',
  },
  {
    word: 'Caught',
    state: 'FAILED',
    means: 'A family found the claim false. A lone FALSE flags; it never quietly passes.',
    blocks: 'The claim is marked caught, with the reason attached, so a reader sees what failed and why.',
  },
  {
    word: 'Not checked',
    state: 'NOT_CHECKED',
    means: 'No independent pair could answer — a family was down, abstained, or the two did not agree. It is an absence of a verdict, not a quiet yes.',
    blocks: 'Everything gated behind a check. Not checked fails closed: it never passes by default.',
  },
];

export default function HowVerificationPage() {
  return (
    <main className="max-w-4xl mx-auto px-4 py-12 space-y-16">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-accent font-semibold">
          TrustShell · how verification works
        </p>
        <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground leading-tight">
          Disjoint-family verification
        </h1>
        <p className="text-lg md:text-xl text-foreground/90 font-medium">
          Why no single model gets to grade its own homework.
        </p>
        <p className="text-base md:text-lg text-muted leading-relaxed max-w-2xl">
          A check is only worth as much as the independence behind it. Today TrustShell runs a claim
          past <span className="text-foreground">two uncorrelated model families</span> and both must
          agree for a pass — so one provider&apos;s bias, or one provider&apos;s outage, cannot fake
          one. A <span className="text-foreground">golden-ratio supermajority</span> across more
          families is the design target, not what runs (see the Roadmap section below). When
          independence is not there, the honest answer is{' '}
          <span className="text-foreground">Not checked</span>, and that is never a quiet yes.
        </p>
      </header>

      {/* 1 — the problem */}
      <section className="space-y-5">
        <h2 className="text-2xl font-bold text-foreground">The problem: a model marking its own work</h2>
        <p className="text-sm text-muted leading-relaxed max-w-2xl">
          Ask a model whether its own answer is true and you mostly learn how confident it is, not
          whether it is right. Ask a <em>second</em> model from the same lineage and you have barely
          moved: models trained on overlapping data in overlapping ways share the same blind spots,
          so they tend to be wrong in the same places at the same time. Two confident agreements from
          one family is one opinion said twice.
        </p>
        <p className="text-sm text-muted leading-relaxed max-w-2xl">
          Correlated error is the whole trap. A verifier that fails exactly where the thing it checks
          fails adds no safety — it just adds volume. The only cross-check that buys you anything is
          one that fails <em>differently</em>.
        </p>
      </section>

      {/* 2 — disjoint families + live quorum card */}
      <section className="space-y-5">
        <h2 className="text-2xl font-bold text-foreground">The fix: families that fail differently</h2>
        <p className="text-sm text-muted leading-relaxed max-w-2xl">
          So the check is spread across <span className="text-foreground">different model families</span> —
          different builders, different training, different failure modes. Two of them must agree before
          a claim is allowed to count. A lone FALSE flags the claim; a lone TRUE, with no independent
          second, abstains. There is no path where one family alone produces a clean pass.
        </p>
        <CompatibilityInfo />
        <p className="text-xs text-muted/70 leading-relaxed max-w-2xl">
          The card above reads the quorum straight from the engine. If the number is not showing, the
          engine could not be reached from your browser just now — the page says so rather than
          printing a figure it did not read.
        </p>
      </section>

      {/* 3 — why this is Byzantine-fault-tolerant */}
      <section className="space-y-5">
        <h2 className="text-2xl font-bold text-foreground">
          Why a bare majority is not enough <ClaimTag tag="roadmap" />
        </h2>
        <p className="text-sm text-muted leading-relaxed max-w-2xl">
          Two out of three is a majority. It is not truth. If a third of your voters can be wrong
          together — or captured together — a simple majority is exactly what a coordinated failure
          produces. Systems that have to agree in the presence of faulty or adversarial participants
          do not settle for a majority; they demand a <span className="text-foreground">supermajority</span>,
          a margin wide enough that the honest votes still carry even when some votes do not.
        </p>
        <p className="text-sm text-muted leading-relaxed max-w-2xl">
          TrustShell&apos;s consensus design sets that bar at a{' '}
          <span className="text-foreground">golden-ratio supermajority (&phi;&#8315;&sup1;)</span> — a
          threshold drawn from the proportion rather than a round number picked for looks. In that
          design, agreement has to clear that line before a claim counts, and agreement that is{' '}
          <em>too</em> perfect is treated as a signal to look again, not as extra confidence. It is a
          hypothesis, not yet validated on real data, and not a production guarantee.
        </p>
        <p className="text-sm text-muted leading-relaxed max-w-2xl">
          What runs today is the two-checker label: two model families must agree, and the answer is{' '}
          <span className="text-foreground">pass</span>, <span className="text-foreground">veto</span> or{' '}
          <span className="text-foreground">not-checked</span>. Not-checked is never a pass, so losing a
          family does not silently flip a claim to a pass.
        </p>
        <div className="rounded-xl border border-border bg-card px-5 py-4">
          <p className="text-sm leading-relaxed">
            <span className="text-foreground font-semibold">The shape of the guarantee.</span>{' '}
            <span className="text-muted">
              No one provider is load-bearing. A family that is biased, captured, or simply offline
              cannot carry a verdict on its own, and cannot block the others from reaching one. That is
              the property a single model — however good — can never have about itself.
            </span>
          </p>
        </div>
      </section>

      {/* 4 — what HAL fact-check looks at */}
      <section className="space-y-5">
        <h2 className="text-2xl font-bold text-foreground">
          What HAL’s five signals are, and where they come from
        </h2>
        <p className="text-sm text-muted leading-relaxed max-w-2xl">
          The SDK’s score result carries five signal fields. By the client code, the fact-check quorum
          returns the providers and families that answered, each with a verdict, while the style-only
          extractor returns the harm and epistemic fields; a signal the engine does not return reads 0
          in the SDK. So these are a style analysis, and they are not what decides Checks out or
          Caught on /check — that is the family vote. The check on this site returns a label and the
          votes; it does not return these signals. They are described by <em>what they look at</em>,
          not by the weights or thresholds that turn them into a number — those are engine internals.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {SIGNALS.map((s) => (
            <div key={s.name} className="rounded-xl border border-border bg-card p-5 space-y-2">
              <p className="font-semibold text-foreground">{s.name}</p>
              <p className="text-sm text-muted leading-relaxed">{s.reads}</p>
              <p className="text-[11px] text-muted/70 leading-relaxed">
                SDK field <code>{s.field}</code> · from {s.source}
              </p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted/70 leading-relaxed max-w-2xl">
          The router that decides which models answer is just that — a router. It picks who checks;
          it does not itself grade the claim.
        </p>
      </section>

      {/* 5 — the three outcomes + the partial gating tag */}
      <section className="space-y-5">
        <h2 className="text-2xl font-bold text-foreground">Three outcomes, never two</h2>
        <p className="text-sm text-muted leading-relaxed max-w-2xl">
          Every check lands on one of three results, and they render through the one component the
          whole product uses for a verdict — so &quot;we did not look&quot; can never be painted the
          colour of &quot;it passed&quot;. Not checked is neutral on purpose: it asserts nothing,
          because nothing was measured.
        </p>
        <div className="space-y-3">
          {OUTCOMES.map((o) => (
            <div key={o.word} className="rounded-xl border border-border bg-card p-5 space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-lg font-semibold text-foreground">{o.word}</span>
                <TrustBadge state={o.state} />
              </div>
              <p className="text-sm text-muted leading-relaxed">{o.means}</p>
              <p className="text-xs leading-relaxed">
                <span className="text-foreground/80 font-semibold uppercase tracking-wider text-[10px]">
                  What it gates
                </span>{' '}
                <span className="text-muted">{o.blocks}</span>
              </p>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-dashed border-border bg-card/50 px-5 py-4 space-y-2">
          <p className="text-sm leading-relaxed">
            <span className="text-foreground font-semibold">What runs live today, said exactly.</span>{' '}
            <ClaimTag tag="rolling" />
          </p>
          <p className="text-sm text-muted leading-relaxed">
            Verification runs live on every check you run on <Link href="/check" className="text-accent hover:underline">/check</Link>{' '}
            today. The contract is that a Not-checked result also blocks a post and a spend — and the
            automatic post/spend gating that enforces it is rolling out. Where it is not yet wired, it
            reads Not checked and fails closed. So this page does not claim every post in production is
            gated live; it claims the check is live, and the gating is the contract we are shipping to.
          </p>
        </div>
      </section>

      {/* 6 — see it / evidence */}
      <section className="space-y-4 rounded-xl border border-border bg-card p-6">
        <h2 className="text-xl font-bold text-foreground">See it run, and see the evidence</h2>
        <p className="text-sm text-muted leading-relaxed max-w-2xl">
          The check is the one piece you can run right now with nothing installed. The receipt and the
          model card are the evidence behind a verdict — what was checked, by which families, and what
          they said.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/check"
            className="rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:brightness-110"
          >
            Check a sentence
          </Link>
          <Link
            href="/hal-receipt"
            className="rounded-md border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-card/60"
          >
            See a receipt
          </Link>
          <Link
            href="/model-card"
            className="rounded-md border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-card/60"
          >
            Read the model card
          </Link>
        </div>
        <p className="text-xs text-muted/70 leading-relaxed">
          The receipt page is a fixture — it shows the shape of a real receipt, not a live one. The
          whole journey runs on Base Sepolia testnet; the money there is practice money with no value.
        </p>
      </section>

      {/* Related */}
      <section className="space-y-3 border-t border-border pt-10">
        <p className="text-xs uppercase tracking-widest text-muted/70 font-semibold">Go deeper</p>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link href="/layers" className="text-accent hover:underline">Sandbox, Guardrail, Harness</Link>
          <Link href="/trust-harness" className="text-accent hover:underline">The trust harness, end to end</Link>
          <Link href="/mission" className="text-accent hover:underline">Why this is built this way</Link>
          <Link href="/why/harness" className="text-accent hover:underline">A check you can carry</Link>
          <Link href="/repid" className="text-accent hover:underline">How RepID is governed</Link>
          <Link href="/vision" className="text-accent hover:underline">The vision</Link>
        </div>
      </section>
    </main>
  );
}
