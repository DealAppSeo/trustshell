import Link from 'next/link';
import { OG_IMAGE } from '@/lib/site';

export const metadata = {
  title: 'TrustMedical — a door, not a trial',
  description:
    'TrustMedical is a direction, not a product. The shape of the door: a person opts in and shares a proof instead of a record — an attestation that something is true, not the medical record behind it — so only the fields a study needs ever cross. It is not a live or active medical trial, not a study, and not a clinical offering.',
  openGraph: {
    title: 'TrustMedical — a door, not a trial',
    description:
      'A direction we are committed to, not a victory already won: opt in, share a proof instead of a record, and only the fields a study needs cross. Not a live trial, not study enrollment, not a clinical offering.',
    images: OG_IMAGE,
    type: 'article',
    url: 'https://trustshell.dev/trust-medical',
  },
};

/**
 * /trust-medical — the TrustMedical "door" page. Its own short route, listed on /vision as a
 * `direction` surface and linked from the footer and the sitemap (lib/site.ts). It is a plain
 * static server component — no dynamic APIs, no data fetch — so it prerenders at build time.
 *
 * GUARDRAILS honoured (a public page is permanent, and this one is about health, so the bar is
 * maximal):
 *   - A DOOR, NOT A TRIAL. It is stated, in its own words and more than once, that this is not a
 *     live or active clinical trial, not study enrollment, and not a medical offering. The page
 *     carries the house readiness tag reading "Direction" — muted, dashed, never the amber accent,
 *     never a verdict colour, never styled as a CTA — so it reads as a direction, not a product.
 *   - NO NUMBER. There is no efficacy, accuracy, enrollment, or outcome figure of any kind; the
 *     shape is described in words. No scoring formula, no ANFIS parameters, no golden-ratio digit.
 *   - NO LIVE PATIENT DATA, NO PHI, NO REAL PERSON. The single example is plainly hypothetical and
 *     labelled as illustrative.
 *   - Hedged register, matching /vision, /layers and /mission: a direction we are committed to,
 *     not a finished product — and the parts that are ahead are labelled as ahead on purpose.
 */

/**
 * The same readiness metadata the /vision surface cards use (app/vision/page.tsx): muted, dashed
 * and hollow, never the amber accent and never a verdict colour, so it reads as neither a
 * measurement nor a call to action. It carries its word AND a shape, so it survives greyscale and
 * colour-vision loss.
 */
function DirectionTag() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-dashed border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted">
      <span
        aria-hidden="true"
        className="inline-block h-1.5 w-1.5 rounded-full border border-muted"
      />
      Direction
    </span>
  );
}

type Beat = { step: string; one: string; body: string };

/**
 * The door, told as three beats — consent-first, a proof not a dossier, minimal disclosure. Each
 * describes the SHAPE of the idea; the page frames the whole of it as a direction, not a thing you
 * can do today.
 */
const BEATS: ReadonlyArray<Beat> = [
  {
    step: 'A person opts in',
    one: 'The door only opens from the inside.',
    body:
      'Nothing moves until a person chooses it, for a purpose they can see. Opting in is the first beat, not a box ticked after the fact — and a choice made can be a choice withdrawn. If there is no opt-in, there is no door.',
  },
  {
    step: 'A proof instead of a record',
    one: 'Share that something is true — not the thing that proves it.',
    body:
      'Rather than hand over a medical record, a person would share a cryptographic attestation: a proof that a specific fact holds, which the other side can check without ever receiving the record underneath it. A proof, not a dossier — the claim crosses, the file stays home.',
  },
  {
    step: 'Only the fields the study needs',
    one: 'The minimum crosses the threshold. Nothing more.',
    body:
      'A study asks for the few facts its protocol actually requires, and only those cross. Everything else stays where it lives. Minimal disclosure is the design of the door, not a setting someone has to go and find.',
  },
];

