'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { localDb, type Agent } from '@/lib/db';
import { fetchAgentOwner, shortAddress, type AgentOwner } from '@/lib/human-bind';
import { ClaimPanel } from './claim-panel';
import { OwnedAgents } from './owned-agents';
import { Rule } from './marks';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Choosing which agent to claim, then claiming it.
 *
 * THE COMMON CASE IS ONE AGENT AND NO CHOICE. Somebody arriving here has almost
 * always just built a PAI in this browser, so that agent is selected and the
 * picker stays out of the way. The paste field exists for the other case — an
 * agent made on another device, which is currently the only way to reach it,
 * because the agent list lives in this browser's storage.
 *
 * OWNERSHIP IS CHECKED BEFORE ANYTHING IS SIGNED. `GET /agents/:id/owner` is
 * public, so we can tell somebody an agent is already claimed without asking
 * them to open a wallet and fail. It also keeps the engine's distinction
 * intact: PROVEN by signature is ownership; LINKED to an account is not.
 */
export function BindClient() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [pasted, setPasted] = useState('');
  const [owner, setOwner] = useState<AgentOwner | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    localDb.getAgents().then((a) => {
      setAgents(a);
      if (a.length > 0 && a[0]) setSelectedId(a[0].id);
      setLoaded(true);
    });
  }, []);

  const agentId = (pasted.trim() || selectedId).trim();
  const valid = UUID.test(agentId);
  const local = agents.find((a) => a.id === agentId);

  useEffect(() => {
    if (!valid) return;
    let ignore = false;
    fetchAgentOwner(agentId).then((o) => {
      if (ignore) return;
      setOwner(o);
      setChecking(false);
    });
    return () => {
      ignore = true;
      setOwner(null);
      setChecking(true);
    };
  }, [agentId, valid]);

  return (
    <div className="space-y-14">
      <section className="space-y-5">
        <h2 className="text-xl font-semibold text-[#fafafa]">Which agent</h2>

        {!loaded ? (
          <div className="h-12 animate-pulse rounded-lg bg-[#141416]" aria-hidden />
        ) : pasted.trim() ? (
          <p className="text-[#a1a1aa]">
            Using the ID you pasted{local ? <> — <span className="font-medium text-[#fafafa]">{local.name}</span></> : null}.
          </p>
        ) : agents.length === 0 ? (
          <div className="space-y-2 rounded-lg border border-dashed border-[#3f3f46] px-6 py-5">
            <p className="text-sm text-[#a1a1aa]">
              There are no agents saved in this browser.
            </p>
            <p className="text-sm text-[#a1a1aa]">
              <Link href="/pai" className="text-accent underline underline-offset-2">
                Build one first
              </Link>{' '}
              — it takes a few minutes and asks nothing of you — or paste an agent ID below.
            </p>
          </div>
        ) : agents.length === 1 && agents[0] ? (
          <p className="text-[#a1a1aa]">
            <span className="font-medium text-[#fafafa]">{agents[0].name}</span>
            <span className="ml-3 font-mono text-[13px] text-[#a1a1aa]">
              {shortAddress(agents[0].id)}
            </span>
          </p>
        ) : agents.length > 1 ? (
          <label className="block max-w-md space-y-2">
            <span className="text-sm text-[#a1a1aa]">Agent</span>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full rounded-md border border-[#3f3f46] bg-[#0d0d0f] px-3 py-2 text-sm text-[#fafafa] transition-colors hover:border-[#52525b]"
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <details className="group">
          <summary className="cursor-pointer list-none text-sm text-[#a1a1aa] underline underline-offset-2 transition-colors hover:text-[#a1a1aa]">
            Claim an agent from another device
          </summary>
          <label className="mt-3 block max-w-md space-y-2">
            <span className="text-sm text-[#a1a1aa]">Agent ID</span>
            <input
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              spellCheck={false}
              className="w-full rounded-md border border-[#3f3f46] bg-[#0d0d0f] px-3 py-2 font-mono text-[13px] text-[#fafafa] placeholder:text-[#8b97a8] transition-colors hover:border-[#52525b]"
            />
            {pasted.trim() && !valid && (
              <span className="block text-sm text-[#fda4af]">
                That is not an agent ID. They look like the example above.
              </span>
            )}
          </label>
        </details>
      </section>

      {valid && (
        <section className="space-y-6">
          {checking ? (
            <div className="h-20 animate-pulse rounded-lg bg-[#141416]" aria-hidden />
          ) : owner?.owned ? (
            <div className="space-y-2 rounded-lg border border-[#27272a] bg-[#131315] px-6 py-5">
              <h3 className="text-base font-semibold text-[#fafafa]">
                This agent already has an owner
              </h3>
              <p className="max-w-[62ch] text-sm leading-relaxed text-[#a1a1aa]">
                Somebody has signed for it. It can only be claimed again once they revoke —
                which is deliberate: an agent that could be re-claimed out from under its owner
                would not be owned at all.
              </p>
            </div>
          ) : (
            <>
              {owner?.linked_account && (
                <p className="max-w-[62ch] rounded-lg border border-dashed border-[#3f3f46] px-5 py-4 text-sm leading-relaxed text-[#a1a1aa]">
                  This agent is associated with an account, but nobody has signed for it, so it
                  is <span className="text-[#fafafa]">not owned</span>. An association is
                  paperwork; a signature is proof. Claiming it below is what makes it yours.
                </p>
              )}
              <ClaimPanel agentId={agentId} agentName={local?.name ?? null} />
            </>
          )}
        </section>
      )}

      <Rule />
      <OwnedAgents />
    </div>
  );
}
