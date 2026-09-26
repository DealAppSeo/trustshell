import { loadAfterCreate, shownStakeCell, type AfterCreateTable } from '@/lib/after-create';

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
];

export default async function AfterCreatePage() {
  const table = await loadAfterCreate();

  return (
    <main className="max-w-3xl mx-auto px-4 py-12 space-y-6">
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
      </header>
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
