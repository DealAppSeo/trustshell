import Link from 'next/link';
import { OG_IMAGE } from '@/lib/site';

export const metadata = {
  title: 'The vision — TrustShell',
  description:
    'It all begins with trust. Trust that is earned. The vision behind TrustShell and the HyperDAG trust layer — a star around one engine, not a pile of new trust systems — with each surface marked for what it is today: shipped or a direction.',
  openGraph: {
    title: 'The vision — TrustShell',
    description:
      'It all begins with trust. Trust that is earned. The vision, and every surface marked shipped or direction — stated as a direction we are committed to, not a victory already won.',
    images: OG_IMAGE,
    type: 'article',
    url: 'https://trustshell.dev/vision',
  },
};

/**
 * /vision — the story page. It leads with Sean's full vision line verbatim (the homepage leads
 * with its opening; the "receipt" clause lands here, where no first-screen honesty ban applies),
 * tells the story, and walks each ecosystem surface tagged for what it actually is TODAY.
 *
 * GUARDRAILS honoured (a public page is permanent):
 *   - Shape only. No scoring formula, no ANFIS parameters, no golden-ratio digit as a tuning
 *     value. The engine's mechanism lives on /how-verification and is linked, not restated.
 *   - No number that cannot be pointed at. The one figure here — the published npm version — is
 *     already on the live site (components/home-agent.tsx) and pinned by tests. No counts, no
 *     percentages, no benchmarks.
 *   - Three states, never two. Each surface carries a shipped/direction tag rendered as readiness
 *     METADATA — muted, never the amber accent, never a verdict colour, never a CTA. "Direction"
 *     is not styled to look like a pass or a product.
 *   - TrustMedical is a door, not a trial. It is stated, in its own words, that it is not a live or
 *     active medical trial, study, or clinical offering.
 *   - Hedged register, matching /mission and /layers: a direction we are committed to, not a
 *     finished product.
 */

type State = 'shipped' | 'direction';

