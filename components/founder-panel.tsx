'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { founderGoals, type GoalVersion } from '@/lib/founder-goals';
import { ROLE_PACKS } from '@/lib/role-packs';
import { TrustBadge, EmptyState } from '@/components/trust-state';

/** Surfaces that are specified but have no runtime behind them. Listed, never rendered live. */
const UNBUILT = [
  'Steer — inject an instruction into a running loop',
  'Stop — halt tool use and spend',
  'GateRun stream',
  'Lane health (XC / GA / CC)',
  'Simulation flags',
] as const;

/**
 * The founder-only panel. Renders nothing unless Founder Mode is on.
 *
 * WHAT IS HERE IS REAL; WHAT IS NOT HERE IS NAMED. The goals board writes real versioned
 * history, and the Grants link goes to the live grants surface where a real revoke works
 * against `principal_grants`. Steer, stop, the GateRun stream, lane health and sim flags are
 * NOT built — they are listed at the bottom as absent rather than rendered as inert controls.
 * A dead button that looks live is worse than no button: it invites the founder to believe an
 * instruction landed somewhere when nothing read it.
 */
export function FounderPanel({ onFiled }: { onFiled?: (msg: string) => void }) {
  const [history, setHistory] = useState<GoalVersion[]>([]);
  const [draft, setDraft] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [showRoles, setShowRoles] = useState(false);

  useEffect(() => {
    founderGoals.history().then((h) => {
      setHistory(h);
      setDraft(h[0]?.text ?? '');
    });
  }, []);

  const saveGoals = async () => {
    const saved = await founderGoals.save(draft);
    if (!saved) {
      onFiled?.('Goals unchanged — no new version written.');
      return;
    }
    setHistory(await founderGoals.history());
    onFiled?.(`Goals saved as v${saved.version}. Previous versions kept, nothing overwritten.`);
  };

  return (
    <div className="space-y-4 rounded-xl border border-amber-500/30 bg-amber-600/5 p-5">
      {/* Goals — versioned */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-amber-300">
            Goals {history[0] ? `· v${history[0].version}` : '· not set'}
          </h2>
          {history.length > 1 && (
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="text-xs text-[#94a3b8] underline decoration-dotted hover:text-white"
            >
              {showHistory ? 'Hide' : `${history.length} versions`}
            </button>
          )}
        </div>

        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder="The outcomes this should be optimising for…"
          className="w-full resize-none rounded-lg border border-[#334155] bg-[#0a0f1a] p-3 text-sm text-white"
        />

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void saveGoals()}
            className="rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-amber-500"
          >
            Save version
          </button>
          <span className="text-xs text-[#64748b]">
            Appends — earlier versions are never overwritten.
          </span>
        </div>

        {history.length === 0 && (
          <EmptyState
            title="No goals written yet."
            detail="Nothing is optimising for anything in particular. Write what this should be aiming at — you can revise it, and every earlier version is kept."
          />
        )}

        {showHistory && (
          <ul className="space-y-2 pt-2">
            {history.map((g) => (
              <li key={g.version} className="rounded-lg border border-[#1e293b] bg-[#0a0f1a] p-3">
                <div className="text-xs text-[#64748b]">
                  v{g.version} · {new Date(g.createdAt).toLocaleString()}
                </div>
                <div className="mt-1 whitespace-pre-wrap text-sm text-[#e2e8f0]">{g.text}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Grants — the live surface, not a copy of it */}
      <section className="border-t border-amber-500/20 pt-4">
        <h2 className="text-sm font-semibold text-amber-300">Grants</h2>
        <p className="mt-1 text-xs text-[#94a3b8]">
          Who can act on your behalf, with what scope and budget — and revoke, which takes
          effect on the next read for the whole chain beneath it.
        </p>
        <Link
          href="/grants"
          className="mt-2 inline-block text-xs font-semibold text-amber-500 hover:underline"
        >
          Open Grants →
        </Link>
      </section>

      {/* Role packs — templates only */}
      <section className="border-t border-amber-500/20 pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-amber-300">
            Role packs · {ROLE_PACKS.length} templates
          </h2>
          <button
            type="button"
            onClick={() => setShowRoles((v) => !v)}
            className="text-xs text-[#94a3b8] underline decoration-dotted hover:text-white"
          >
            {showRoles ? 'Hide' : 'Show'}
          </button>
        </div>
        <p className="mt-1 text-xs text-[#94a3b8]">
          Default grant shapes, not products or dashboards. A pack pre-fills a grant; every
          bound on it is enforced by the kernel, and applying one still requires you to issue
          the grant. Reading this list grants nothing.
        </p>

        {showRoles && (
          <ul className="mt-3 space-y-2">
            {ROLE_PACKS.map((r) => (
              <li key={r.id} className="rounded-lg border border-[#1e293b] bg-[#0a0f1a] p-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-semibold text-white">{r.label}</span>
                  <span className="text-xs text-[#64748b]">
                    {r.tier === 'c_level' ? 'C-level' : 'function'} · spend cap $
                    {r.spendCapUsd}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-[#94a3b8]">{r.purpose}</div>
                <div className="mt-1 font-mono text-[11px] text-[#64748b]">
                  {r.capabilities.join('  ')}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Honest absence list — rendered in the same vocabulary as every other verdict. */}
      <section className="space-y-3 border-t border-amber-500/20 pt-4">
        <h2 className="text-sm font-semibold text-[#a8b3c2]">Specified, not built</h2>
        <p className="text-xs leading-relaxed text-[#64748b]">
          Named here rather than shown as controls. Nothing reads any of these at runtime yet —
          including the goals above. A control that looks live and does nothing invites you to
          believe an instruction landed somewhere it never reached.
        </p>
        <ul className="flex flex-wrap gap-2">
          {UNBUILT.map((item) => (
            <li key={item}>
              <TrustBadge state="NOT_CHECKED" detail={item} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
