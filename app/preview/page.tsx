import Link from 'next/link';
import { fetchPreviewCatalog } from '@/lib/repid-engine';
import Projector from './Projector';

export const metadata = {
  title: 'Preview RepID — TrustShell',
  description:
    'What is each action actually worth? See the published RepID tariff, and project a score forward, before you have an agent, a key, or an account. Nothing is written and nothing is earned.',
};

// The tariff is served live and must never be baked into a static build: a cached page
// would keep showing yesterday's numbers as though they were current, which is the exact
// dishonesty this surface is built to avoid.
export const dynamic = 'force-dynamic';

export default async function PreviewPage() {
  const catalog = await fetchPreviewCatalog();

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-12">
      <header className="space-y-4">
        <p className="text-sm font-semibold uppercase tracking-widest text-amber-500">
          Approximate · Nothing written · Nothing earned
        </p>
        <h1 className="text-3xl font-bold">Preview RepID</h1>
        <p className="text-neutral-400">
          Every other page here answers a question about an agent that already exists. This one
          answers the question you have <em>before</em> that: <strong>what is any of this
          actually worth?</strong> No agent, no API key, no account — the numbers below come off
          the same published tariff the live scorer reads.
        </p>
        <p className="text-neutral-400">
          It is a projection, not a score. The engine labels its own answer{' '}
          <code className="text-neutral-200">APPROXIMATE</code> and says what it leaves out, and
          this page shows you both rather than just the total.
        </p>
      </header>

      <Projector />

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">The tariff, in full</h2>
        {catalog === 'not_checked' ? (
          // NOT_CHECKED is its own state and gets its own box. An empty table would read as
          // "there are no actions" — a different claim, and a false one.
          <div className="rounded-lg border border-neutral-700 bg-neutral-900/40 p-6 text-sm">
            <p className="font-semibold text-neutral-200">NOT_CHECKED</p>
            <p className="mt-2 text-neutral-400">
              The scoring engine could not be reached, so the tariff is not shown. This is not
              &ldquo;no actions are worth anything&rdquo; and it is not &ldquo;the values are
              zero&rdquo; — it is that nothing was measured. Reload to try again.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-neutral-800">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-neutral-800 text-neutral-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Action</th>
                    <th className="px-4 py-3 font-medium">Value</th>
                    <th className="px-4 py-3 font-medium">Why</th>
                  </tr>
                </thead>
                <tbody>
                  {catalog.actions.map((a) => (
                    <tr key={a.eventType} className="border-b border-neutral-900 align-top">
                      <td className="px-4 py-3 font-mono text-xs text-neutral-200">
                        {a.eventType}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {a.verdict === 'NOT_CHECKED' || a.delta === null ? (
                          <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs font-semibold text-neutral-400">
                            NOT_CHECKED
                          </span>
                        ) : (
                          <span
                            className={
                              a.delta < 0
                                ? 'font-semibold text-red-400'
                                : 'font-semibold text-emerald-400'
                            }
                          >
                            {a.delta > 0 ? `+${a.delta}` : a.delta}
                          </span>
                        )}
                        {a.contingentOnEvidence && (
                          <span className="ml-2 text-xs text-amber-500">needs evidence</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs leading-relaxed text-neutral-400">
                        {a.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs leading-relaxed text-neutral-500">{catalog.disclaimer}</p>
          </>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-neutral-800 p-6 text-sm text-neutral-400">
        <h2 className="text-lg font-semibold text-neutral-200">
          Why some rows say NOT_CHECKED instead of a number
        </h2>
        <p>
          Because the honest answer is that the value cannot be stated yet — either the amount
          depends on something that has not happened (a challenge is scored from the certainty
          asserted at claim time and the live ecosystem-need weight), or the live path awards
          nothing for it until a verifier exists that does not yet.
        </p>
        <p>
          They are listed rather than hidden on purpose. An action quietly missing from a
          catalogue reads as an action that does not exist, which is worse than one that says
          plainly it has not been measured.
        </p>
      </section>

      {/* The page answered "what is it worth". Leaving it there makes it a dead end: the one
          person it was built for — someone with no agent, deciding whether this is for them —
          has nowhere to go with the answer. /start is the honest next step, and it is described
          as what it is (a tailoring flow with an escape at every step), not as a signup wall. */}
      <section className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-6">
        <h2 className="text-lg font-semibold text-neutral-100">Worth doing?</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-400">
          Nothing above required an account, and neither does the next step. It asks three optional
          questions to tailor what you see, every one of them skippable, and it is not a gate.
        </p>
        <Link
          href="/start"
          className="mt-4 inline-block rounded-md bg-amber-500 px-5 py-2 text-sm font-semibold text-black hover:bg-amber-400"
        >
          Start here →
        </Link>
      </section>

      <section className="text-sm text-neutral-500">
        <p>
          Curious how the formula is decided, or want to argue with it?{' '}
          <Link href="/repid" className="text-amber-500 underline">
            RepID governance →
          </Link>
        </p>
        <p className="pt-2">
          Already have an agent?{' '}
          <Link href="/passport" className="text-amber-500 underline">
            Check its Passport →
          </Link>
        </p>
      </section>
    </div>
  );
}
