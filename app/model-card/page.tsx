import { loadHonestyCard } from '@/lib/honesty-a';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Model card — TrustShell',
  description: 'Read-only model card. Honesty A is counted or FIXTURE. Help B has no ratings unless n is at least 1.',
};

export default async function ModelCardPage() {
  const card = await loadHonestyCard();

  return (
    <main className="max-w-3xl mx-auto px-4 py-12 space-y-8">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-amber-500 font-semibold">Read only</p>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">Model card</h1>
        <p className="text-lg text-foreground">A portable trust harness so AI has to earn it.</p>
      </header>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm text-left">
          <caption className="sr-only">Model card. Honesty A is FIXTURE unless the count endpoint says counted. Help B is no ratings.</caption>
          <thead className="bg-card text-muted">
            <tr>
              <th className="px-3 py-2 font-semibold">family</th>
              <th className="px-3 py-2 font-semibold">host</th>
              <th className="px-3 py-2 font-semibold">Honesty A</th>
              <th className="px-3 py-2 font-semibold">Help B</th>
            </tr>
          </thead>
          <tbody>
            {card.rows.map((row) => (
              <tr key={`${row.family}-${row.host}`} className="border-t border-border">
                <td className="px-3 py-2 text-foreground">{row.family}</td>
                <td className="px-3 py-2 text-muted">{row.host}</td>
                <td className="px-3 py-2">
                  {card.source === 'FIXTURE' ? (
                    <span className="text-amber-500 font-semibold">FIXTURE</span>
                  ) : (
                    <span className="text-amber-500 font-semibold">counted</span>
                  )}
                  <span className="text-muted">
                    {' '}
                    TRUE {row.TRUE} / FALSE {row.FALSE} / NOT_CHECKED {row.NOT_CHECKED}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted">{row.helpB}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-muted leading-relaxed">
        Honesty A uses GET /api/v1/hal/honesty-a when status is counted. Otherwise it counts
        fixtures/hal-last-week.fixture.json and is labeled FIXTURE. TRUE, FALSE, and NOT_CHECKED stay separate.
        Help B is no ratings unless that payload has n of at least 1.
      </p>
      <p className="text-sm text-muted leading-relaxed">
        First-pass family votes and the post-HAL verdict are different columns when the engine exposes them.{' '}
        {card.columns}
      </p>
    </main>
  );
}
