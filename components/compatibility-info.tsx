'use client';

import { useEffect, useState } from 'react';
import { TrustBadge } from './trust-state';

/**
 * Independent cross-examination — the live quorum card.
 *
 * WHAT THIS USED TO BE. This file once rendered a wall of marketing: a "MAESTRO Layer 6
 * Compliant" badge, five hardcoded signal percentages (94/87/91/14/2) presented as if they
 * were a measurement, and a line asserting an exact internal certainty threshold as fact. None
 * of those were read from anything — they were decoration dressed as data, which is the one
 * thing this codebase refuses (CLAUDE.md: three outcomes, never two; a number nobody measured
 * is not a result). They are gone.
 *
 * WHAT IT IS NOW. The one honest, load-bearing part of the original: a card that reads the
 * engine's real quorum configuration from `/api/v1/hal/stats` and shows ONLY what that endpoint
 * actually returns — how many independent model families the check requires, and their names.
 * If the engine cannot be reached, it says so as NOT_CHECKED; it never invents a count. Re-skinned
 * from the old indigo/slate palette to the house tokens so a verdict can never be mistaken for a
 * call to action.
 */

const ENGINE_URL =
  process.env.NEXT_PUBLIC_REPID_ENGINE_URL ??
  'https://repid-engine-production.up.railway.app';

type QuorumState =
  | { kind: 'loading' }
  | { kind: 'read'; families: number; names: string[] }
  | { kind: 'unread' };

export function CompatibilityInfo() {
  // Null-until-read, so a genuine verdict is never flashed before anything was attempted.
  const [state, setState] = useState<QuorumState>({ kind: 'loading' });

  useEffect(() => {
    let live = true;
    fetch(`${ENGINE_URL}/api/v1/hal/stats`, { signal: AbortSignal.timeout(6000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!live) return;
        if (d && typeof d.quorum_families === 'number' && d.quorum_families > 0) {
          setState({
            kind: 'read',
            families: d.quorum_families,
            names: Array.isArray(d.quorum_family_names) ? d.quorum_family_names : [],
          });
        } else {
          // The endpoint answered with nothing usable. That is "not read", never a count of zero.
          setState({ kind: 'unread' });
        }
      })
      .catch(() => {
        if (live) setState({ kind: 'unread' });
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <div
      data-testid="quorum-live"
      className="rounded-xl border border-border bg-card p-5 space-y-4"
    >
      <div className="space-y-1">
        <p className="text-[11px] uppercase tracking-widest text-accent font-semibold">
          Independent cross-examination
        </p>
        <h3 className="text-lg font-semibold text-foreground">No model grades its own family&apos;s homework</h3>
      </div>
      <p className="text-sm text-muted leading-relaxed">
        A claim is cross-checked by a quorum of decorrelated model families. A blind spot shared by
        one lineage gets caught by another that fails differently — so a confident wrong answer has
        to survive scrutiny from a model that does not share its training. Suspiciously perfect
        agreement is a reason for a second look, not a rubber stamp.
      </p>

      <div className="rounded-lg border border-border/60 bg-background/40 p-4 space-y-2">
        <p className="text-[11px] font-mono uppercase tracking-widest text-muted/70">
          Live quorum, read from the engine
        </p>
        {state.kind === 'loading' && (
          <p className="text-sm text-muted" aria-live="polite">
            Reading the live quorum configuration…
          </p>
        )}
        {state.kind === 'read' && (
          <div className="space-y-2">
            <p className="text-sm text-foreground">
              Requires{' '}
              <span className="font-bold">{state.families}</span> independent model{' '}
              {state.families === 1 ? 'family' : 'families'} to agree.
            </p>
            {state.names.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {state.names.map((f) => (
                  <span
                    key={f}
                    className="rounded border border-border bg-card px-2 py-0.5 font-mono text-[10px] text-muted"
                  >
                    {f}
                  </span>
                ))}
              </div>
            )}
            <TrustBadge state="MEASURED" detail="live, from the engine's own quorum config" />
          </div>
        )}
        {state.kind === 'unread' && (
          <div className="space-y-1">
            <TrustBadge
              state="NOT_CHECKED"
              detail="the engine's live quorum config could not be read just now — that is not a count of zero"
            />
          </div>
        )}
      </div>
    </div>
  );
}
