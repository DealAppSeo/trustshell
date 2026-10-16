'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { localDb, type Agent } from '@/lib/db';
import { fetchTwoFields, type TwoFieldsRead } from '@/lib/passport-client';

const WHY: Record<Extract<TwoFieldsRead, { state: 'NOT_CHECKED' }>['reason'], string> = {
  no_engine: 'No engine is configured for this deploy.',
  unreachable: 'The engine could not be reached just now.',
  not_found: 'The engine has no passport for this agent.',
  bad_response: 'The engine answered with something this page could not read.',
};

/**
 * "Your agent", as TWO fields: the score and the ERC-8004 ID. Shown on the check screen so a
 * stranger can see, beside a receipt, that the check did not move the score.
 *
 * It reads the score when the page opens (the baseline) and again after each new answer, and says
 * plainly whether it changed. The check writes nothing, so the honest expected line is
 * "unchanged". If it ever differs, the line says the change came from something else rather than
 * crediting the check, and an unreadable score is "not checked", never zero.
 *
 * The ID is the engine's three states (MINTED / UNVERIFIED / NOT_MINTED) through
 * lib/erc8004-display.ts, where MINTED means VERIFIED: the engine's own MINTED is a record of a mint transaction, so
 * it is shown as on-chain only when the registry is the canonical one and the engine's live ownerOf read found an
 * owner (E-1). A new agent made on this site is off-chain only, and says so.
 */
export function AgentTwoFields({ resultAt }: { resultAt?: number }) {
  const [agent, setAgent] = useState<Agent | null | undefined>(undefined);
  const [baseline, setBaseline] = useState<TwoFieldsRead | null>(null);
  const [latest, setLatest] = useState<TwoFieldsRead | null>(null);

  useEffect(() => {
    let live = true;
    localDb
      .getAgents()
      .then((all) => {
        if (!live) return;
        const mine = [...all].sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
        setAgent(mine);
        if (mine) {
          fetchTwoFields(mine.id).then((r) => {
            if (!live) return;
            setBaseline(r);
            setLatest(r);
          });
        }
      })
      .catch(() => live && setAgent(null));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!agent || !resultAt) return;
    let live = true;
    fetchTwoFields(agent.id).then((r) => {
      if (live) setLatest(r);
    });
    return () => {
      live = false;
    };
  }, [agent, resultAt]);

  if (agent === undefined) return null;
  if (agent === null) {
    return (
      <section data-testid="two-fields-none" className="rounded-lg border border-dashed border-[#334155] p-3 text-sm text-[#94a3b8]">
        You have no agent in this browser yet, so there is no score to watch. The check works without one.{' '}
        <Link href="/agents" className="text-amber-500 underline underline-offset-2">
          Name an agent
        </Link>
        .
      </section>
    );
  }

  const read = latest?.state === 'READ' ? latest.fields : null;
  const was = baseline?.state === 'READ' ? baseline.fields.score : null;
  const now = read?.score ?? null;

  let moved = '';
  if (resultAt && now !== null && was !== null) {
    moved =
      now === was
        ? `Unchanged by this check (it was ${was} when you opened this page).`
        : `Now ${now}, was ${was} when you opened this page. This check wrote nothing to a score, so the change came from something else.`;
  }

  return (
    <section aria-label="Your agent" data-testid="agent-two-fields" className="space-y-2 rounded-lg border border-[#1e293b] bg-[#0f172a] p-3">
      <p className="text-sm text-white">
        Your agent: <span className="font-bold">{agent.name}</span>
      </p>
      {latest === null ? (
        <p className="text-xs text-[#94a3b8]">Reading…</p>
      ) : latest.state === 'NOT_CHECKED' ? (
        <p className="text-sm text-[#94a3b8]" data-testid="two-fields-not-checked">
          Not checked: {WHY[latest.reason]} That is not a score of zero.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <div data-testid="two-fields-score">
            <p className="text-[11px] font-mono uppercase tracking-widest text-[#94a3b8]">Field 1 · Score</p>
            <p className="text-lg font-bold text-white">{read?.score ?? 'Not checked'}</p>
            {moved && (
              <p className="text-xs text-[#94a3b8]" data-testid="two-fields-moved">
                {moved}
              </p>
            )}
          </div>
          <div data-testid="two-fields-id">
            <p className="text-[11px] font-mono uppercase tracking-widest text-[#94a3b8]">Field 2 · ERC-8004 ID</p>
            <p className="text-lg font-bold text-white">
              {read?.token.state === 'ID' ? `#${read.token.id}` : read?.mint === 'NOT_MINTED' ? 'None yet' : 'Not checked'}
            </p>
            <p className="text-xs text-[#94a3b8]">
              {read?.mint === 'MINTED'
                ? 'Registered on-chain: the engine\'s live ownerOf read found an owner for this token.'
                : read?.recordedMint
                  ? `Not checked: ${read.why}. Recorded, not verified.`
                  : read?.mint === 'UNVERIFIED'
                    ? 'Has a token id; no record of the mint transaction here.'
                    : read?.mint === 'NOT_MINTED'
                      ? 'Off-chain only. No on-chain ID has been minted.'
                      : 'The engine did not say.'}
            </p>
          </div>
        </div>
      )}
      <p className="text-xs text-[#94a3b8]">The score is how it has behaved. The ID is which agent it is. Two different things.</p>
    </section>
  );
}
