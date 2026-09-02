'use client';

import { useEffect, useState } from 'react';
import { TrustBadge } from './trust-state';
import {
  fetchAgentRepId,
  earningBlockedReason,
  REPID_LOOKUP_DETAIL,
  type RepIdLookup,
} from '@/lib/agent-repid';

/**
 * The agent's real RepID, on the card that lists it — with the reason it can be believed.
 *
 * See `lib/agent-repid.ts` for why this can never render a bare number. This file's only jobs
 * are the two things a component can get wrong that the lookup cannot.
 *
 * FIRST: LOADING IS NOT A VERDICT. The obvious implementation seeds state with NOT_CHECKED and
 * overwrites it when the fetch lands, which flashes a real verdict — "not checked" — for every
 * agent on every page load, before anything has been attempted. It is only true by accident,
 * and it trains people to read the badge as chrome. `null` means in flight and renders as
 * plainly unfinished, so the first verdict a person sees is one that was actually reached.
 *
 * SECOND: A STATIC NUMBER IS A STALE NUMBER. An agent with no API key posts no score events, so
 * its RepID is frozen at whatever it was. Rendering that figure under a "Measured" badge is
 * true and misleading in the same breath — measured, yes, but of a value that cannot move and
 * whose age is unbounded. The blocked reason is shown ALONGSIDE the measured figure rather than
 * instead of it: the number is real, and so is the fact that it has stopped.
 *
 * Each row looks itself up rather than the page fetching them together. An agent list is
 * browser-local and small, and independence is what matters more: one unreachable card must not
 * leave the other rows unresolved.
 */
export function AgentRepId({ agent }: { agent: { id: string; apiKey?: string } }) {
  const [lookup, setLookup] = useState<RepIdLookup | null>(null);

  useEffect(() => {
    let live = true;
    setLookup(null);
    fetchAgentRepId(agent.id).then((r) => {
      if (live) setLookup(r);
    });
    return () => {
      live = false;
    };
  }, [agent.id]);

  const blocked = earningBlockedReason(agent);

  if (lookup === null) {
    return (
      <p className="mt-2 text-xs text-[#64748b]" aria-live="polite">
        Reading RepID…
      </p>
    );
  }

  if (lookup.state === 'MEASURED') {
    const share = lookup.provenance
      ? `${Math.round(lookup.provenance.verifiableShareOfGains * 100)}% of gains externally verifiable`
      : null;

    return (
      <div className="mt-2 space-y-1.5">
        <p className="text-sm text-white">
          RepID <span className="font-bold">{lookup.repid.toLocaleString()}</span>
          <span className="ml-2 text-xs text-[#94a3b8]">
            {lookup.decisions.toLocaleString()} scored decision{lookup.decisions === 1 ? '' : 's'}
          </span>
        </p>
        <TrustBadge state="MEASURED" detail={share ?? undefined} />
        {/* Shown next to the figure, not in place of it — the number is real AND it has stopped. */}
        {blocked && <p className="text-xs leading-snug text-amber-400/90">{blocked}</p>}
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-1.5">
      <TrustBadge state={lookup.state} detail={REPID_LOOKUP_DETAIL[lookup.reason]} />
    </div>
  );
}
