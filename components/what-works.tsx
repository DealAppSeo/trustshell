import Link from 'next/link';
import { CHECKED_ON, OPEN_QUESTIONS, whatWorks, type WorksItem } from '@/lib/loop-status';
import { StatusChip } from '@/components/loop-strip';

/**
 * "What works today": verified, in progress, open. Drawn from lib/loop-status.ts, the same source as
 * the loop strip's chips, so the two cannot disagree. Server-safe: no hooks, no requests.
 */

function Item({ item }: { item: WorksItem }) {
  return (
    <li className="min-w-0 rounded-lg border border-border bg-background/60 p-3 text-sm">
      <p className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-foreground">{item.title}</span>
        <StatusChip status={item.status} />
      </p>
      <p className="mt-1 leading-relaxed text-muted">{item.text}</p>
      {item.href && item.linkLabel && (
        <Link href={item.href} className="mt-1 inline-flex min-h-11 items-center text-accent underline underline-offset-4 hover:text-foreground">
          {item.linkLabel}
        </Link>
      )}
    </li>
  );
}

export function WhatWorks() {
  const { verified, inProgress } = whatWorks();
  return (
    <section id="what-works" aria-labelledby="what-works-h" data-testid="what-works" className="scroll-mt-24 space-y-6 rounded-xl border border-border bg-card p-6">
      <div className="space-y-1">
        <h2 id="what-works-h" className="text-2xl font-bold text-foreground">
          What works today
        </h2>
        <p className="text-sm text-muted">
          Checked on {CHECKED_ON}. Testnet means Base Sepolia with test USDC: no real money moves. Anything we could not confirm says so.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-2">
          <h3 className="text-lg font-semibold text-foreground">Verified</h3>
          <ul className="space-y-2" data-group="verified">
            {verified.map((i) => (
              <Item key={`${i.title}-${i.text}`} item={i} />
            ))}
          </ul>
        </div>
        <div className="min-w-0 space-y-2">
          <h3 className="text-lg font-semibold text-foreground">In progress</h3>
          <ul className="space-y-2" data-group="in-progress">
            {inProgress.map((i) => (
              <Item key={`${i.title}-${i.text}`} item={i} />
            ))}
          </ul>
        </div>
        <div className="min-w-0 space-y-2">
          <h3 className="text-lg font-semibold text-foreground">Open questions</h3>
          <ul className="space-y-2" data-group="open">
            {OPEN_QUESTIONS.map((q) => (
              <li key={q.title} className="min-w-0 rounded-lg border border-dashed border-border p-3 text-sm">
                <p className="font-semibold text-foreground">{q.title}</p>
                <p className="mt-1 leading-relaxed text-muted">{q.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
