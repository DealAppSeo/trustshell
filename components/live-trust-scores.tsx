'use client';

import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';

interface AgentRepIDEntry {
  name: string;
  displayName: string;
  tokenId: number;
  repid: number | null;
  tier: string | null;
  feedbackCount: number;
  source: 'on-chain' | 'no-on-chain-writes';
  basescanUrl: string;
}

interface LeaderboardResponse {
  agents: AgentRepIDEntry[];
  as_of: string;
  source: string;
  on_chain_with_writes: number;
  total_minted: number;
}

export function LiveTrustScores() {
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const response = await fetch('/api/agent-leaderboard', {
          signal: AbortSignal.timeout(12000),
        });
        if (!response.ok) throw new Error('Failed to fetch');
        const json = (await response.json()) as LeaderboardResponse;
        setData(json);
        setLoading(false);
      } catch {
        setTimeout(() => {
          setLoading(false);
          setError(true);
        }, 1500);
      }
    };

    fetchLeaderboard();
  }, []);

  const formatAsOf = (iso: string) => {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  };

  return (
    <section className="px-4 py-20 md:py-28 border-t border-border">
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Agent RepID leaderboard.
          </h2>
          <p className="text-muted">
            Live reads from the ERC-8004 ReputationRegistry on Base Sepolia — no Railway backend, no mockups.
            Scores with on-chain attestations update when the mint pipeline resumes; agents minted without writes yet are labeled honestly.
          </p>
        </div>

        {loading && (
          <div className="text-center py-12 text-muted">
            Reading on-chain RepID…
          </div>
        )}

        {/* Graceful, honest state when the on-chain read can't complete (RPC
            down) OR when the registry returns no minted agents yet. We keep the
            on-chain stance — nothing is faked — and point visitors at the full
            live board rather than surfacing a raw error string. */}
        {!loading && (error || (data != null && data.agents.length === 0)) && (
          <ResumingPanel />
        )}

        {!loading && !error && data && data.agents.length > 0 && (
          <>
            <div className="grid sm:grid-cols-2 gap-4">
              {data.agents.map((agent) => (
                <div
                  key={agent.name}
                  className="p-5 bg-card rounded-xl border border-border"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-sm text-muted font-mono uppercase">
                      {agent.displayName}
                    </p>
                    {agent.source === 'on-chain' ? (
                      <span className="text-[10px] uppercase tracking-wide text-green-500/80 shrink-0">
                        on-chain
                      </span>
                    ) : (
                      <span className="text-[10px] uppercase tracking-wide text-amber-500/80 shrink-0">
                        minted · no writes
                      </span>
                    )}
                  </div>
                  <p className="text-3xl font-bold text-foreground mb-1">
                    {agent.repid != null ? agent.repid.toLocaleString() : '—'}
                  </p>
                  {agent.tier && (
                    <p className="text-xs text-muted mb-2">{agent.tier}</p>
                  )}
                  <div className="flex justify-between text-xs text-muted">
                    <span>token {agent.tokenId}</span>
                    <span>
                      {agent.feedbackCount > 0
                        ? `${agent.feedbackCount} on-chain writes`
                        : 'awaiting pipeline'}
                    </span>
                  </div>
                  <a
                    href={agent.basescanUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-xs text-muted hover:text-accent transition-colors"
                  >
                    Verify on basescan
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              ))}
            </div>

            <p className="text-xs text-muted/60 max-w-3xl">
              {data.on_chain_with_writes} of {data.total_minted} minted squad agents have on-chain reputation writes.
              LLM-provider trust scores (the old Railway-backed leaderboard) remain unavailable while repid-engine is unreachable — see trustrepid.dev for historical HAL aggregates.
            </p>
            <p className="text-xs text-muted/40">
              Fetched {formatAsOf(data.as_of)} via {data.source}
            </p>
          </>
        )}

        <a
          href="https://trustrepid.dev"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-muted hover:text-accent transition-colors"
        >
          <span>&rarr;</span> Full HAL + provider leaderboard at trustrepid.dev
        </a>
      </div>
    </section>
  );
}

/**
 * Calm fallback shown when the direct on-chain read can't complete (public RPC
 * unreachable) or the registry has no minted agents with writes yet. Holds the
 * on-chain-purity stance — no backend swap, no mockups — and reassures the
 * first-time visitor that this is a temporary "resuming" state, not a break.
 */
function ResumingPanel() {
  return (
    <div className="p-8 md:p-10 bg-card rounded-xl border border-border text-center space-y-3">
      <p className="text-xs uppercase tracking-wide text-amber-500/80">Resuming</p>
      <p className="text-lg font-medium text-foreground">
        Live on-chain reads resume when the RPC / mint pipeline is back.
      </p>
      <p className="text-sm text-muted max-w-xl mx-auto">
        This board reads the ERC-8004 ReputationRegistry directly on Base Sepolia, so it only ever
        shows what&apos;s truly on-chain — nothing is mocked while the public RPC or mint pipeline
        catches up. Meanwhile, see the full live board.
      </p>
      <a
        href="https://trustrepid.dev"
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent hover:underline inline-flex items-center gap-1"
      >
        See the full live board
        <ExternalLink className="w-4 h-4" />
      </a>
    </div>
  );
}
