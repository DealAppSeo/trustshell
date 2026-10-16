import Link from 'next/link';
import { STRANGER_STEPS, nextStrangerStep, strangerStep, type StrangerStepId } from '@/lib/stranger-path';

/**
 * The rail's way to the next screen. /check prints it under the answer instead (CheckForm
 * `afterResult`), so the brightest thing on that page is never a way to leave it before a check.
 */
export function StrangerNext({ step }: { step: StrangerStepId }) {
  const next = nextStrangerStep(step);
  if (!next) return null;
  return (
    <Link
      href={next.href}
      data-testid="rail-next"
      className="inline-block rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-black hover:bg-amber-500"
    >
      Next: step {next.n}, {next.title.toLowerCase()}
    </Link>
  );
}

/**
 * The tutorial, ON the screen it describes: "Step N of 4", what to do here, what you should see,
 * and the way to the next screen. It is printed by the real pages (/agents, /belts, /check,
 * /after-create), not by a tour, so the steps beside a screen are always the steps of THAT screen.
 *
 * SERVER-SAFE: no hooks, no 'use client', just markup and links, so it renders inside a server page
 * and a client page alike. A native <details open> lets a returning person fold it away with no
 * script. The words live in lib/stranger-path.ts.
 *
 * The strip names all four screens. The current one is marked, the others are links; the order is
 * a narrative, not a claim that a step has been done: whether something worked is shown by the
 * page's own result, never by this card.
 *
 * `compact` (/check): a one-line breadcrumb, folded, with no Next and no strip, so the box comes first
 * on a phone. Opening it shows the same do-this and you-will-see lines.
 */
export function StrangerRail({ step, skipHref, compact = false }: { step: StrangerStepId; skipHref?: string; compact?: boolean }) {
  const me = strangerStep(step);

  return (
    <aside
      aria-label={`Step ${me.n} of 4: ${me.title}`}
      data-testid="stranger-rail"
      data-step={me.id}
      className={`min-w-0 rounded-xl border border-amber-500/30 bg-[#0f172a] ${compact ? 'px-4 py-2.5' : 'p-4 sm:p-5'}`}
    >
      <details open={!compact} className="group">
        {compact ? (
          <summary className="cursor-pointer list-none text-sm">
            <span aria-hidden="true" className="mr-1 inline-block text-[#94a3b8] group-open:rotate-90">▸</span>
            <span className="font-mono text-xs uppercase tracking-widest text-amber-400">Step {me.n} of 4</span>
            <span className="text-[#cbd5e1]"> · {me.title}</span>
          </summary>
        ) : (
          <summary className="cursor-pointer list-none">
            <span className="block text-xs font-mono uppercase tracking-widest text-amber-400">
              Step {me.n} of 4
            </span>
            <span className="mt-1 block text-lg font-bold text-white text-wrap">{me.title}</span>
          </summary>
        )}

        <div className="mt-3 space-y-3 text-sm leading-relaxed text-[#cbd5e1]">
          <p data-testid="rail-do">
            <span className="font-semibold text-white">Do this. </span>
            {me.doThis}
          </p>
          <p data-testid="rail-see">
            <span className="font-semibold text-white">You will see. </span>
            {me.youSee}
          </p>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {!compact && <StrangerNext step={step} />}
            {skipHref && (
              <Link
                href={skipHref}
                data-testid="rail-skip"
                className="text-sm text-[#94a3b8] underline underline-offset-4 hover:text-white"
              >
                Skip this step
              </Link>
            )}
          </p>
        </div>
      </details>

      {!compact && (
        <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="The four screens">
          {STRANGER_STEPS.map((s) => {
            const here = s.id === me.id;
            const body = (
              <>
                <span className={`block text-[11px] font-mono ${here ? 'text-amber-400' : 'text-[#94a3b8]'}`}>
                  {s.n}
                  {here ? ' · you are here' : ''}
                </span>
                <span className={`mt-0.5 block text-sm font-medium ${here ? 'text-white' : 'text-[#94a3b8]'}`}>{s.label}</span>
              </>
            );
            const shell = `block h-full rounded-lg border border-[#1e293b] border-l-2 bg-[#0a0f1a] p-2.5 ${here ? 'border-l-amber-500' : 'border-l-[#1e293b]'}`;
            return (
              <li key={s.id} className="min-w-0">
                {here ? (
                  <div className={shell} aria-current="step">
                    {body}
                  </div>
                ) : (
                  <Link href={s.href} className={`${shell} hover:border-l-amber-500/60`}>
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
