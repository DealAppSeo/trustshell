import RUN from '@/lib/recordings/owner-budget-2026-11-16.json';
import { StatusChip } from '@/components/loop-strip';

/**
 * One recorded run of an owner's shared budget on Base Sepolia, readable by a stranger: what the owner
 * allowed, what was spent, what was refused and why, plain words first and transaction hashes second.
 *
 * A FILE, NOT A FEED. The numbers come from lib/recordings/owner-budget-2026-11-16.json, which records
 * its own source and date; nothing here calls the engine or the chain. Totals are computed from the
 * file, so the sentence at the top cannot disagree with the rows under it.
 */

const usdc = (s: string) => Math.round(Number(s) * 1e6);
const fmt = (micro: number) => (micro / 1e6).toFixed(1);
const short = (tx: string) => `${tx.slice(0, 10)}…${tx.slice(-4)}`;
const day = new Date(RUN.run.from).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function OwnerBudgetReceipt() {
  const spent = RUN.moved.filter((m) => m.direction === 'budget to payee').reduce((a, m) => a + usdc(m.amount), 0);
  const back = RUN.moved.filter((m) => m.direction === 'budget to owner').reduce((a, m) => a + usdc(m.amount), 0);
  const refused = RUN.refused.reduce((a, r) => a + r.times, 0);

  return (
    <section aria-labelledby="owner-budget-h" data-testid="owner-budget-receipt" className="space-y-6">
      <div className="space-y-2">
        <p className="flex flex-wrap items-center gap-2">
          <StatusChip status="testnet" />
          <span className="text-xs text-muted">One recorded run, not a live feed</span>
        </p>
        <h2 id="owner-budget-h" className="text-2xl font-bold text-foreground">
          A capped budget, shared by two agents, on the test network
        </h2>
        <p data-testid="owner-budget-lead" className="max-w-3xl text-base leading-relaxed text-muted">
          On {day}, an owner put {fmt(usdc(RUN.budget))} test USDC into one budget shared by {RUN.agents} agents. The agents spent {fmt(spent)} between them, and the owner took back the {fmt(back)} left. {refused} other attempts were refused, and none of them moved any money.
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-foreground">What was refused, and why</h3>
        <ul className="space-y-2">
          {RUN.refused.map((r) => (
            <li key={r.what} className="min-w-0 rounded-lg border border-border bg-card/40 p-3 text-sm">
              <p className="text-foreground">
                {r.what}
                {r.times > 1 ? ` (${r.times} times)` : ''}
              </p>
              <p className="mt-1 text-xs text-muted">
                Refused. The engine answered <code className="font-mono">{r.answer}</code>.
              </p>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-foreground">The money that moved</h3>
        <ol className="space-y-2">
          {RUN.moved.map((m) => (
            <li key={m.tx} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg border border-border bg-card/40 p-3 text-sm">
              <span className="min-w-0 text-foreground">{m.step}</span>
              <a href={`${RUN.chain.explorer}${m.tx}`} className="inline-flex min-h-11 items-center font-mono text-xs text-accent underline underline-offset-4 hover:text-foreground">
                {short(m.tx)} on BaseScan
              </a>
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted">
          The owner paid {RUN.net.owner_paid} test USDC in all, and the payee received {RUN.net.payee_received}.
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-foreground">What this run does not show</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          {RUN.not_shown.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </div>

      <details className="text-xs text-muted">
        <summary className="cursor-pointer underline underline-offset-4">Where this comes from</summary>
        <p className="mt-2 max-w-3xl">{RUN.source}</p>
        <p className="mt-1">
          {RUN.chain.name}, chain {RUN.chain.id}. Run {RUN.run.from} to {RUN.run.to}.
        </p>
      </details>
    </section>
  );
}
