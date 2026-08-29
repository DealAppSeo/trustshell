'use client';

import { useState } from 'react';
import {
  fetchPreviewProjection,
  type PreviewProjection,
} from '@/lib/repid-engine';

/**
 * The four actions a newcomer can most plausibly picture themselves doing. Deliberately a
 * SHORT list and not the whole catalogue: the full tariff is rendered below this component,
 * and a projector with thirty checkboxes answers nobody's actual question.
 *
 * These are labels only. Every VALUE comes from the engine — nothing here hardcodes a delta,
 * because a number duplicated on the client is a number that will eventually disagree with
 * the one the scorer uses.
 */
const CHOICES: { eventType: string; label: string }[] = [
  { eventType: 'REFERRAL', label: 'Refer another agent' },
  { eventType: 'CODE_CONTRIBUTION', label: 'Contribute code' },
  { eventType: 'PEACEMAKER', label: 'Resolve a dispute' },
  { eventType: 'STAKE', label: 'Post stake' },
];

export default function Projector() {
  const [selected, setSelected] = useState<string[]>(['REFERRAL', 'CODE_CONTRIBUTION']);
  const [base, setBase] = useState('');
  const [result, setResult] = useState<PreviewProjection | 'not_checked' | null>(null);
  const [pending, setPending] = useState(false);

  const toggle = (e: string) =>
    setSelected((cur) => (cur.includes(e) ? cur.filter((x) => x !== e) : [...cur, e]));

  async function run() {
    setPending(true);
    // Cleared BEFORE the call, not after: leaving the previous answer on screen while a new
    // one is in flight shows a number that no longer answers the question being asked.
    setResult(null);
    const trimmed = base.trim();
    const parsed = trimmed === '' ? undefined : Number(trimmed);
    setResult(
      await fetchPreviewProjection({
        base: parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined,
        eventTypes: selected,
      }),
    );
    setPending(false);
  }

  return (
    <section className="space-y-5 rounded-lg border border-neutral-800 p-6">
      <h2 className="text-lg font-semibold text-neutral-200">Project a score forward</h2>

      <div className="flex flex-wrap gap-2">
        {CHOICES.map((c) => (
          <button
            key={c.eventType}
            type="button"
            onClick={() => toggle(c.eventType)}
            aria-pressed={selected.includes(c.eventType)}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              selected.includes(c.eventType)
                ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                : 'border-neutral-700 text-neutral-400 hover:border-neutral-500'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label htmlFor="base" className="text-sm text-neutral-400">
          Starting score
        </label>
        <input
          id="base"
          type="number"
          value={base}
          onChange={(e) => setBase(e.target.value)}
          placeholder="engine default"
          className="w-40 rounded-md border border-neutral-700 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-amber-500"
        />
        <button
          type="button"
          onClick={run}
          disabled={pending || selected.length === 0}
          className="rounded-md bg-amber-500 px-5 py-1.5 text-sm font-semibold text-black hover:bg-amber-400 disabled:opacity-40"
        >
          {pending ? 'Projecting…' : 'Project'}
        </button>
      </div>

      {result === 'not_checked' && (
        <div className="rounded-md border border-neutral-700 bg-neutral-900/40 p-4 text-sm">
          <p className="font-semibold text-neutral-200">NOT_CHECKED</p>
          <p className="mt-1 text-neutral-400">
            The engine could not be reached, so no projection was made. That is not a projection
            of zero.
          </p>
        </div>
      )}

      {result && result !== 'not_checked' && (
        <div className="space-y-4 rounded-md border border-neutral-700 bg-neutral-900/40 p-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-sm text-neutral-400">{result.baseRepId}</span>
            <span className="text-neutral-600">→</span>
            <span className="text-2xl font-bold text-amber-400">{result.projectedRepId}</span>
            <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs font-semibold text-neutral-300">
              {result.projectedTier}
            </span>
            <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs font-semibold text-neutral-400">
              {result.measurement}
            </span>
          </div>

          {/* The tier caveat is rendered next to the tier, not filed at the bottom of the page.
              A qualification the reader has to go looking for is one they will not read. */}
          {result.tierIsCounterpartyGateApproximation && (
            <p className="text-xs leading-relaxed text-amber-500/90">{result.tierCaveat}</p>
          )}

          <ul className="space-y-1.5 text-xs">
            {result.events.map((e) => (
              <li key={e.eventType} className="flex flex-wrap gap-x-2 text-neutral-400">
                <span className="font-mono text-neutral-300">{e.eventType}</span>
                {e.verdict === 'NOT_CHECKED' || e.delta === null ? (
                  <span className="font-semibold text-neutral-500">
                    NOT_CHECKED — contributes nothing to the total above
                  </span>
                ) : (
                  <span className="font-semibold text-emerald-400">
                    {e.delta > 0 ? `+${e.delta}` : e.delta}
                  </span>
                )}
              </li>
            ))}
          </ul>

          <div className="border-t border-neutral-800 pt-3">
            <p className="text-xs font-semibold text-neutral-300">
              What this number leaves out
            </p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs leading-relaxed text-neutral-500">
              {result.omits.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
            {/* Read off the RESPONSE, not asserted from the page's own belief about what this
                endpoint does. If a future version of the engine ever started persisting, the
                claim that it did not must stop being made here at the same moment. */}
            <p className="mt-3 text-xs text-neutral-500">
              {result.persisted === false
                ? 'Nothing was written. No reputation was earned, and no record of this exists.'
                : 'The engine did not confirm this was write-free. Treat it as a live call, not a preview.'}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
