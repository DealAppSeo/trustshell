'use client';

import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';

// Field names per the live repid-engine /api/v1/llm-trust response:
//   { llm_provider, llm_model, total_decisions, hallucinations_caught,
//     hallucination_rate_pct, trust_score_pct, avg_certainty,
//     agents_using, last_decision }
// trust_score_pct is already a percentage (e.g. 54.55), not a fraction.
// llm_model is null for headline-per-provider rows (the API merges models).
interface LLMTrust {
  llm_provider: string;
  llm_model: string | null;
  trust_score_pct: number;
  total_decisions: number;
  last_decision: string;
}

export function LiveTrustScores() {
  const [scores, setScores] = useState<LLMTrust[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchScores = async () => {
      try {
        const response = await fetch(
          'https://repid-engine-production.up.railway.app/api/v1/llm-trust',
          { signal: AbortSignal.timeout(5000) }
        );
        if (!response.ok) throw new Error('Failed to fetch');
        const data = await response.json();
        setScores(data);
        setLoading(false);
      } catch {
        // Wait 2 seconds before showing error fallback so transient blips
        // don't flash the failure state.
        setTimeout(() => {
          setLoading(false);
          setError(true);
        }, 2000);
      }
    };

    fetchScores();
  }, []);

  // Absolute "Mon DD, YYYY" date — honest about staleness rather than papering
  // over it with a relative-time fudge ("2 weeks ago" reads as drift).
  const formatLastDecision = (dateString: string) => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <section className="px-4 py-20 md:py-28 border-t border-border">
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            LLM trust leaderboard.
          </h2>
          <p className="text-muted">
            Trust scores accumulated from agent decisions, scored via the production HAL pipeline. Verifiable on-chain. No mockups.
          </p>
        </div>

        {loading && (
          <div className="text-center py-12 text-muted">
            Loading…
          </div>
        )}

        {error && !loading && (
          <div className="text-center py-12">
            <p className="text-muted mb-2">Leaderboard temporarily unavailable</p>
            <a
              href="https://trustrepid.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline inline-flex items-center gap-1"
            >
              See trustrepid.dev for full leaderboard
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        )}

        {!loading && !error && scores.length > 0 && (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {scores.map((score, i) => (
                <div
                  key={`${score.llm_provider}-${i}`}
                  className="p-5 bg-card rounded-xl border border-border"
                >
                  <p className="text-sm text-muted mb-1 font-mono uppercase">
                    {score.llm_provider}
                  </p>
                  <p className="text-3xl font-bold text-foreground mb-2">
                    {score.trust_score_pct != null && !isNaN(score.trust_score_pct)
                      ? `${score.trust_score_pct.toFixed(2)}%`
                      : 'N/A'}
                  </p>
                  <div className="flex justify-between text-xs text-muted">
                    <span>{score.total_decisions.toLocaleString()} decisions</span>
                    <span>Last: {formatLastDecision(score.last_decision)}</span>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs text-muted/60 max-w-3xl">
              Provider activity reflects real agent usage. Underrepresented providers indicate the system is newly accumulating decisions for that vendor.
            </p>
          </>
        )}

        <a
          href="https://trustrepid.dev"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-muted hover:text-accent transition-colors"
        >
          <span>&rarr;</span> See full leaderboard at trustrepid.dev
        </a>
      </div>
    </section>
  );
}
