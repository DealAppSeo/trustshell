'use client';

// Home-page leaderboard SNAPSHOT.
//
// Previously this component read the ERC-8004 ReputationRegistry directly over a
// public Base Sepolia RPC, which is unreliable ("On-chain read failed — public
// RPC unreachable"). It now reads the reliable public repid-engine endpoints —
// the same source the full /leaderboard route uses. trustshell.dev is on the
// engine's CORS allowlist, so we fetch client-side directly (no keys, read-only).
//   /api/v1/leaderboard/models  → per-model board, two lenses (performance/value)
//   /api/v1/leaderboard/agents  → the 12 Trinity agents by real 0–10,000 RepID
//
// The separate on-chain /repid page still reads the registry directly — this
// change only stops the HOME from depending on the dead RPC.
import { useEffect, useState } from 'react';
import Link from 'next/link';

const REPID_ENGINE_URL =
  process.env.NEXT_PUBLIC_REPID_ENGINE_URL ??
  'https://repid-engine-production.up.railway.app';

const TOP_N = 3;

// --- Response shapes (verified against the live endpoints 2026-07-21) --------
interface ModelRow {
  rank: number;
  model_id: string;
  model: string;
  class: string;
  accuracy: number | null;
  brier: number | null;
  latency_ms: number | null;
  cost_per_1m: number | null;
  composite?: number | null;
}
interface Lens {
  label: string;
  ranked_by: string;
  models: ModelRow[];
}
interface ModelsResponse {
  metric: string;
  last_updated: string;
  lenses: { performance: Lens; value: Lens };
}

interface AgentRow {
  agent_id: string;
  model: string | null;
  repid_total: number;
  rounds_scored: number;
  avg_accuracy: number | null;
  errors: number;
  verified: boolean;
}
interface AgentsResponse {
  agents: AgentRow[];
  total_agents: number;
  last_updated: string;
}

const fmtInt = (n: number | null | undefined) =>
  n == null || Number.isNaN(n) ? '—' : Math.round(n).toLocaleString();
const fmtPct = (n: number | null | undefined) =>
  n == null || Number.isNaN(n) ? '—' : `${(n * 100).toFixed(0)}%`;
const fmt = (n: number | null | undefined, d = 3) =>
  n == null || Number.isNaN(n) ? '—' : n.toFixed(d);

export function LiveTrustScores() {
  const [models, setModels] = useState<ModelsResponse | null>(null);
  const [agents, setAgents] = useState<AgentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [mRes, aRes] = await Promise.all([
          fetch(`${REPID_ENGINE_URL}/api/v1/leaderboard/models`, {
            signal: AbortSignal.timeout(12000),
          }),
          fetch(`${REPID_ENGINE_URL}/api/v1/leaderboard/agents`, {
            signal: AbortSignal.timeout(12000),
          }),
        ]);
        if (!mRes.ok || !aRes.ok) throw new Error('bad response');
        const [mJson, aJson] = await Promise.all([mRes.json(), aRes.json()]);
        if (cancelled) return;
        setModels(mJson as ModelsResponse);
        setAgents(aJson as AgentsResponse);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const valueModels = models?.lenses.value.models.slice(0, TOP_N) ?? [];
  const perfModels = models?.lenses.performance.models.slice(0, TOP_N) ?? [];
  const topAgents = agents?.agents.slice(0, TOP_N) ?? [];

  return (
    <section className="px-4 py-20 md:py-28 border-t border-border">
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Trust leaderboard.
          </h2>
          <p className="text-muted max-w-3xl">
            Live from the public repid-engine — models ranked on a code-review
            discrimination task, agents ranked by real 0–10,000 RepID. No
            mockups, no dead RPC.
          </p>
        </div>

        {loading && (
          <div className="text-center py-12 text-muted">
            Loading live scores…
          </div>
        )}

        {error && !loading && (
          <div className="text-center py-12 space-y-2">
            <p className="text-muted">
              Couldn&apos;t reach the scoring engine right now.
            </p>
            <Link
              href="/leaderboard"
              className="text-accent hover:underline text-sm"
            >
              Try the full leaderboard →
            </Link>
          </div>
        )}

        {!loading && !error && (models || agents) && (
          <div className="grid md:grid-cols-3 gap-6">
            <SnapshotCard
              title="Top models · Value"
              subtitle="best score per dollar"
              rows={valueModels.map((m) => ({
                key: m.model_id,
                name: m.model_id,
                badge: m.class,
                metric: fmt(m.composite, 2),
                metricLabel: 'value',
              }))}
            />
            <SnapshotCard
              title="Top models · Performance"
              subtitle="money no object"
              rows={perfModels.map((m) => ({
                key: m.model_id,
                name: m.model_id,
                badge: m.class,
                metric: fmtPct(m.accuracy),
                metricLabel: 'acc',
              }))}
            />
            <SnapshotCard
              title="Top agents · RepID"
              subtitle="earned reputation"
              rows={topAgents.map((a) => ({
                key: a.agent_id,
                name: a.agent_id,
                badge: a.verified ? 'verified' : undefined,
                metric: fmtInt(a.repid_total),
                metricLabel: 'RepID',
              }))}
            />
          </div>
        )}

        {!loading && !error && (
          <p className="text-xs text-muted/50 max-w-3xl">
            A narrow proxy, not general AI trustworthiness — early results, small
            N, public methodology. Full standings, columns, and lens toggles on
            the leaderboard.
          </p>
        )}
      </div>
    </section>
  );
}

interface SnapshotRow {
  key: string;
  name: string;
  badge?: string;
  metric: string;
  metricLabel: string;
}

function SnapshotCard({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle: string;
  rows: SnapshotRow[];
}) {
  return (
    <div className="p-5 bg-card rounded-xl border border-border flex flex-col">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted/70">{subtitle}</p>
      </div>

      {rows.length > 0 ? (
        <ol className="space-y-3 flex-1">
          {rows.map((row, i) => (
            <li key={row.key} className="flex items-center gap-3">
              <span className="text-xs text-muted/60 tabular-nums w-4 shrink-0">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-mono font-medium text-foreground truncate">
                  {row.name}
                </p>
                {row.badge && (
                  <span className="text-[10px] uppercase tracking-wide text-muted/70">
                    {row.badge}
                  </span>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-lg font-bold text-accent tabular-nums leading-none">
                  {row.metric}
                </p>
                <p className="text-[10px] uppercase tracking-wide text-muted/60 mt-0.5">
                  {row.metricLabel}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="flex-1 text-sm text-muted py-4">No results yet.</p>
      )}

      <Link
        href="/leaderboard"
        className="mt-4 inline-flex items-center gap-1 text-xs text-muted hover:text-accent transition-colors"
      >
        See full standings →
      </Link>
    </div>
  );
}
