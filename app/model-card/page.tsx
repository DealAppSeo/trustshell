import fixture from '@/fixtures/hal-last-week.fixture.json';
import { modelCardRows } from '@/lib/model-card';
import type { ReceiptRow } from '@/lib/hal-receipt';

export const metadata = {
  title: 'Model card — TrustShell',
  description: 'Read-only model card. Honesty A is a FIXTURE. Help B has no ratings.',
};

export default function ModelCardPage() {
  const cards = modelCardRows(fixture.rows as ReceiptRow[]);

  return (
    <main className="max-w-3xl mx-auto px-4 py-12 space-y-8">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-amber-500 font-semibold">Read only</p>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">Model card</h1>
        <p className="text-lg text-foreground">A portable trust harness so AI has to earn it.</p>
      </header>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm text-left">
          <caption className="sr-only">Model card. Honesty A is FIXTURE. Help B is no ratings.</caption>
          <thead className="bg-card text-muted">
            <tr>
              <th className="px-3 py-2 font-semibold">family</th>
              <th className="px-3 py-2 font-semibold">host</th>
              <th className="px-3 py-2 font-semibold">Honesty A</th>
              <th className="px-3 py-2 font-semibold">Help B</th>
            </tr>
          </thead>
          <tbody>
            {cards.map((row) => (
              <tr key={`${row.family}-${row.host}`} className="border-t border-border">
                <td className="px-3 py-2 text-foreground">{row.family}</td>
                <td className="px-3 py-2 text-muted">{row.host}</td>
                <td className="px-3 py-2">
                  <span className="text-amber-500 font-semibold">FIXTURE</span>
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
        Honesty A counts the rows in fixtures/hal-last-week.fixture.json. TRUE, FALSE, and NOT_CHECKED stay separate.
        Help B is no ratings. This repo has no human-ratings table to count.
      </p>
    </main>
  );
}