function StateTag({ state }: { state: State }) {
  // Readiness metadata, deliberately NOT the accent and NOT a verdict colour, so it reads as
  // neither a measurement nor a call to action. Shipped is solid; a direction is dashed and
  // hollow. Each carries its word and a shape, so it survives greyscale and colour-vision loss.
  const map: Record<State, { label: string; dashed: boolean }> = {
    shipped: { label: 'Shipped', dashed: false },
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

type Surface = {
  name: string;
  state: State;
  one: string;
  body: string;
  /** The star at the centre of the mesh — called out, not styled louder. */
  star?: boolean;
  link?: { href: string; label: string; external?: boolean };
};

const SURFACES: ReadonlyArray<Surface> = [
  {
    name: 'TrustShell V1',
    state: 'shipped',
    one: 'The stranger path, finished.',
    body:
      'Paste a sentence; two independent model families check it; you see what each one said — Checks out, Caught, or Not checked. The SDK is published on npm as @hyperdag/trustshell (1.6.1). This is the one live product entry point, and it needs no signup and no wallet.',
    link: { href: '/start', label: 'Start here' },
  },
  {
    name: 'The engine — RepID and HAL',
    state: 'shipped',
    star: true,
    one: 'The star at the centre.',
    body:
      'One engine carries the two things every surface leans on: a portable score for how an agent has actually behaved, and a check that runs a claim past independent model families before it counts. Every surface below is a spoke to this engine — not a new trust system of its own. That is the whole shape: a star, not a mesh.',
    link: { href: '/how-verification', label: 'How verification works' },
  },
  {
    name: 'TrustMarket',
    state: 'direction',
    one: 'Agents hiring agents.',
    body:
      'A buy-intent skeleton on x402: an agent posts a capability and a fee, another agent hires it, settlement happens on-chain, and both standings update. It runs on the test network, it is early, and it is honestly incomplete — the shape of the loop before the loop is full.',
    link: { href: '/market', label: 'Open the skeleton' },
  },
  {
    name: 'TrustKeys',
    state: 'direction',
    one: 'A catalog.',
    body:
      'A catalog of the keys an agent and its owner hold, and the policy that governs each — so authority is named and auditable rather than assumed. A direction we are shaping, not a finished surface.',
  },
  {
    name: 'TrustTrader',
    state: 'direction',
    one: 'A paper lane.',
    body:
      'A paper-trading lane: signals and checks with no real money at risk. A place to watch the harness and the check do their work on something that moves, before anything of value is ever committed to it.',
  },
  {
    name: 'TrustGrowth',
    state: 'direction',
    one: 'A CMO draft path that fails closed.',
    body:
      'A marketing-draft path for an agent acting as a CMO. It fails closed against the HAL gate: a draft is produced, the gate decides, and nothing is posted on its own. There is no live post today — the draft is the output, the gate is the point.',
  },
  {
    name: 'TrustMedical',
    state: 'direction',
    one: 'A door, not a trial.',
    body:
      'A future door, and an expression of interest only. It is not a live or active medical trial, not a study, and not a clinical offering, and nothing here should be read as one. If this door ever opens, it opens the way everything else does — behind the same checks and the same honest labels.',
  },
];

export default function VisionPage() {
  return (
    <main className="max-w-4xl mx-auto px-4 py-12 space-y-16">
      {/* Header — the three-beat hero: lead / problem / mechanism. Here the mechanism beat carries
          "You get a receipt" in full; the homepage band drops only that one sentence, because a
          merged honesty test bans the word "receipt" on the home render. */}
      <header className="space-y-4">
        <p className="text-xs uppercase tracking-widest text-accent font-semibold">The vision</p>
        <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground leading-tight">
          It all begins with trust. Trust that is earned.
        </h1>
        <p className="text-base md:text-lg text-muted leading-relaxed max-w-2xl">
          AI lies. It hallucinates, confabulates, and agrees with you just as confidently when you
          push back.
        </p>
        <p className="text-base md:text-lg text-foreground/90 font-medium max-w-2xl">
          TrustShell makes it show the work. Two families check the claim. You get a receipt. If it
          cannot check, it does not pass.
        </p>
      </header>

      {/* The story */}
      <section className="space-y-5">
        <h2 className="text-2xl font-bold text-foreground">What we are building toward</h2>
        <p className="font-display text-xl md:text-2xl font-medium text-foreground leading-snug max-w-2xl [text-wrap:balance]">
          Agents help agents help people, and the receipt is how we know.
        </p>
        <p className="text-sm md:text-base text-muted leading-relaxed max-w-2xl">
          A harness on every agent. A score that moves when a confirmed action helped someone who is
          not the actor. A mesh that is a star around one engine — not a pile of new trust systems.
          Build toward that. Ship the path in front of you.
        </p>
        <p className="text-sm md:text-base text-muted leading-relaxed max-w-2xl">
          The point is people. Agents are getting good enough to act for us, and the useful ones will
          increasingly act <em>through</em> other agents — one hires a second to check a claim, a
          third to carry out a step. For that to help rather than compound the usual harms, two
          things have to be true: an agent has to be <span className="text-foreground">answerable</span>,
          and its standing has to be <span className="text-foreground">earned</span>, not granted by
          whoever happens to host it today.
        </p>
        <p className="text-sm md:text-base text-muted leading-relaxed max-w-2xl">
          Earned is the load-bearing word, and it has a sharp edge: a score should move when a{' '}
          <span className="text-foreground">confirmed action helped someone who is not the actor</span>.
          Helping yourself does not count. That one rule is what separates reputation you can trust
          from a number an agent can farm, and getting it right — so it is hard to game and still fair
          to the smallest player — is the unsolved part we are most deliberate about.
        </p>
        <p className="text-sm md:text-base text-muted leading-relaxed max-w-2xl">
          This page states that as a <span className="text-foreground">direction we are committed to,
          not a victory we have already won</span>. What is live, we mark live. What is ahead, we mark
          ahead. The parts that are still being built are labelled as such on purpose — the fastest way
          to lose trust while building a trust layer is to claim the finished version of it.
        </p>
      </section>

      {/* The shape: a star, not a mesh */}
      <section className="space-y-5">
        <h2 className="text-2xl font-bold text-foreground">A star, not a mesh</h2>
        <p className="text-sm md:text-base text-muted leading-relaxed max-w-2xl">
          It would be easy to answer every new use — a market, a trading lane, a health door — with a
          new trust system of its own. That is a mesh: every surface wired to every other, each one
          another place trust can be defined differently, and the most open door becomes the one
          everyone walks through.
        </p>
        <p className="text-sm md:text-base text-muted leading-relaxed max-w-2xl">
          So we build the opposite. One engine holds the score and the check; every surface is a spoke
          to it, carrying the same identity, the same rules, and the same honest verdicts wherever an
          agent goes. Add a surface and it points at the centre — it does not add a new centre. A star,
          not a mesh, is how trust stays one thing rather than fragmenting into many.
        </p>
        <div className="rounded-xl border border-border bg-card px-5 py-4">
          <p className="text-sm leading-relaxed">
            <span className="text-foreground font-semibold">Why this matters for what you can rely on.</span>{' '}
            <span className="text-muted">
              Because the check and the score live in one place, a verdict you saw on one surface means
              the same thing on the next. The surfaces can come and go; the thing that decides whether
              an agent is answerable does not move with them.
            </span>
          </p>
        </div>
      </section>

      {/* The surfaces, each tagged */}
      <section className="space-y-5">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">The surfaces, marked for what they are</h2>
          <p className="text-sm text-muted leading-relaxed max-w-2xl">
            Some of these are shipped and some are a direction. The tag on each says which — and{' '}
            <span className="text-foreground">a direction is an aim, not a quiet promise</span>. This is
            not a registry of everything in the ecosystem; it is the paths in front of us, said plainly.
          </p>
        </div>
        <div className="space-y-3">
          {SURFACES.map((s) => (
            <SurfaceCard key={s.name} surface={s} />
          ))}
        </div>
      </section>

      {/* Honest status, matching /mission's register */}
      <section className="space-y-4 rounded-xl border border-border bg-card p-6">
        <h2 className="text-xl font-bold text-foreground">Honestly stated: how to read this page</h2>
        <div className="space-y-3 text-sm md:text-base text-muted leading-relaxed">
          <p>
            <span className="text-foreground font-semibold">Shipped</span> means it is live today and
            you can use it now — the check, and the engine behind it. The check runs past independent
            model families and lands on one of three results: Checks out, Caught, or Not checked. Not
            checked is never a quiet yes; it fails closed.
          </p>
          <p>
            <span className="text-foreground font-semibold">Direction</span> means we are building
            toward it and say so. It is an aim we are committed to, not a feature we are claiming. Where
            a surface runs at all, it runs on <span className="text-foreground">Base Sepolia testnet</span> —
            the money there is practice money with no value.
          </p>
        </div>
      </section>

      {/* Go deeper */}
      <section className="space-y-3 border-t border-border pt-10">
        <p className="text-xs uppercase tracking-widest text-muted/70 font-semibold">Go deeper</p>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link href="/check" className="text-accent hover:underline">Run a check</Link>
          <Link href="/how-verification" className="text-accent hover:underline">How verification works</Link>
          <Link href="/layers" className="text-accent hover:underline">Sandbox, Guardrail, Harness</Link>
          <Link href="/trust-harness" className="text-accent hover:underline">The trust harness, end to end</Link>
          <Link href="/mission" className="text-accent hover:underline">Why this is built this way</Link>
          <Link href="/repid" className="text-accent hover:underline">How the score is governed</Link>
          <Link href="/" className="text-accent hover:underline">Back to the home page</Link>
        </div>
      </section>
    </main>
  );
}

function SurfaceCard({ surface }: { surface: Surface }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="text-lg font-semibold text-foreground">{surface.name}</h3>
        <StateTag state={surface.state} />
        {surface.star && (
          <span className="text-[10px] font-semibold uppercase tracking-widest text-accent">
            Star centre
          </span>
        )}
      </div>
      <p className="text-sm font-medium text-foreground/90">{surface.one}</p>
      <p className="text-sm text-muted leading-relaxed">{surface.body}</p>
      {surface.link && (
        <p className="pt-1">
          <Link
            href={surface.link.href}
            className="inline-flex items-center gap-1 text-sm font-semibold text-accent underline-offset-4 hover:underline"
          >
            {surface.link.label}
            <span aria-hidden="true">→</span>
          </Link>
        </p>
      )}
    </div>
  );
}
