import fixture from '@/fixtures/hal-last-week.fixture.json';
import { countByFamily, type ReceiptRow } from '@/lib/hal-receipt';

export const metadata = {
  title: 'Last measured week — TrustShell',
  description: 'FIXTURE. Per-family HAL outcome counts. Not a live production query.',
};

const SENTENCE = 'Agents rate families by outcomes. Vendors do not score themselves.';

export default function HalReceiptPage() {
  const rows = fixture.rows as ReceiptRow[];
  const counts = countByFamily(rows);

  return (
    <main className="max-w-3xl mx-auto px-4 py-12 space-y-8">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-amber-500 font-semibold">FIXTURE, not live</p>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">Last measured week</h1>
        <p className="text-muted leading-relaxed">{SENTENCE}</p>
        <p className="text-sm text-muted leading-relaxed">{fixture.why}</p>
      </header>

      <section className="space-y-2 text-sm text-muted">
        <h2 className="text-lg font-semibold text-foreground">Where a vote is written</h2>
        <p>
          Verdict, host, and latency are the <code className="text-amber-500">ProviderVerdict</code> fields
          {' '}<code className="text-amber-500">provider</code>, <code className="text-amber-500">verdict</code>
          {' '}(<code className="text-amber-500">TRUE</code>, <code className="text-amber-500">FALSE</code>,
          {' '}<code className="text-amber-500">UNCERTAIN</code>, <code className="text-amber-500">ERROR</code>),
          and <code className="text-amber-500">latency_ms</code> in{' '}
          <code className="text-amber-500">{fixture.writes.verdict_file}</code>.
          Family is <code className="text-amber-500">{fixture.writes.family_function}</code> in that same file.
        </p>
        <p>
          The durable table is <code className="text-amber-500">{fixture.writes.durable_table}</code>, written by{' '}
          <code className="text-amber-500">{fixture.writes.durable_writer}</code>. Its columns are provider, model,
          latency, and status. It does not store TRUE or FALSE. The public counter{' '}
          <code className="text-amber-500">{fixture.writes.public_counter_table}</code> is a source tally, not this table.
        </p>
      </section>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm text-left">
          <caption className="sr-only">FIXTURE counts per family for the last measured week</caption>
          <thead className="bg-card text-muted">
            <tr>
              <th className="px-3 py-2 font-semibold">Family</th>
              <th className="px-3 py-2 font-semibold">Host</th>
              <th className="px-3 py-2 font-semibold">TRUE</th>
              <th className="px-3 py-2 font-semibold">FALSE</th>
              <th className="px-3 py-2 font-semibold">NOT_CHECKED</th>
            </tr>
          </thead>
          <tbody>
            {counts.map((row) => (
              <tr key={row.family} className="border-t border-border">
                <td className="px-3 py-2 text-foreground">{row.family}</td>
                <td className="px-3 py-2 text-muted">{row.hosts.join(', ')}</td>
                <td className="px-3 py-2 tabular-nums">{row.TRUE}</td>
                <td className="px-3 py-2 tabular-nums">{row.FALSE}</td>
                <td className="px-3 py-2 tabular-nums">{row.NOT_CHECKED}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted">
        ERROR is counted as NOT_CHECKED. It is not counted as FALSE. UNCERTAIN stays UNCERTAIN:
        fixture count {counts.reduce((n, row) => n + row.UNCERTAIN, 0)}, not in FALSE and not in NOT_CHECKED.
        Week label: {fixture.week}.
      </p>
    </main>
  );
}
