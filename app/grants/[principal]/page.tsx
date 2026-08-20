import Link from 'next/link';
import { listGrantsFor, type ListedGrant, type Caveat } from '@/lib/repid-engine';
import { RevokeButton } from '../RevokeButton';
import { TrustBadge } from '@/components/trust-state';

// Live authority data — a stale "still live" reading after a revoke is exactly the failure
// mode this page exists to prevent. Same discipline as /passport/[agentId].
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Grants — TrustShell',
  description: 'Every grant a principal has issued or received, judged live against its full chain — MEASURED, NOT_CHECKED, or FAILED, never a silent success.',
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function caveatSummary(caveats: Caveat[]): string {
  if (caveats.length === 0) return 'no caveats';
  return caveats
    .map((c) => {
      if (c.type === 'maxValue') return `≤ ${c.amount} ${c.asset}`;
      if (c.type === 'maxCalls') return `≤ ${c.limit} calls`;
      return `tools: ${c.tools.join(', ')}`;
    })
    .join(' · ');
}

function LiveBadge({ grant }: { grant: ListedGrant }) {
  if (grant.live) {
    return (
      <span className="inline-block rounded-full border border-green-600/40 bg-green-600/10 px-2.5 py-0.5 text-xs font-semibold text-green-500">
        MEASURED — live
      </span>
    );
  }
  return (
    <span
      className="inline-block rounded-full border border-red-600/40 bg-red-600/10 px-2.5 py-0.5 text-xs font-semibold text-red-400"
      title={grant.liveReason}
    >
      FAILED — {grant.revoked_at ? 'revoked' : 'expired'}
    </span>
  );
}

function GrantCard({ grant, principal }: { grant: ListedGrant; principal: string }) {
  const youAreGrantor = grant.grantor_agent_id === principal;
  return (
    <div className="space-y-2 rounded-lg border border-neutral-800 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <span className="font-semibold text-neutral-200">{grant.grantor_agent_id}</span>
          <span className="mx-2 text-neutral-500">→</span>
          <span className="font-semibold text-neutral-200">{grant.grantee_agent_id}</span>
          {grant.role && (
            <span className="ml-2 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-500">
              {grant.role}
            </span>
          )}
        </div>
        <LiveBadge grant={grant} />
      </div>
      <div className="grid grid-cols-1 gap-1 text-xs text-neutral-400 sm:grid-cols-2">
        <span>class: {grant.grant_class}</span>
        <span>depth: {grant.depth}{grant.parent_grant_id ? ' (delegated)' : ' (root)'}</span>
        <span>scope: {grant.capabilities.join(', ') || '(none)'}</span>
        <span>{caveatSummary(grant.caveats)}</span>
        <span>expires: {fmtDate(grant.expires_at)}</span>
        {/*
          Mint consent, through the one shared vocabulary rather than an ad-hoc pair of
          strings. This previously rendered a bare `signed ✓` for VERIFIED — the exact shape
          a status must never take here, because a tick carries no claim ceiling: it reads as
          blanket approval of the grant when all that was checked is that the grantor's
          registered wallet signed the mint intent. `ListedGrant.signature_status`' own
          docstring is explicit that the two values are "never silently equivalent"; routing
          them through TrustBadge makes that structural instead of a convention two strings
          apart.
        */}
        <span className="sm:col-span-2">
          <span className="mr-2 text-neutral-500">consent:</span>
          {grant.signature_status === 'VERIFIED' ? (
            <TrustBadge state="MEASURED" detail="grantor's registered wallet signed this mint intent" />
          ) : (
            <TrustBadge state="NOT_CHECKED" detail="no grantor wallet on record — mint consent was never cryptographically checked" />
          )}
        </span>
        {grant.revoked_at && <span>revoked: {fmtDate(grant.revoked_at)} by {grant.revoked_by}</span>}
      </div>
      {!grant.live && (
        <p className="text-xs text-neutral-500" title={grant.liveReason}>
          {grant.liveReason}
        </p>
      )}
      {youAreGrantor && grant.live && (
        <div className="pt-1">
          <RevokeButton grantId={grant.id} requestedBy={principal} />
        </div>
      )}
    </div>
  );
}

export default async function GrantsForPrincipalPage({
  params,
}: {
  params: Promise<{ principal: string }>;
}) {
  const { principal } = await params;
  const grants = await listGrantsFor(principal);

  if (grants === 'error') {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-12">
        <h1 className="text-2xl font-bold">Grants for {principal}</h1>
        <p className="text-neutral-400">
          The grants service is unreachable right now. Nothing is shown rather than showing stale
          or guessed data — try again shortly.
        </p>
      </div>
    );
  }

  const granted = grants.filter((g) => g.grantor_agent_id === principal);
  const received = grants.filter((g) => g.grantee_agent_id === principal && g.grantor_agent_id !== principal);

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-12">
      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-widest text-amber-500">
          Scope · Budget · Expiry · Revoke
        </p>
        <h1 className="text-3xl font-bold">{principal}</h1>
        <p className="text-sm text-neutral-500">
          {grants.length === 0
            ? 'No grants issued or received yet.'
            : `${grants.length} grant${grants.length === 1 ? '' : 's'} total. Liveness is recomputed against the full ancestor chain on every load — a revoked or expired grant upstream denies everything delegated from it, even rows that were never themselves touched.`}
        </p>
      </header>

      {granted.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-neutral-200">Granted by {principal}</h2>
          <div className="space-y-3">
            {granted.map((g) => (
              <GrantCard key={g.id} grant={g} principal={principal} />
            ))}
          </div>
        </section>
      )}

      {received.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-neutral-200">Received by {principal}</h2>
          <div className="space-y-3">
            {received.map((g) => (
              <GrantCard key={g.id} grant={g} principal={principal} />
            ))}
          </div>
        </section>
      )}

      {grants.length === 0 && (
        <p className="text-sm text-neutral-500">
          Grants are minted via <code className="text-neutral-300">POST /api/v1/grants</code> — see{' '}
          <a
            href="https://github.com/DealAppSeo/repid-engine/blob/main/docs/mvp-grants-api.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-500 underline"
          >
            the API reference
          </a>
          . There is no mint form on this page yet — minting is a spend/authority decision an
          agent's own code makes, not a click a human should rubber-stamp for it.
        </p>
      )}

      <footer className="border-t border-neutral-800 pt-6 text-sm text-neutral-500">
        <Link href="/grants" className="text-amber-500 underline">
          ← Look up another principal
        </Link>
      </footer>
    </div>
  );
}
