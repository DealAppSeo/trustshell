'use client';

import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';

interface LLMTrust {
  llm_provider: string;
  llm_model: string | null;
  total_decisions: number;
  hallucinations_caught: number;
  hallucination_rate_pct: number;
  trust_score_pct: number;
  avg_certainty: number;
  agents_using: number;
  last_decision: string;
}

export function LiveTrustScores() {
  const [scores, setScores] = useState<LLMTrust[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchScores = async () => {
      try {
        const response = await fetch('https://repid-engine-production.up.railway.app/api/v1/llm-trust', {
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) throw new Error('Failed to fetch');
        const data = await response.json();
        setScores(data);
        setLoading(false);
      } catch {
        // Wait 2 seconds before showing error fallback
        setTimeout(() => {
          setLoading(false);
          setError(true);
        }, 2000);
      }
    };

    fetchScores();
  }, []);

  const formatRelativeTime = (dateString: string) => {
    if (!dateString) return 'recently';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'recently';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <section className="px-4 py-20 md:py-28 border-t border-border">
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Live trust scores.
          </h2>
          <p className="text-muted">
            Real LLM trust scores from the production HAL pipeline. Updates as agents make decisions. No mockups.
          </p>
        </div>

        {loading && (
          <div className="text-center py-12 text-muted">
            Loading live data...
          </div>
        )}

        {error && !loading && (
          <div className="text-center py-12">
            <p className="text-muted mb-2">Live data temporarily unavailable</p>
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
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {scores.map((score) => (
              <div key={score.llm_provider} className="p-5 bg-card rounded-xl border border-border">
                <p className="text-sm text-muted mb-1 font-mono uppercase">{score.llm_provider}</p>
                <p className="text-3xl font-bold text-foreground mb-2">
                  {typeof score.trust_score_pct === 'number' 
                    ? `${score.trust_score_pct}%` 
                    : 'N/A'}
                </p>
                <div className="flex justify-between text-xs text-muted">
                  <span>{score.total_decisions.toLocaleString()} decisions</span>
                  <span>{formatRelativeTime(score.last_decision)}</span>
                </div>
              </div>
            ))}
          </div>
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
