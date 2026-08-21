'use client';

// TrustShell leaderboard — was a 404 because this route never existed. The data
// is live at the repid-engine public endpoints (no keys, read-only); trustshell.dev
// is on the engine's CORS allowlist so we fetch client-side directly.
//   /api/v1/leaderboard/agents  → the RepID agent board (Round scoring)
//   /api/v1/leaderboard/models  → per-model board with two lenses (performance / value)
import { useEffect, useState } from 'react';

const REPID_ENGINE_URL =
  process.env.NEXT_PUBLIC_REPID_ENGINE_URL ??
  'https://repid-engine-production.up.railway.app';

// ---------------------------------------------------------------------------
// Response shapes (verified against the live endpoints 2026-07-20).
// ---------------------------------------------------------------------------
interface AgentRow {
  agent_id: string;
  model: string;
  repid_total: number;
  rounds_scored: number;
  avg_brier: number | null;
  avg_accuracy: number | null;
  avg_rater_reliability: number | null;
  errors: number;
  last_round: string | null;
  verified: boolean;
}
interface AgentsResponse {
  agents: AgentRow[];
  total_agents: number;
  last_updated: string;
}

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
  n_items?: number | null;
  errors?: number | null;
}
interface Lens {
  label: string;
  ranked_by: string;
  models: ModelRow[];
}
interface ModelsResponse {
  metric: string;
  disclaimer: string;
  narrative?: string;
  last_updated: string;
  lenses: { performance: Lens; value: Lens };
}

type Board = 'agents' | 'models';
type LensKey = 'performance' | 'value';

const fmt = (n: number | null | undefined, digits = 2) =>
  n == null || Number.isNaN(n) ? '—' : n.toFixed(digits);
const fmtInt = (n: number | null | undefined) =>
  n == null || Number.isNaN(n) ? '—' : Math.round(n).toLocaleString();
/**
 * How old is this board, in whole days? `null` when we have no timestamp at all —
 * which is NOT the same as "fresh" and must not render as it.
 */
const ageInDays = (iso: string | null): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
};

/**
 * Say the age in words a reader does not have to do arithmetic on. A leaderboard is
 * read as "how things stand NOW", so anything but a fresh board has to correct that
 * assumption on sight rather than in a footnote.
 */
const ageLabel = (days: number): string => {
  if (days <= 0) return 'Scored today';
  if (days === 1) return 'Scored yesterday';
  if (days < 7) return `Scored ${days} days ago`;
  if (days < 14) return 'Scored over a week ago';
  if (days < 60) return `Scored ${Math.floor(days / 7)} weeks ago`;
  return `Scored ${Math.floor(days / 30)} months ago`;
};

const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      });
};

