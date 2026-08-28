import Link from 'next/link';
import { readPublishQueue, type QueuedDraft } from '@/lib/repid-engine';
import { TrustBadge, EmptyState, type TrustState } from '@/components/trust-state';

// A stale queue is worse than no queue: the whole claim is that what shipped was checked
// first, and a cached "verified" after a revoked verdict would be the lie this page exists to
// prevent. Same discipline as /passport/[agentId] and /grants/[principal].
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Campaign queue — TrustShell',
  description:
    'Every post an agent wants to publish, and what the HAL quorum decided about it. Nothing reaches a publishable state without a verdict — enforced by the database, not by the code that writes to it.',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/**
 * A verdict is rendered through the shared badge, never as a bespoke tick.
 *
 * NULL IS NOT_CHECKED, and that is the whole reason this function exists rather than a
 * ternary at the call site. Rows written before verification carry no verdict, and showing
 * them as anything other than "not checked" would turn an absence into a claim.
 */
function verdictState(d: QueuedDraft): { state: TrustState; detail: string } {
  if (d.hal_decision === null) {
    return { state: 'NOT_CHECKED', detail: 'no verdict recorded — predates verification' };
  }
  if (d.hal_decision === 'vetoed') {
    return { state: 'FAILED', detail: 'vetoed by the quorum; cannot be published' };
  }
  // A fallback score is not a fact-check. Reporting it as MEASURED would be the exact
  // fake-pass the backend holds these rows for.
  if (d.hal_mode === 'extractor-fallback') {
    return {
      state: 'APPROXIMATE',
      detail: 'the quorum was unavailable; this score comes from the style extractor',
    };
  }
  if (d.hal_decision === 'clean') {
    return { state: 'MEASURED', detail: 'verified by the cross-family quorum' };
  }
  return { state: 'NOT_CHECKED', detail: `HAL returned "${d.hal_decision}" — a human should look` };
}

const PUBLISHABLE = new Set(['ready', 'approved', 'scheduled', 'posted']);

