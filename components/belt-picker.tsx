'use client';

import { useEffect, useState } from 'react';
import { BELTS, BELT_ROLES, type BeltRole } from '@/lib/belts';

const KEY = 'trustshell_belt_pick_v1';

function readPick(): BeltRole | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return (BELT_ROLES as readonly string[]).includes(v ?? '') ? (v as BeltRole) : null;
  } catch {
    return null;
  }
}

/**
 * Screen 2: pick a belt, or skip. The pick is a NOTE in this browser, nothing more.
 *
 * It does not give any agent a role. A role is a signed grant another app can check, and it is made
 * on the Agents page once there is a second agent (components/give-role.tsx). Saying so here, on the
 * screen, is the point: a control that reads as doing more than it does is worse than none.
 *
 * Every tool listed is the belt's STARTER column from lib/belts.ts: read-only, with the setting that
 * keeps it read-only printed beside it. The tools that spend, post or cannot be undone are on the
 * longer belt pages and are not offered here.
 */
export function BeltPicker() {
  const [pick, setPick] = useState<BeltRole | null>(null);

  useEffect(() => {
    setPick(readPick());
  }, []);

  function choose(r: BeltRole) {
    setPick(r);
    try {
      window.localStorage.setItem(KEY, r);
    } catch {
      /* the pick still shows on this page; it just is not remembered */
    }
  }

  function clear() {
    setPick(null);
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* nothing to clear */
    }
  }

  const belt = pick ? BELTS[pick] : null;

  return (
    <section aria-labelledby="belt-pick-h" data-testid="belt-picker" className="space-y-3 rounded-xl border border-[#1e293b] bg-[#0f172a] p-5">
      <h2 id="belt-pick-h" className="text-lg font-bold text-white">
        Pick a belt
      </h2>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Belts">
        {BELT_ROLES.map((r) => (
          <button
            key={r}
            type="button"
            data-testid={`belt-${r}`}
            aria-pressed={pick === r}
            onClick={() => choose(r)}
            className={`rounded border px-4 py-2 text-sm font-semibold ${pick === r ? 'border-amber-500 text-amber-400' : 'border-[#334155] text-[#cbd5e1] hover:text-white'}`}
          >
            {BELTS[r].title}
          </button>
        ))}
      </div>

      {belt ? (
        <div className="space-y-2" data-testid="belt-chosen">
          <p className="text-sm text-white">
            Written down: <span className="font-bold text-amber-400">{belt.title}</span>. {belt.purpose}
          </p>
          <ul className="space-y-1.5">
            {belt.starter.map((t) => (
              <li key={t.id} className="text-sm text-[#cbd5e1]">
                <span className="font-medium text-white">{t.name}</span> <span className="text-[#94a3b8]">· {t.use}</span>
                <span className="block text-xs text-[#64748b]">Kept read-only: {t.readOnly}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs leading-relaxed text-[#94a3b8]">
            This is a note in this browser. It does not give any agent a role and it installs nothing. A role is a signed grant,
            made on the Agents page once you have a second agent.
          </p>
          <button type="button" onClick={clear} className="text-xs text-[#94a3b8] underline hover:text-white">
            Clear my pick
          </button>
        </div>
      ) : (
        <p className="text-sm text-[#94a3b8]" data-testid="belt-none">
          No belt picked. That is fine: use Skip and nothing changes.
        </p>
      )}
    </section>
  );
}