function classBadge(cls: string) {
  const tone =
    cls === 'frontier'
      ? 'text-accent border-accent/40'
      : cls.startsWith('open')
        ? 'text-green-500/90 border-green-500/40'
        : 'text-muted border-border';
  return (
    <span
      className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${tone}`}
    >
      {cls}
    </span>
  );
}

export default function LeaderboardPage() {
  const [board, setBoard] = useState<Board>('agents');
  const [lens, setLens] = useState<LensKey>('performance');

  const [agents, setAgents] = useState<AgentsResponse | null>(null);
  const [models, setModels] = useState<ModelsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(false);
      try {
        const [aRes, mRes] = await Promise.all([
          fetch(`${REPID_ENGINE_URL}/api/v1/leaderboard/agents`, {
            signal: AbortSignal.timeout(12000),
          }),
          fetch(`${REPID_ENGINE_URL}/api/v1/leaderboard/models`, {
            signal: AbortSignal.timeout(12000),
          }),
        ]);
        if (!aRes.ok || !mRes.ok) throw new Error('bad response');
        const [aJson, mJson] = await Promise.all([aRes.json(), mRes.json()]);
        if (cancelled) return;
        setAgents(aJson as AgentsResponse);
        setModels(mJson as ModelsResponse);
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

  const lastUpdated =
    board === 'agents' ? agents?.last_updated : models?.last_updated;
  const staleDays = ageInDays(lastUpdated ?? null);

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 space-y-10">
      {/* HEADER */}
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-accent font-semibold">
          TrustShell · Apache 2.0
        </p>
        <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground leading-tight">
          Leaderboard.
        </h1>
        <p className="text-base md:text-lg text-muted leading-relaxed max-w-3xl">
          RepID scoring from the public repid-engine — agents earn
          reputation by predicting well and calibrating honestly. Per-model
          boards rank the underlying LLMs on the same task.
        </p>

        {/*
          FRESHNESS, STATED UP FRONT. The figures below come from the most recent
          evaluation round, and rounds do not run on a schedule — so a board can be
          weeks old while looking exactly as authoritative as a fresh one. Reading a
          leaderboard as "how things stand now" is the natural assumption, so the page
          corrects it on sight rather than in a footnote at 40% opacity below the fold.
          Never colour-only: the age is always spelled out in words.
        */}
        {!loading && !error && (
          <p
            className={`inline-flex items-center gap-2 text-sm rounded-lg border px-3 py-2 ${
              staleDays === null || staleDays >= 7
                ? 'border-border text-muted'
                : 'border-accent/40 text-foreground'
            }`}
          >
            <span aria-hidden="true">◷</span>
            {staleDays === null ? (
              <span>
                <strong className="text-foreground">Age unknown</strong> — this board carries
                no round timestamp, so we cannot tell you how current it is. That is an
                absence, not a claim that it is fresh.
              </span>
            ) : (
              <span>
                <strong className="text-foreground">{ageLabel(staleDays)}</strong>
                {staleDays >= 7 && (
                  <> — rounds run when we run them, not on a schedule. Treat these standings
                  as of {fmtDate(lastUpdated ?? null)}, not as of today.</>
                )}
              </span>
            )}
          </p>
        )}
      </header>

      {/* BOARD TABS */}
      <div className="flex items-center gap-2 border-b border-border">
        {(['agents', 'models'] as Board[]).map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setBoard(b)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
              board === b
                ? 'border-accent text-foreground'
                : 'border-transparent text-muted hover:text-foreground'
            }`}
          >
            {b}
          </button>
        ))}
      </div>

      {/* LOADING / ERROR */}
      {loading && (
        <div className="py-16 text-center text-muted">Loading live scores…</div>
      )}
      {error && !loading && (
        <div className="py-16 text-center space-y-2">
          <p className="text-muted">
            Couldn&apos;t reach the scoring engine right now.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-accent hover:underline text-sm"
          >
            Retry
          </button>
        </div>
      )}

      {/* AGENTS BOARD */}
      {!loading && !error && board === 'agents' && (
        <section className="space-y-4">
          {agents && agents.agents.length > 0 ? (
            <>
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-2xl font-bold text-foreground">Agents</h2>
                <p className="text-xs text-muted/60">
                  {agents.total_agents} agents · ranked by RepID
                </p>
              </div>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted border-b border-border bg-card">
                      <th className="px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">Agent</th>
                      <th className="px-3 py-2 font-medium">Model</th>
                      <th className="px-3 py-2 font-medium text-right">RepID</th>
                      <th className="px-3 py-2 font-medium text-right">Accuracy</th>
                      <th className="px-3 py-2 font-medium text-right">Brier</th>
                      <th className="px-3 py-2 font-medium text-right">Rounds</th>
                      <th className="px-3 py-2 font-medium text-right">Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agents.agents.map((a, i) => (
                      <tr
                        key={a.agent_id}
                        className="border-b border-border/60 last:border-0 hover:bg-card/60"
                      >
                        <td className="px-3 py-2 text-muted tabular-nums">
                          {i + 1}
                        </td>
                        <td className="px-3 py-2">
                          <span className="font-mono font-semibold text-foreground">
                            {a.agent_id}
                          </span>
                          {a.verified && (
                            <span className="ml-1.5 text-[10px] uppercase tracking-wide text-green-500/80">
                              verified
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted font-mono text-xs">
                          {a.model}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-foreground tabular-nums">
                          {fmtInt(a.repid_total)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted">
                          {a.avg_accuracy == null
                            ? '—'
                            : `${(a.avg_accuracy * 100).toFixed(0)}%`}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted">
                          {fmt(a.avg_brier, 3)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted">
                          {a.rounds_scored}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted">
                          {a.errors}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="py-16 text-center text-muted border border-dashed border-border rounded-xl">
              No agents scored yet.
            </div>
          )}
        </section>
      )}

      {/* MODELS BOARD */}
      {!loading && !error && board === 'models' && (
        <section className="space-y-4">
          {models ? (
            <>
              <div className="flex items-baseline justify-between gap-4 flex-wrap">
                <h2 className="text-2xl font-bold text-foreground">Models</h2>
                <p className="text-xs text-muted/60">{models.metric}</p>
              </div>

              {/* LENS TOGGLE */}
              <div className="inline-flex rounded-lg border border-border p-0.5 bg-card">
                {(['performance', 'value'] as LensKey[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setLens(k)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      lens === k
                        ? 'bg-accent text-white'
                        : 'text-muted hover:text-foreground'
                    }`}
                  >
                    {models.lenses[k].label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted/70">
                Ranked by {models.lenses[lens].ranked_by}
              </p>

              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted border-b border-border bg-card">
                      <th className="px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">Model</th>
                      <th className="px-3 py-2 font-medium">Class</th>
                      <th className="px-3 py-2 font-medium text-right">Accuracy</th>
                      <th className="px-3 py-2 font-medium text-right">Brier</th>
                      <th className="px-3 py-2 font-medium text-right">Latency</th>
                      <th className="px-3 py-2 font-medium text-right">$/1M</th>
                      {lens === 'value' && (
                        <th className="px-3 py-2 font-medium text-right">
                          Composite
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {models.lenses[lens].models.map((m) => (
                      <tr
                        key={m.model_id}
                        className="border-b border-border/60 last:border-0 hover:bg-card/60"
                      >
                        <td className="px-3 py-2 text-muted tabular-nums">
                          {m.rank}
                        </td>
                        <td className="px-3 py-2 font-mono font-semibold text-foreground">
                          {m.model_id}
                        </td>
                        <td className="px-3 py-2">{classBadge(m.class)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted">
                          {m.accuracy == null
                            ? '—'
                            : `${(m.accuracy * 100).toFixed(0)}%`}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted">
                          {fmt(m.brier, 3)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted">
                          {m.latency_ms == null
                            ? '—'
                            : `${fmtInt(m.latency_ms)}ms`}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted">
                          {m.cost_per_1m == null
                            ? '—'
                            : m.cost_per_1m === 0
                              ? 'free'
                              : `$${m.cost_per_1m}`}
                        </td>
                        {lens === 'value' && (
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground">
                            {fmt(m.composite, 3)}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {models.disclaimer && (
                <p className="text-xs text-muted/60 max-w-3xl">
                  {models.disclaimer}
                </p>
              )}
            </>
          ) : (
            <div className="py-16 text-center text-muted border border-dashed border-border rounded-xl">
              No model results yet.
            </div>
          )}
        </section>
      )}

      {/* FOOTER META */}
      {!loading && !error && lastUpdated && (
        <p className="text-xs text-muted/40">
          Fetched live from repid-engine · updated {fmtDate(lastUpdated)}
        </p>
      )}
    </div>
  );
}
