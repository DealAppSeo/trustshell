import { WORDS } from '@/lib/try-samples';
import type { TryResult, VerifyResult, Verdict } from '@/lib/try-door';

const COLOR: Record<Verdict, string> = {
  SUPPORTED: 'var(--state-measured)',
  CONTRADICTED: 'var(--state-failed)',
  NOT_CHECKED: 'var(--state-not-checked)',
};

/** What a visitor sees after a check: verdict, one line of evidence, a time, and (only with a receipt) the verify action. Pure, so tests render it. */
export function TryResultView({ result, verify, busy, onVerify }: { result: TryResult; verify: VerifyResult | null; busy: boolean; onVerify: () => void }) {
  return (
    <div data-testid="try-result" data-verdict={result.verdict} className="space-y-2 rounded-xl border border-border bg-card/40 p-4">
            <p className="font-mono text-sm font-semibold tracking-wide" style={{ color: COLOR[result.verdict] }} data-testid="try-verdict">
              {result.verdict}
            </p>
            <p className="text-white">{WORDS[result.verdict]}</p>
            <p className="text-sm text-slate-300 [overflow-wrap:anywhere]" data-testid="try-evidence">
              {result.evidence}
            </p>
            <p className="text-xs text-slate-400" data-testid="try-time">
              Read at <time dateTime={result.timestamp}>{result.timestamp}</time>
            </p>
            {result.record && result.digest && (
              <div className="space-y-2 pt-1">
                <button type="button" onClick={onVerify} disabled={busy} data-testid="try-verify" className="rounded-lg border border-border px-3 py-2 text-sm text-slate-200 disabled:opacity-60">
                  Verify receipt
                </button>
                <p className="text-xs text-slate-400 [overflow-wrap:anywhere]" data-testid="try-receipt-id">
                  Receipt {result.digest.algorithm} over {result.digest.canonicalization}: {result.digest.value}
                </p>
              </div>
            )}
            {verify && (
              <div data-testid="try-verify-result" data-outcome={verify.outcome} className="space-y-1 rounded-lg border border-border p-3 text-sm text-slate-200">
                <p className="font-semibold">{verify.outcome === 'MATCH' ? 'Receipt checks out' : verify.outcome === 'MISMATCH' ? 'Receipt does not check out' : 'Receipt not checked'}</p>
                {verify.lines.map((l) => (
                  <p key={l}>{l}</p>
                ))}
                <p className="text-xs text-slate-400">Checked at {verify.timestamp}</p>
              </div>
            )}
          </div>
  );
}
