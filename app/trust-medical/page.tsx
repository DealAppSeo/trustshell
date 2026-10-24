import Link from 'next/link';
import { OG_IMAGE } from '@/lib/site';

/** The label this page carries in its title, its first line and its badge. Pinned by tests/trust-medical-page.test.ts. */
const LABEL = 'Vision — not built yet';

export const metadata = {
  title: `TrustMedical (${LABEL})`,
  description:
    'TrustMedical does not exist. A story about a future use of the tools built for AI agents: one identity with a separate consent proof per study, one rulebook for consent, reputation that decides which research agents may come near a study, checked claims, and health data kept apart from the agent network.',
  openGraph: {
    title: `TrustMedical (${LABEL})`,
    description:
      'A vision story, not a product. Nothing here is built, nothing here is medical advice, and the page collects nothing.',
    images: OG_IMAGE,
    type: 'article',
    url: 'https://trustshell.dev/trust-medical',
  },
};

/**
 * /trust-medical: the TrustMedical vision story. Reached from /vision and the sitemap (lib/site.ts).
 * components/footer.tsx also lists it, but no page mounts that Footer today, so do not count the
 * footer as a way in. A static server component with no data fetch.
 *
 * WHAT IT IS (Sean, 2026-10-14: "story page only"). A future vertical, told in plain words and
 * labelled `Vision — not built yet` in the title, the first line and the badge. The ideas come from
 * the ZKP architecture invariants (living-docs ZKP_ARCHITECTURE_INVARIANTS.md): scoped nullifiers,
 * one consent/owner-policy engine, RepID gating, HAL grounding, and an isolated data plane for
 * health data. Only the "What exists today" list describes anything real, and each item links to it.
 *
 * WHAT IT MUST NOT DO, pinned by tests/trust-medical-page.test.ts:
 *   - no form or input of any kind, so no health information can be typed into it;
 *   - no compliance, clinical-validity, diagnosis, treatment or advice claim;
 *   - no customer, partner, pilot, timeline or event;
 *   - no present-tense "secure" or "private" about TrustMedical.
 */

function VisionTag() {
  // House readiness metadata (as /vision): muted and dashed, never the accent or a verdict colour.
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-dashed border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted">
      <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full border border-muted" />
      {LABEL}
    </span>
  );
}

type Idea = { title: string; body: string };

const IDEAS: ReadonlyArray<Idea> = [
  {
    title: 'One identity, a separate pass for each study',
    body:
      'A person would hold one secret. From it they could make a consent proof that belongs to one study only. That study could check that the person agreed, and agreed once. Two studies could not compare notes to learn it was the same person. It is designed to be the same identity that owns AI agents, so nobody would need a second one for health.',
  },
  {
    title: 'One rulebook for consent',
    body:
      'The rules that decide who may act for an AI agent would be the same rules that decide how a person’s consent may be used by a study. Built once, so a consent rule cannot quietly mean something different when the subject is health.',
  },
  {
    title: 'Reputation would decide who gets near a study',
    body:
      'Research agents would have a RepID, earned under rules written for research work. Those rules do not exist yet. A study could require a minimum RepID before an agent may touch it, and ask for a proof of it.',
  },
  {
    title: 'Claims about a study would be checked',
    body:
      'A statement about a study could go through the check, which is a vote by checkers from different model families. Matching a quote against the document it cites is a different, separate step: a local command, trustshell ground, that looks for the quote on the cited page with no model and no network. It is not part of the check. What cannot be checked would say Not checked, never pass.',
  },
  {
    title: 'Health data lives somewhere else. Always.',
    body:
      'The one rule not open for discussion: health data would sit in its own separate database, never in the one the agent network uses. The two would share the maths behind the proofs and nothing else.',
  },
];

export default function TrustMedicalPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12 space-y-12">
      <header className="space-y-4">
        <p className="text-xs uppercase tracking-widest text-accent font-semibold">TrustMedical · {LABEL}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground leading-tight">
            A door, not a trial.
          </h1>
          <VisionTag />
        </div>
        <p className="text-base md:text-lg text-muted leading-relaxed max-w-2xl">
          <span className="text-foreground">TrustMedical does not exist.</span> This page is a story
          about a future use of the tools we are building for AI agents: helping a person take part in
          medical research while sharing as little as possible. The list under “What exists today” is
          real and linked. Everything else is an idea.
        </p>
        <p
          data-testid="trust-medical-disclaimer"
          className="rounded-xl border border-border bg-card px-5 py-4 text-sm md:text-base text-foreground/90 font-medium"
        >
          Not a medical product. It does not exist yet. Nothing here is medical advice. This page has
          no form and collects nothing.
        </p>
      </header>

      <section className="space-y-5">
        <h2 className="text-2xl font-bold text-foreground">The idea, in five parts</h2>
        <ol className="space-y-3">
          {IDEAS.map((idea, i) => (
            <li key={idea.title} className="rounded-xl border border-border bg-card p-5 space-y-2">
              <div className="flex items-baseline gap-3">
                <span aria-hidden="true" className="font-display text-sm font-semibold text-muted tabular-nums">
                  {i + 1}
                </span>
                <h3 className="text-lg font-semibold text-foreground">{idea.title}</h3>
              </div>
              <p className="text-sm text-muted leading-relaxed">{idea.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-foreground">What exists today</h2>
        <ul className="space-y-3 text-sm md:text-base text-muted leading-relaxed">
          <li>
            <Link href="/check" className="text-accent hover:underline">The check</Link>: paste a
            sentence and two checkers from different model families each give a verdict. You see what each said,
            with a receipt. If they cannot decide, it says Not checked, which never counts as a pass.
          </li>
          <li>
            <Link href="/passport/trinity-sophia" className="text-accent hover:underline">RepID and its proof</Link>:
            an agent’s passport shows its RepID and a zero-knowledge range proof over it that can be
            verified. Today that proof shows the score rather than hiding it.
          </li>
          <li>
            <Link href="/how-verification" className="text-accent hover:underline">How verification works</Link>,
            in more detail.
          </li>
        </ul>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-card p-6">
        <h2 className="text-xl font-bold text-foreground">What does not exist</h2>
        <p className="text-sm md:text-base text-muted leading-relaxed">
          TrustMedical itself. Consent proofs for a study. The consent rules for studies. RepID rules
          for research agents. Any database for health data. There is no study to join, and nothing is
          collected here.
        </p>
      </section>

      <section className="space-y-3 border-t border-border pt-10">
        <p className="text-xs uppercase tracking-widest text-muted/70 font-semibold">Go deeper</p>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link href="/vision" className="text-accent hover:underline">The whole vision</Link>
          <Link href="/check" className="text-accent hover:underline">Run a check (live today)</Link>
          <Link href="/" className="text-accent hover:underline">Back to the home page</Link>
        </div>
      </section>
    </main>
  );
}