export default async function CampaignQueuePage() {
  const queue = await readPublishQueue();

  return (
    <div className="mx-auto max-w-4xl space-y-10 px-4 py-12">
      <header className="space-y-4">
        <p className="text-sm font-semibold uppercase tracking-widest text-amber-500">
          Draft · Verify · Hold · Publish
        </p>
        <h1 className="text-3xl font-bold">Campaign queue</h1>
        <p className="text-neutral-400">
          Everything an agent wants to post, and what the HAL quorum decided about it. A draft
          reaches a publishable state only if a verdict exists and is not a veto —{' '}
          <strong>enforced by a database constraint, not by the code that writes the row</strong>,
          so a worker, an automation, or a hand-run update cannot route around it.
        </p>
        <p className="text-neutral-400">
          A missing verdict is refused the same as a bad one. <em>Not checked</em> is not{' '}
          <em>passed</em>.
        </p>
      </header>

      {/* NOTHING HERE PUBLISHES ANYTHING, and saying so is not a disclaimer — a page that
          looks like a publishing console while no account is connected would teach its reader
          that posts are going out when none are. */}
      <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-5 text-sm text-neutral-400">
        <div className="flex flex-wrap items-center gap-3">
          <TrustBadge state="NOT_CHECKED" />
          <span className="font-medium text-neutral-200">No account is connected, so nothing publishes.</span>
        </div>
        <p className="mt-2 leading-relaxed">
          This queue verifies and holds. The last mile — an authenticated platform credential —
          is deliberately not wired, so no path on this page can put text in front of a human.
          Items sitting in a publishable state are <em>cleared</em> to go out, not scheduled to.
        </p>
      </section>

      {queue.kind === 'refused' && (
        <div className="rounded-lg border border-neutral-800 p-5">
          <TrustBadge state="NOT_CHECKED" detail="the backend refused the read" />
          <p className="mt-3 text-sm leading-relaxed text-neutral-400">
            This is <strong>not</strong> an empty queue. The backend declined to answer, and
            from out here there is no way to tell whether the endpoint has not shipped yet or
            has shipped and is gated — it authenticates before it routes, so an unknown path
            and a protected one return the same refusal.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-neutral-400">
            Both possibilities are stated because picking the flattering one is how a surface
            like this ends up reporting a queue it never read. It will populate on its own once
            the backend ships the public read; nothing needs to change here.
          </p>
        </div>
      )}

      {queue.kind === 'error' && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/5 p-5">
          <TrustBadge
            state="FAILED"
            detail={
              queue.status
                ? `the backend answered ${queue.status}`
                : 'the backend could not be reached'
            }
          />
          <p className="mt-2 text-sm text-neutral-400">
            The queue could not be read, so this page is showing nothing rather than showing an
            empty queue. Those are different states and only one of them is a measurement.
          </p>
        </div>
      )}

      {queue.kind === 'ok' && (
        <>
          <section className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-neutral-800 p-4">
              <div className="text-2xl font-semibold text-neutral-100">{queue.count}</div>
              <div className="text-xs uppercase tracking-wide text-neutral-500">in the queue</div>
            </div>
            <div className="rounded-lg border border-neutral-800 p-4">
              <div className="text-2xl font-semibold text-neutral-100">
                {queue.drafts.filter((d) => PUBLISHABLE.has(String(d.status))).length}
              </div>
              <div className="text-xs uppercase tracking-wide text-neutral-500">cleared to publish</div>
            </div>
            {/* Surfaced as its own figure rather than folded into a total. A reader who cannot
                see the unverified count will assume the queue is verified because most of it is. */}
            <div className="rounded-lg border border-neutral-800 p-4">
              <div className="text-2xl font-semibold text-neutral-100">{queue.unverified}</div>
              <div className="text-xs uppercase tracking-wide text-neutral-500">not checked</div>
            </div>
          </section>

          {queue.count === 0 ? (
            <EmptyState
              title="The queue is empty"
              detail="Measured, not assumed — the backend answered and returned no rows. This is a different state from the backend being unreachable, which this page reports separately."
            />
          ) : (
            <section className="overflow-x-auto rounded-lg border border-neutral-800">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-neutral-800 text-xs uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Platform</th>
                    <th className="px-4 py-3 font-medium">Verdict</th>
                    <th className="px-4 py-3 font-medium">Queue state</th>
                    <th className="px-4 py-3 font-medium">Author</th>
                    <th className="px-4 py-3 font-medium">Verified</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/70">
                  {queue.drafts.map((d) => {
                    const v = verdictState(d);
                    return (
                      <tr key={d.id} className="align-top">
                        <td className="px-4 py-3 text-neutral-300">{d.platform ?? '—'}</td>
                        <td className="px-4 py-3">
                          {/* Branched rather than spread: TrustBadgeProps is a discriminated
                              union that REQUIRES a caveat on APPROXIMATE, and a spread defeats
                              that narrowing. The union is the mechanism stopping an
                              approximation from rendering as a bare claim — worth two branches. */}
                          {v.state === 'APPROXIMATE' ? (
                            <TrustBadge state="APPROXIMATE" caveat={v.detail} />
                          ) : (
                            <TrustBadge state={v.state} detail={v.detail} />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-neutral-300">{d.status ?? '—'}</span>
                          {PUBLISHABLE.has(String(d.status)) && (
                            <span className="ml-2 text-[11px] text-neutral-500">cleared</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-neutral-400">
                          {/* An honest null. A dash here means a human wrote it or it predates
                              attribution — never a fabricated agent id to fill the column. */}
                          {d.agent_id ? (
                            <Link href={`/passport/${d.agent_id}`} className="text-teal-300 hover:underline">
                              {d.agent_id.slice(0, 8)}…
                            </Link>
                          ) : (
                            <span className="text-neutral-600">not attributed</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-neutral-500">{fmtDate(d.verified_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}

      <section className="space-y-3 rounded-lg border border-neutral-800 p-6 text-sm text-neutral-400">
        <h2 className="text-lg font-semibold text-neutral-200">Why the copy itself is not shown here</h2>
        <p>
          The endpoint behind this page returns verification metadata only — platform, verdict,
          score, mode, author, timestamps. It never returns the draft text, so unpublished
          campaign copy is not readable through a public surface. That is what makes the
          verification record safe to leave open, and it is pinned by a test on the backend
          rather than left to whoever edits the query next.
        </p>
        <p>
          <Link href="/grants" className="text-teal-300 hover:underline">
            Grants
          </Link>{' '}
          answers who let an agent act on your behalf.{' '}
          <Link href="/passport" className="text-teal-300 hover:underline">
            Passport
          </Link>{' '}
          answers who the agent is. This page answers a third question: what did it try to say,
          and did anything check.
        </p>
      </section>
    </div>
  );
}
