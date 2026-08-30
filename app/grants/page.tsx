import Link from 'next/link';
import LookupForm from './LookupForm';

export const metadata = {
  title: 'Grants — TrustShell',
  description:
    'Principal-to-principal authority: scope, budget, expiry — and always-available revocation. The MVP gap between Passport (who is this agent) and Authority (what can it back) — who let it act on your behalf, and how to stop it.',
};

export default function GrantsIndexPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-12">
      <header className="space-y-4">
        <p className="text-sm font-semibold uppercase tracking-widest text-amber-500">
          Scope · Budget · Expiry · Revoke
        </p>
        <h1 className="text-3xl font-bold">Grants</h1>
        <p className="text-neutral-400">
          Passport answers <em>who is this agent</em>. Authority answers <em>what can it back</em>.
          Grants answers the question in between: <strong>who let it act on your behalf, and how do
          you stop it</strong> — a PAI granting a CTO/CFO/CMO worker scoped, budgeted,
          time-limited authority, or a build agent handing a sub-task to one it spawns.
        </p>
        <p className="text-neutral-400">
          Every grant narrows, never widens: a child can only hold a subset of its parent&apos;s
          capabilities, a tighter (never looser) spending cap, and an earlier expiry. The
          grantor can always revoke — immediately, and the grantee cannot block it.
        </p>
      </header>

      <LookupForm />

      <section className="space-y-3 rounded-lg border border-neutral-800 p-6 text-sm text-neutral-400">
        <h2 className="text-lg font-semibold text-neutral-200">How a grant is judged live</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-neutral-200">Scope</strong> — capabilities like{' '}
            <code className="text-neutral-200">pay:usdc</code>, checked segment-by-segment; a
            wildcard only ever covers a whole remaining path, never a typo&apos;s worth of extra
            reach.
          </li>
          <li>
            <strong className="text-neutral-200">Budget</strong> — a spend cap the grantor must
            actually have authority for (measured against A_eff, not asserted), and that can only
            shrink down a delegation chain.
          </li>
          <li>
            <strong className="text-neutral-200">Expiry</strong> — an expired grant is a denial,
            not a soft warning. A never-expiring grant is refused at the moment it would be minted.
          </li>
          <li>
            <strong className="text-neutral-200">Revoke</strong> — checked against the{' '}
            <em>whole</em> chain on every read: revoking a grant instantly denies everything
            delegated beneath it too, even though only that one row actually changed.
          </li>
        </ul>
        <p className="pt-2">
          A grant may also name a <strong className="text-neutral-200">role</strong> — CEO, CTO,
          CFO or CMO. A role never supplies authority; it caps what the grant may carry, which is
          why a CTO grant cannot move money whatever it asks for.{' '}
          <Link href="/grants/roles" className="text-amber-500 underline">
            See the four ceilings →
          </Link>
        </p>
        <p className="pt-2">
          Full endpoint reference:{' '}
          <a
            href="https://github.com/DealAppSeo/repid-engine/blob/main/docs/mvp-grants-api.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-500 underline"
          >
            docs/mvp-grants-api.md →
          </a>
        </p>
      </section>

      <section className="text-sm text-neutral-500">
        <p>
          Looking for an agent&apos;s reputation instead?{' '}
          <Link href="/passport" className="text-amber-500 underline">
            Check its Passport →
          </Link>
        </p>
      </section>
    </div>
  );
}
