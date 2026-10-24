import { RECEIPT_LINES } from '@/lib/receipt-sample';

/**
 * THE HERO IMAGE FOR "YOUR AGENT SAYS THE JOB IS DONE": a real receipt, not stock art. Its lines are
 * lib/receipt-sample.ts: copied from the pinned-run challenge (docs/challenge.md) and held to it by a test.
 * A server component with no request: the page still sends nothing on load.
 */
export function ReceiptCard({ caption = true }: { caption?: boolean }) {
  const r = RECEIPT_LINES;
  return (
    <figure
      aria-labelledby="receipt-title"
      data-testid="receipt-card"
      className="min-w-0 rounded-2xl border border-slate-700 bg-[#0f172a] p-5 sm:p-6 text-left space-y-3"
    >
      <p id="receipt-title" className="text-xs font-semibold uppercase tracking-wide text-[#94a3b8]">
        A real receipt · abridged
      </p>
      <div className="space-y-1">
        <p className="text-sm text-[#94a3b8]">A claim an agent might make:</p>
        <p className="text-base sm:text-lg text-white">
          “The check workflow succeeded on commit 5d1c5e3f57e1, run 39619591025.”
        </p>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-3 font-mono text-xs sm:text-sm leading-relaxed text-slate-200">
        <span className="text-slate-400">{r.summary}</span>
        {'\n'}
        <span className="text-red-400">✗ CONTRADICTED</span> {r.contradicted.claim}
        {'\n'}
        <span className="text-slate-400">  {r.contradicted.why}</span>
        {'\n'}
        <span className="text-emerald-400">✓ SUPPORTED</span> {r.supported[0]}
        {'\n'}
        <span className="text-emerald-400">✓ SUPPORTED</span> {r.supported[1]}
        {'\n'}
        <span className="text-slate-400">{r.exit}</span>
      </pre>
      {caption && (
        <p className="text-sm text-[#94a3b8]">
          The run was on a different commit than the claim named. The check read that from GitHub’s own record.{' '}
          <a href="/inspect" className="underline underline-offset-4 hover:text-white">
            Run it yourself
          </a>
          .
        </p>
      )}
    </figure>
  );
}
