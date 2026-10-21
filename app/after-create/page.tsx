import { loadAfterCreate, shownStakeCell, type AfterCreateTable } from '@/lib/after-create';
import { OWNED_GLASS } from '@/components/after-agent';
import { StrangerRail } from '@/components/stranger-rail';
import { OFFER_ROWS, type OfferRowId } from '@/lib/stranger-path';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'After create — TrustShell',
  description: 'What you can do after an agent exists. A missing answer is NOT_CHECKED.',
};

const ROWS: { key: keyof AfterCreateTable; label: string }[] = [
  { key: 'can_verify', label: 'can_verify' },
  { key: 'can_bind', label: 'can_bind' },
  { key: 'can_stake', label: 'can_stake' },
  { key: 'can_rate_models', label: 'can_rate_models' },
  { key: 'can_list', label: 'can_list' },
];

/**
 * What the engine says about each offer row, from the same table printed below. A row whose cell is
 * missing says NOT_CHECKED; it is never assumed available. The stake cell goes through
 * shownStakeCell, so it can only ever read shadow here.
 */
function stateOf(id: OfferRowId, table: AfterCreateTable): string | null {
  if (id === 'bind') return table.can_bind;
  if (id === 'stake') return shownStakeCell(table.can_stake);
  return null;
}

export default async function AfterCreatePage() {
  const table = await loadAfterCreate();

  return (
    <main className="max-w-3xl min-w-0 mx-auto px-4 py-12 space-y-6">
      <StrangerRail step="offer" />
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">After create</h1>
        <p className="text-sm text-muted">
          {table.source === 'counted'
            ? 'counted from /api/v1/after-create'
            : 'NOT_CHECKED. Timeout, 5xx, or a missing URL is not a fixture.'}
        </p>
        <p className="text-sm text-foreground">
          You have an agent. Next: verify a claim. Then look at the receipt. Wallet and stake are testnet / shadow.
        </p>
        <p className="text-sm text-foreground">{OWNED_GLASS}</p>
      </header>
      <section aria-labelledby="offer-h" data-testid="offer" className="space-y-3">
        <h2 id="offer-h" className="text-xl font-bold text-foreground">
          The offer
        </h2>
        <p className="text-sm text-muted">
          Optional, in order. Nothing here is required to use a check. Every row runs on the Base Sepolia test network.
        </p>
        <ol className="space-y-3">
          {OFFER_ROWS.map((row, i) => {
            const state = stateOf(row.id, table);
            return (
              <li
                key={row.id}
                data-testid={`offer-${row.id}`}
                className="min-w-0 space-y-2 rounded-xl border border-border bg-card/50 p-4"
              >
                <p className="text-sm font-semibold text-foreground">
                  <span className="mr-2 font-mono text-muted">{i + 1}.</span>
                  {row.title}
                  {state && (
                    <span className="ml-2 rounded border border-border px-1.5 py-0.5 font-mono text-xs font-normal text-muted">
                      engine says: {state}
                    </span>
                  )}
                </p>
                <p className="text-sm text-muted break-words">{row.body}</p>
                {row.href ? (
                  <Link
                    href={row.href}
                    className="inline-block rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-black hover:bg-amber-500"
                  >
                    {row.action}
                  </Link>
                ) : (
                  <span className="inline-block rounded-lg border border-border px-4 py-2 text-sm text-muted">{row.action}</span>
                )}
              </li>
            );
          })}
        </ol>
      </section>
      <table className="w-full text-sm text-left border border-border">
        <thead className="bg-card text-muted">
          <tr>
            <th className="px-3 py-2 font-semibold">cell</th>
            <th className="px-3 py-2 font-semibold">value</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.key} className="border-t border-border">
              <td className="px-3 py-2 text-foreground">{row.label}</td>
              <td className="px-3 py-2">
                {row.key === 'can_stake' ? shownStakeCell(table[row.key]) : table[row.key]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
