import Link from 'next/link';
import { CHECKED_ON, LOOP_STEPS, STATUS_WORDS, type LoopStatus } from '@/lib/loop-status';

/**
 * The whole trust loop on one strip, each step with the status it has TODAY (lib/loop-status.ts).
 *
 * Server-safe (no hooks): a list, links and native <details>. The order is a story, not a record of
 * what the visitor has done; this strip never marks a step done. A step that is not built has no
 * link, only a line saying what it will do.
 */

const CHIP: Record<LoopStatus, string> = {
  live: 'border-[var(--state-measured)] text-[var(--state-measured)]',
  testnet: 'border-[var(--state-approximate)] text-[var(--state-approximate)]',
  shadow: 'border-[var(--state-not-checked)] text-[var(--state-not-checked)]',
  off: 'border-[var(--state-not-checked)] text-[var(--state-not-checked)]',
  'not-built': 'border-dashed border-[var(--state-not-checked)] text-[var(--state-not-checked)]',
  'not-checked': 'border-dashed border-[var(--state-not-checked)] text-[var(--state-not-checked)]',
};

export function StatusChip({ status }: { status: LoopStatus }) {
  return (
    <span data-status={status} className={`inline-block shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${CHIP[status]}`}>
      {STATUS_WORDS[status].chip}
    </span>
  );
}

export function LoopStrip() {
  return (
    <section aria-labelledby="loop-h" data-testid="loop-strip" className="space-y-4 rounded-xl border border-border bg-card/40 p-4 sm:p-5">
      <div className="space-y-1">
        <h2 id="loop-h" className="text-xl font-semibold text-white">
          The whole loop, and what works today
        </h2>
        <p className="text-sm text-slate-300">Five steps, about three minutes. Each one says whether it works today, and where.</p>
      </div>
      <ol className="space-y-3">
        {LOOP_STEPS.map((s, i) => (
          <li key={s.id} data-step={s.id} className="min-w-0 rounded-lg border border-border bg-background/60 p-3 sm:p-4">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-slate-400">{i + 1}</span>
              <span className="font-semibold text-white">{s.title}</span>
              <StatusChip status={s.status} />
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">{s.does}</p>
            {s.later?.map((l) => (
              <p key={l.text} className="mt-2 flex flex-wrap items-baseline gap-2 text-sm text-slate-400">
                <StatusChip status={l.status} />
                <span className="min-w-0">{l.text}</span>
              </p>
            ))}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <Link href={s.href} className="inline-flex min-h-11 items-center rounded-lg border border-amber-500/60 px-4 text-sm font-semibold text-amber-300 hover:bg-card">
                {s.linkLabel}
              </Link>
              <details className="text-xs text-slate-400">
                <summary className="cursor-pointer underline underline-offset-4">How we know</summary>
                <p className="mt-1">{s.evidence}</p>
              </details>
            </div>
          </li>
        ))}
      </ol>
      <details className="text-sm text-slate-300">
        <summary className="cursor-pointer text-slate-400 underline underline-offset-4">What the labels mean (checked on {CHECKED_ON})</summary>
        <dl className="mt-2 space-y-2">
          {(Object.keys(STATUS_WORDS) as LoopStatus[]).map((k) => (
            <div key={k} className="flex flex-wrap items-baseline gap-2">
              <dt>
                <StatusChip status={k} />
              </dt>
              <dd className="min-w-0">{STATUS_WORDS[k].means}</dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
}
