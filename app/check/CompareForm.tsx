'use client';

import { useState } from 'react';
import { classifyClaim, DEFAULT_API_URL, ClaimError, SCRUBBED_LINE, pathLine, votesLine, type ClaimResult } from '@/src/lib/claim';
import { STAMP_TITLES, compareLine } from '@/lib/compare-line';

// NEXT_PUBLIC_* is inlined only for a literal reference, so it is spelled out here (as in CheckForm).
const ENGINE = process.env.NEXT_PUBLIC_REPID_ENGINE_URL || DEFAULT_API_URL;
const MAX_CHARS = 1500;

const TONE: Record<ClaimResult['label'], string> = {
  pass: 'text-emerald-400 border-emerald-500/40',
  veto: 'text-red-400 border-red-500/40',
  'not-checked': 'text-amber-400 border-amber-500/40',
};

/**
 * PASTE BOTH ANSWERS (Sean's GO, 2026-10-06). You asked twice and got two sure answers that cannot
 * both be right. Each one is checked on its own, side by side, and one line says what the two stamps
 * add up to (lib/compare-line.ts). Nothing here judges between them beyond the two stamps.
 *
 * Folded away by default: the cards above are the first thing to try, and this is for the person who
 * arrived holding two answers. NOTHING IS SENT until they press "Check both"; that one click sends
 * two checks, one per answer, to the same endpoint as every other door.
 */
export default function CompareForm() {
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<[ClaimResult, ClaimResult] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function checkBoth(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResults(null);
    setError(null);
    setBusy(true);
    try {
      const pair = await Promise.all([
        classifyClaim(first, { apiUrl: ENGINE, env: {} }),
        classifyClaim(second, { apiUrl: ENGINE, env: {} }),
      ]);
      setResults(pair);
    } catch (err) {
      setError(err instanceof ClaimError ? err.message : 'Something went wrong before the answers were sent.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="rounded-xl border border-[#1e293b] bg-[#0b1220] p-4" data-testid="compare">
      <summary className="cursor-pointer text-sm font-semibold text-[#e2e8f0]">
        Got two answers that disagree? Paste both
      </summary>
      <form onSubmit={checkBoth} className="mt-4 space-y-3" data-testid="compare-form">
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ['compare-first', 'First answer', first, setFirst],
              ['compare-second', 'Second answer', second, setSecond],
            ] as const
          ).map(([id, label, value, set]) => (
            <div key={id} className="space-y-1">
              <label htmlFor={id} className="block text-sm font-medium text-[#94a3b8]">
                {label}
              </label>
              <textarea
                id={id}
                data-testid={id}
                required
                rows={3}
                maxLength={MAX_CHARS}
                value={value}
                onChange={(e) => set(e.target.value)}
                aria-describedby="compare-privacy"
                className="w-full px-3 py-2 bg-[#0f172a] border border-[#1e293b] rounded-lg text-white text-base focus:outline-none focus:border-amber-500 resize-y"
              />
            </div>
          ))}
        </div>
        <p id="compare-privacy" className="text-sm text-[#94a3b8]">
          Each answer is checked on its own, by the same checkers as above. It is not stored. Do not paste anything private.
        </p>
        <button
          type="submit"
          data-testid="compare-submit"
          disabled={busy || !first.trim() || !second.trim()}
          className="w-full sm:w-auto px-6 py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-[#334155] disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
        >
          {busy ? 'Checking both at once…' : 'Check both'}
        </button>

        {results && (
          <div role="status" className="space-y-3" data-testid="compare-result">
            <div className="grid gap-3 sm:grid-cols-2">
              {results.map((r, i) => {
                // A reason means this page decided not-checked itself (no usable answer), so no
                // checker is named for it.
                const said = r.reason ? 'No usable answer came back.' : votesLine(r.votes) || pathLine(r);
                return (
                  <div
                    key={i}
                    className={`rounded-lg border bg-[#0f172a] p-3 ${TONE[r.label]}`}
                    data-testid="compare-stamp"
                    data-label={r.label}
                  >
                    <p className="text-xs text-[#64748b]">{i === 0 ? 'First answer' : 'Second answer'}</p>
                    <p className="text-lg font-bold" title={r.label}>
                      {STAMP_TITLES[r.label]}
                    </p>
                    {said && <p className="text-sm text-[#94a3b8]">{said}</p>}
                    {r.scrubbed && <p className="text-sm text-[#94a3b8]">{SCRUBBED_LINE}</p>}
                  </div>
                );
              })}
            </div>
            <p className="text-base text-[#e2e8f0]" data-testid="compare-line">
              {compareLine(results[0].label, results[1].label)}
            </p>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-400" data-testid="compare-error">
            {error}
          </p>
        )}
      </form>
    </details>
  );
}
