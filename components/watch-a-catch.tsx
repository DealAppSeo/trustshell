import { CATCH } from '@/lib/watch-catch';
import { CATCH_RECORD } from '@/lib/recordings/catch-1.9.3';

/**
 * Step 1 of the loop: watch a false claim get caught, then a true one get through, so the check is
 * seen to be fair. Recorded output of the published package (lib/recordings), never a live call: the
 * page sends nothing when it opens. Every verdict line comes from the record via lib/watch-catch.ts.
 */

function Verdict({ kind }: { kind: string }) {
  const color = kind === 'SUPPORTED' ? 'var(--state-measured)' : kind === 'CONTRADICTED' ? 'var(--state-failed)' : 'var(--state-not-checked)';
  return (
    <span className="inline-block rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-wide" style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
      {kind}
    </span>
  );
}

function Claim({ said, kind, why, label }: { said: string; kind: string; why: string; label: string }) {
  return (
    <li className="min-w-0 space-y-2 rounded-lg border border-border bg-background/60 p-3 sm:p-4">
      <p className="text-xs uppercase tracking-widest text-slate-400">{label}</p>
      <p className="text-white [overflow-wrap:anywhere]">&ldquo;{said}&rdquo;</p>
      <p className="flex flex-wrap items-baseline gap-2 text-sm text-slate-300">
        <Verdict kind={kind} />
        <span className="min-w-0 [overflow-wrap:anywhere]">{why}</span>
      </p>
    </li>
  );
}

export function WatchACatch() {
  return (
    <section id="watch" aria-labelledby="watch-h" data-testid="watch-a-catch" className="scroll-mt-24 space-y-4 rounded-xl border border-border bg-card/40 p-4 sm:p-5">
      <div className="space-y-1">
        <h2 id="watch-h" className="text-xl font-semibold text-white">
          Watch an agent get caught
        </h2>
        <p className="text-sm leading-relaxed text-slate-300">
          An agent reports that a CI run passed. We wrote two example reports about a real GitHub Actions run, one with the wrong commit. TrustShell read GitHub&apos;s own record of the run and marked each one.
        </p>
      </div>
      <ol className="space-y-3">
        <Claim label="The agent said" said={CATCH.caught.said} kind={CATCH.caught.status} why={CATCH.caught.why} />
        <Claim label="Then a true report" said={CATCH.fair.said} kind={CATCH.fair.status} why={CATCH.fair.why} />
      </ol>
      <p className="text-sm text-slate-300">
        The command ended with <code className="font-mono text-white">{CATCH.exit}</code>: at least one claim was contradicted. Supported is narrow: a green run supports &ldquo;this run succeeded&rdquo;, not &ldquo;all tests pass&rdquo;.
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <a href={CATCH.runUrl} className="inline-flex min-h-11 items-center rounded-lg border border-amber-500/60 px-4 text-sm font-semibold text-amber-300 hover:bg-card">
          Open run {CATCH.runId} on GitHub
        </a>
        <details className="min-w-0 basis-full text-sm text-slate-300">
          <summary className="cursor-pointer text-slate-400 underline underline-offset-4">See the whole recorded output</summary>
          <p className="mt-2 text-xs text-slate-400">
            Recorded with @hyperdag/trustshell 1.9.3. Observed {CATCH.observed}. This page shows the recording and sends nothing.
          </p>
          {/* Focusable: a box that scrolls must be reachable by keyboard (axe scrollable-region-focusable). */}
          <pre data-testid="catch-record" tabIndex={0} aria-label="The whole recorded output" className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-[#0d1117] p-3 font-mono text-xs leading-relaxed text-[#c9d1d9] [overflow-wrap:anywhere]">
            {CATCH_RECORD}
          </pre>
        </details>
      </div>
    </section>
  );
}
