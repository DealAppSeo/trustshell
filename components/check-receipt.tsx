import { CopyReceiptLine } from '@/components/copy-receipt-line';
import { receiptOf, type ReceiptInput, type ReceiptStatus } from '@/lib/check-receipt';

const TONE: Record<ReceiptStatus, string> = {
  PROVISIONAL: 'text-amber-300 border-amber-500/40',
  EXACT_CALCULATION: 'text-sky-300 border-sky-500/40',
  APPROXIMATE_CALCULATION: 'text-sky-300 border-sky-500/40',
  NOT_CHECKED: 'text-slate-300 border-slate-500/40',
};

/**
 * The receipt under a check's answer (screen 3). It says what the answer rests on and what it did
 * to a score, from lib/check-receipt.ts: a vote alone is PROVISIONAL, this page settles nothing and
 * writes no score, and a Not checked is a no for any spend or post. The copyable lines hold who said
 * what and never the sentence that was checked.
 */
export function CheckReceipt({ result }: { result: ReceiptInput }) {
  const r = receiptOf(result);
  return (
    <section
      aria-label="Receipt"
      data-testid="check-receipt"
      data-status={r.status}
      className="mt-3 space-y-2 rounded-lg border border-[#1e293b] bg-[#0b1220] p-3"
    >
      <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="font-semibold text-white">Receipt</span>
        <span
          data-testid="receipt-status"
          className={`rounded border px-2 py-0.5 text-xs font-bold tracking-wide ${TONE[r.status]}`}
        >
          {r.word}
        </span>
      </p>
      <p className="text-sm text-[#cbd5e1]" data-testid="receipt-status-line">
        {r.statusLine}
      </p>
      {r.lines.length > 0 && (
        <div className="space-y-1.5" data-testid="receipt-lines">
          <p className="text-xs text-[#94a3b8]">Who said what, as lines you can copy. The sentence is not in them.</p>
          {r.lines.map((line, i) => (
            <CopyReceiptLine key={`${line}-${i}`} line={line} />
          ))}
        </div>
      )}
      {r.gateLine && (
        <p className="text-sm text-[#cbd5e1]" data-testid="receipt-gate">
          {r.gateLine}
        </p>
      )}
      <p className="text-sm text-[#cbd5e1]" data-testid="receipt-score">
        {r.scoreLine}
      </p>
    </section>
  );
}
