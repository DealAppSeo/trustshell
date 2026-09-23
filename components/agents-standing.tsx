'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  fetchLeaderboard,
  standingAmong,
  ordinal,
  LEADERBOARD_LOOKUP_DETAIL,
  type LeaderboardLookup,
} from '@/lib/agent-leaderboard';
import { fetchAgentRepId, type RepIdLookup } from '@/lib/agent-repid';

/**
 * The leaderboard, on the page that kept talking about it.
 *
 * `/agents` told people their agent name is "how it appears on the leaderboard"
 * and that "honest agents climb the Leaderboard", and then offered no link to it
 * and no sign of where anything stood. The one page that introduces RepID was the
 * one that gave it no reference frame: a new agent shows 200 and there was nothing
 * on screen to say whether that is good.
 *
 * TWO THINGS THIS DELIBERATELY WILL NOT DO.
 *
 * It will not render a bare position. `standingAmong` returns `outOf` and this
 * component always prints it, because the board is the twelve Trinity agents and
 * not every agent alive — "4th" implies a population this endpoint does not
 * describe. The caption says what the field is, every time.
 *
 * It will not invent a standing for an agent whose RepID was not read. An agent
 * that is unregistered or whose lookup failed is listed as unranked WITH the
 * reason, not omitted and not placed last. Sorting an unknown to the bottom is
 * the same error as scoring NOT_CHECKED as zero — it renders an absence as a
 * measurement, and the loser of that trade is always the newest agent.
 *
 * ON FETCHING EACH CARD AGAIN. `AgentRepId` already looks up every agent on this
 * page, so a local agent's card is requested twice per render. That is a known,
 * bounded cost — the list is browser-local and small — and it is the price of
 * reusing the one tested lookup instead of threading state through the page or
 * giving `AgentRepId` a second job. If the list ever stops being small, hoist the
 * lookup; do not fork it.
 */
export function AgentsStanding({ agents }: { agents: ReadonlyArray<{ id: string; name: string }> }) {
  const [board, setBoard] = useState<LeaderboardLookup | null>(null);
  const [mine, setMine] = useState<Record<string, RepIdLookup>>({});

  useEffect(() => {
    let live = true;
    fetchLeaderboard().then((b) => { if (live) setBoard(b); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    let live = true;
    // Each agent resolves independently: one unreachable card must not leave the
    // others unresolved, which is the same reason AgentRepId looks itself up.
    for (const a of agents) {
      fetchAgentRepId(a.id).then((r) => {
        if (live) setMine((prev) => ({ ...prev, [a.id]: r }));
      });
    }
    return () => { live = false; };
  }, [agents]);

  // `null` is in flight, and renders as plainly unfinished. Seeding with a real
  // verdict would flash an answer nothing had been asked for yet.
  if (board === null) {
    return (
      <Panel>
        <p className="text-xs text-[#64748b]" aria-live="polite">Reading the leaderboard…</p>
      </Panel>
    );
  }

  if (board.state !== 'LOADED') {
    return (
      <Panel>
        <p className="text-sm text-[#94a3b8]">{LEADERBOARD_LOOKUP_DETAIL[board.reason]}</p>
        <Link href="/leaderboard" className="mt-3 inline-block text-xs text-amber-500 hover:underline">
          Open the full leaderboard →
        </Link>
      </Panel>
    );
  }

  const top = board.entries.slice(0, 3);

  return (
    <Panel>
      <ol className="space-y-2">
        {top.map((e, i) => (
          <li key={e.agentId} className="flex items-center gap-3">
            <span className="text-xs text-[#475569] tabular-nums w-4 shrink-0">{i + 1}</span>
            <span className="font-mono text-sm text-white truncate flex-1 min-w-0">{e.agentId}</span>
            <span className="text-sm font-bold text-amber-500 tabular-nums shrink-0">
              {e.repid.toLocaleString()}
            </span>
          </li>
        ))}
      </ol>

      {agents.length > 0 && (
        <div className="mt-4 pt-4 border-t border-[#1e293b] space-y-2">
          <div className="text-xs font-mono text-[#475569]">YOUR AGENTS</div>
          {agents.map((a) => {
            const lookup = mine[a.id];
            if (!lookup) {
              return <Row key={a.id} name={a.name} detail="Reading RepID…" />;
            }
            if (lookup.state !== 'MEASURED') {
              // Unranked WITH the reason. Not omitted, not placed last.
              return (
                <Row
                  key={a.id}
                  name={a.name}
                  detail={lookup.state === 'NOT_CHECKED' ? 'not ranked — RepID not read' : 'not ranked — lookup failed'}
                />
              );
            }
            const standing = standingAmong(lookup.repid, board.entries);
            return (
              <Row
                key={a.id}
                name={a.name}
                score={lookup.repid}
                detail={standing ? `${ordinal(standing.position)} of ${standing.outOf}` : 'not ranked'}
              />
            );
          })}
        </div>
      )}

      {/* The caption is not decoration: without it a position implies a population
          this endpoint does not describe. */}
      <p className="mt-4 text-xs text-[#64748b] leading-relaxed">
        Ranked against the {board.totalAgents} agents on the public board — the Trinity fleet, not
        every agent in existence. Your agents are placed by the same 0–10,000 RepID the engine
        reports for theirs.
      </p>

      <Link href="/leaderboard" className="mt-2 inline-block text-xs text-amber-500 hover:underline">
        Open the full leaderboard →
      </Link>
    </Panel>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#0f172a] p-6 rounded-xl border border-[#1e293b]">
      <h3 className="text-xl font-bold mb-1">Leaderboard</h3>
      <p className="text-xs text-[#94a3b8] mb-4">Live RepID from the public scoring engine.</p>
      {children}
    </div>
  );
}

function Row({ name, score, detail }: { name: string; score?: number; detail: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-white truncate flex-1 min-w-0">{name}</span>
      {score !== undefined && (
        <span className="text-sm font-bold text-white tabular-nums shrink-0">
          {score.toLocaleString()}
        </span>
      )}
      <span className="text-xs text-[#64748b] shrink-0">{detail}</span>
    </div>
  );
}