export default function TrustMedicalPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12 space-y-16">
      {/* Header — eyebrow + H1 + the lead, with the readiness tag stated right beside the title so
          the "direction, not a product" frame is the first thing read, not a footnote. */}
      <header className="space-y-4">
        <p className="text-xs uppercase tracking-widest text-accent font-semibold">TrustMedical</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground leading-tight">
            A door, not a trial.
          </h1>
          <DirectionTag />
        </div>
        <p className="text-base md:text-lg text-muted leading-relaxed max-w-2xl">
          TrustMedical is a <span className="text-foreground">direction we are committed to, not a
          victory we have already won</span>. This page describes the shape of a door we would want
          to build — consent-first, and designed so a person shares a proof rather than a record.
        </p>
        <p className="text-base md:text-lg text-foreground/90 font-medium max-w-2xl">
          It is not a live or active medical trial. It is not study enrollment. It is not a clinical
          offering, and nothing here should be read as one.
        </p>
      </header>

      {/* The three-beat story */}
      <section className="space-y-5">
        <h2 className="text-2xl font-bold text-foreground">The shape of the door</h2>
        <p className="text-sm md:text-base text-muted leading-relaxed max-w-2xl">
          Most ways of sharing health information move the record itself — the whole file travels so
          that one fact inside it can be read. The door we would want to build does the opposite: the
          fact travels, and the file stays put. Three beats describe it.
        </p>
        <ol className="space-y-3">
          {BEATS.map((beat, i) => (
            <li key={beat.step} className="rounded-xl border border-border bg-card p-5 space-y-2">
              <div className="flex items-baseline gap-3">
                <span
                  aria-hidden="true"
                  className="font-display text-sm font-semibold text-muted tabular-nums"
                >
                  {i + 1}
                </span>
                <h3 className="text-lg font-semibold text-foreground">{beat.step}</h3>
              </div>
              <p className="text-sm font-medium text-foreground/90">{beat.one}</p>
              <p className="text-sm text-muted leading-relaxed">{beat.body}</p>
            </li>
          ))}
        </ol>
        <p className="text-sm md:text-base text-muted leading-relaxed max-w-2xl">
          That is the whole of it: <span className="text-foreground">consent-first, minimal
          disclosure, a proof not a dossier</span>. The point of a door is that it has a near side
          and a far side, and that the person stands on the near side and decides.
        </p>
      </section>

      {/* One plainly illustrative example — no real person, no real data, no number. */}
      <section className="space-y-5">
        <h2 className="text-2xl font-bold text-foreground">What this could look like</h2>
        <div className="rounded-xl border border-border bg-card px-5 py-4 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted/70">
            Illustrative only — not a real person, study, or result
          </p>
          <p className="text-sm leading-relaxed text-muted">
            Imagine a study that needs to confirm a single eligibility fact — say, that someone meets
            a condition its protocol sets — before anything else happens. In the shape above, the
            person opts in, a proof that the fact holds is what crosses, and the study is satisfied
            without ever receiving the record that proves it. The example is made up to show the
            shape; it is not a thing anyone can do here today.
          </p>
        </div>
      </section>

      {/* It is a spoke to the one engine — the star-not-a-mesh point from /vision, restated here. */}
      <section className="space-y-5">
        <h2 className="text-2xl font-bold text-foreground">Behind the same engine as everything else</h2>
        <p className="text-sm md:text-base text-muted leading-relaxed max-w-2xl">
          If this door ever opens, it does not get a trust system of its own. It is a spoke to the one
          engine every surface leans on — the same portable record of how an agent has actually
          behaved, and the same check that runs a claim past independent model families before it
          counts. A new surface points at the centre; it does not add a new centre. A star, not a
          mesh.
        </p>
        <p className="text-sm md:text-base text-muted leading-relaxed max-w-2xl">
          That is why the honesty rules are the same here as anywhere. A result that cannot be checked
          is never a quiet yes; it fails closed. Not checked is said out loud rather than rounded up
          to a pass — most of all where the subject is health.
        </p>
      </section>

      {/* Honest status, matching the register of /vision and /mission. */}
      <section className="space-y-4 rounded-xl border border-border bg-card p-6">
        <h2 className="text-xl font-bold text-foreground">Honestly stated: how to read this page</h2>
        <div className="space-y-3 text-sm md:text-base text-muted leading-relaxed">
          <p>
            <span className="text-foreground font-semibold">This is a direction.</span> It is an aim
            we are committed to and say so, not a feature we are claiming. There is no door to walk
            through today, no trial to join, and no data being collected from this page.
          </p>
          <p>
            <span className="text-foreground font-semibold">It is deliberately told in words, not
            numbers.</span> We state no figure for how well any of this would work, because there is
            nothing measured to point at. When there is, we will say what we measured and how — and
            label the rest as ahead, exactly as the other surfaces are labelled.
          </p>
        </div>
      </section>

      {/* Go deeper — back to the vision, and to the one thing that is live today. */}
      <section className="space-y-3 border-t border-border pt-10">
        <p className="text-xs uppercase tracking-widest text-muted/70 font-semibold">Go deeper</p>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link href="/vision" className="text-accent hover:underline">The whole vision</Link>
          <Link href="/check" className="text-accent hover:underline">Run a check (live today)</Link>
          <Link href="/how-verification" className="text-accent hover:underline">How verification works</Link>
          <Link href="/" className="text-accent hover:underline">Back to the home page</Link>
        </div>
      </section>
    </main>
  );
}
