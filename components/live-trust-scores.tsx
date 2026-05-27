'use client';

import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';

// ============================================================================
// API SHAPE — forward-compat
//
// CC2's PR #67 (pending merge at this commit) will switch /api/v1/llm-trust
// from a bare array to an envelope:
//
//   {
//     providers: LLMTrust[],
//     total_providers_tracked: number,  // 13 per Sprint A catalog
//     providers_active_in_window: number,
//     window: '24h' | string,
//     as_of: ISO string
//   }
//
// Until PR #67 merges, the same URL with ?legacy=true (and the live
// no-query URL) returns the Round-12 bare-array shape. This component
// handles both:
//   - if response.json() is an Array → wrap into envelope with sensible
//     defaults (total_providers_tracked = CATALOG_SIZE, etc.)
//   - if response.json() is an object → use envelope fields directly
//
// Lock-step deploy plan: this PR ships AFTER repid-engine PR #67. The
// `?window=24h` query param works under both shapes (legacy ignores it).
// ============================================================================

interface LLMTrust {
  llm_provider: string;
  llm_model: string | null;
  trust_score_pct: number;
  total_decisions: number;
  last_decision: string;
}

interface Envelope {
  providers: LLMTrust[];
  total_providers_tracked: number;
  providers_active_in_window: number;
  window: string;
  as_of: string | null;
}

// ============================================================================
// TIER CATALOG — hardcoded per Sprint A
//
// 13 providers across 4 visible tiers (the catalog also defines tier 0b
// but it has 0 providers in this rendering pass; surface to API in V2).
// Order within each tier follows the spec verbatim. The component renders
// the tier sections in this order: 1 → 0a → 0s → 0v.
//
// TODO(V2): move this to the API envelope so tier is server-controlled.
// Tracking comment in repid-engine /api/v1/llm-trust handler.
// ============================================================================

type TierKey = '1' | '0a' | '0s' | '0v';

const TIER_MAP: Record<string, TierKey> = {
  // Tier 1 — Commercial Frontier
  anthropic: '1',
  openai: '1',
  // Tier 0a — High-Speed Inference (free commercial)
  cerebras: '0a',
  cohere: '0a',
  deepinfra: '0a', // CC2 added to CANONICAL_LLM_PROVIDERS in repid-engine PR #67
  deepseek: '0a',
  gemini: '0a',
  groq: '0a',
  // Tier 0s — Small Language Models
  'llama-3-2-1b': '0s',
  'gemma-3-2b': '0s',
  'phi-4': '0s',
  // Tier 0v — Vertical Specialists
  fingpt: '0v',
  'meditron-7b': '0v',
  'saul-lm-7b': '0v',
};

const TIER_SECTIONS: ReadonlyArray<{
  key: TierKey;
  title: string;
  subtitle?: string;
  perProviderSubtitle?: Record<string, string>;
}> = [
  {
    key: '1',
    title: 'Commercial frontier',
  },
  {
    key: '0a',
    title: 'High-speed inference',
  },
  {
    key: '0s',
    title: 'Small language models',
    subtitle:
      'ANFIS routes simple queries here for cost and speed efficiency.',
  },
  {
    key: '0v',
    title: 'Vertical specialists',
    subtitle:
      'Domain-specific trust scoring for high-stakes verticals.',
    perProviderSubtitle: {
      'meditron-7b': 'Medical',
      'saul-lm-7b': 'Legal',
      fingpt: 'Finance',
    },
  },
];

const CATALOG_SIZE = Object.keys(TIER_MAP).length; // 14 (anthropic, openai, cerebras, cohere, deepinfra, deepseek, gemini, groq, llama-3-2-1b, gemma-3-2b, phi-4, fingpt, meditron-7b, saul-lm-7b)

const API_BASE =
  'https://repid-engine-production.up.railway.app/api/v1/llm-trust';

// ============================================================================
// Helpers
// ============================================================================

function tierForProvider(name: string): TierKey | null {
  return TIER_MAP[name.toLowerCase()] ?? null;
}

function formatLastDecision(dateString: string | null): string {
  if (!dateString) return '—';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Wrap a legacy bare-array response into the envelope shape so downstream
// code uses a single contract. Defaults err on the side of HONEST counts.
function asEnvelope(raw: unknown): Envelope {
  if (Array.isArray(raw)) {
    const providers = raw as LLMTrust[];
    return {
      providers,
      total_providers_tracked: CATALOG_SIZE,
      providers_active_in_window: providers.length,
      window: '24h',
      as_of: null,
    };
  }
  const env = raw as Partial<Envelope>;
  return {
    providers: Array.isArray(env.providers) ? env.providers : [],
    total_providers_tracked:
      typeof env.total_providers_tracked === 'number'
        ? env.total_providers_tracked
        : CATALOG_SIZE,
    providers_active_in_window:
      typeof env.providers_active_in_window === 'number'
        ? env.providers_active_in_window
        : Array.isArray(env.providers)
        ? env.providers.length
        : 0,
    window: typeof env.window === 'string' ? env.window : '24h',
    as_of: typeof env.as_of === 'string' ? env.as_of : null,
  };
}

// ============================================================================
// Component
// ============================================================================

export function LiveTrustScores() {
  const [envelope, setEnvelope] = useState<Envelope | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchScores = async () => {
      try {
        // ?window=24h is the canonical request; legacy server ignores it.
        const response = await fetch(`${API_BASE}?window=24h`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) throw new Error('Failed to fetch');
        const raw = await response.json();
        setEnvelope(asEnvelope(raw));
        setLoading(false);
      } catch {
        setTimeout(() => {
          setLoading(false);
          setError(true);
        }, 2000);
      }
    };

    fetchScores();
  }, []);

  return (
    <section className="px-4 py-20 md:py-28 border-t border-border">
      <div className="max-w-5xl mx-auto space-y-10">
        <div>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            LLM trust leaderboard.
          </h2>
          <p className="text-muted">
            Trust scores from the production HAL pipeline. Tracking 13 providers
            across commercial and open-source tiers. Showing providers active in
            the last 24 hours. Verifiable on-chain.
          </p>
        </div>

        {loading && (
          <div className="text-center py-12 text-muted">Loading…</div>
        )}

        {error && !loading && (
          <div className="text-center py-12">
            <p className="text-muted mb-2">
              Leaderboard temporarily unavailable
            </p>
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

        {!loading && !error && envelope != null && (
          <>
            <TierGrid envelope={envelope} />

            <LeaderboardFooter envelope={envelope} />
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

// Render each tier as its own section. Cards for active providers; honest
// "Awaiting activity in this tier" message if none.
function TierGrid({ envelope }: { envelope: Envelope }) {
  // Group active providers by tier. Sort within tier by last_decision DESC.
  const byTier = new Map<TierKey, LLMTrust[]>();
  for (const p of envelope.providers) {
    const tier = tierForProvider(p.llm_provider);
    if (!tier) continue; // provider isn't in the catalog — skip silently
    const bucket = byTier.get(tier) ?? [];
    bucket.push(p);
    byTier.set(tier, bucket);
  }
  for (const bucket of byTier.values()) {
    bucket.sort((a, b) => {
      const at = a.last_decision ? new Date(a.last_decision).getTime() : 0;
      const bt = b.last_decision ? new Date(b.last_decision).getTime() : 0;
      return bt - at;
    });
  }

  return (
    <div className="space-y-12">
      {TIER_SECTIONS.map((section) => {
        const providersInTier = byTier.get(section.key) ?? [];
        return (
          <div key={section.key} className="space-y-4">
            <div>
              <h3 className="text-xl md:text-2xl font-semibold text-foreground">
                {section.title}
              </h3>
              {section.subtitle && (
                <p className="text-sm text-muted mt-1">{section.subtitle}</p>
              )}
            </div>

            {providersInTier.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-card/40 px-5 py-6">
                <p className="text-sm text-muted/80">
                  Awaiting agent activity in this tier.
                </p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {providersInTier.map((score) => {
                  const sub = section.perProviderSubtitle?.[
                    score.llm_provider.toLowerCase()
                  ];
                  return (
                    <ProviderCard key={score.llm_provider} score={score} subLabel={sub} />
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProviderCard({
  score,
  subLabel,
}: {
  score: LLMTrust;
  subLabel?: string;
}) {
  const pct =
    score.trust_score_pct != null && !isNaN(score.trust_score_pct)
      ? `${score.trust_score_pct.toFixed(2)}%`
      : 'N/A';
  return (
    <div className="p-5 bg-card rounded-xl border border-border">
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-sm text-muted font-mono uppercase">
          {score.llm_provider}
        </p>
        {subLabel && (
          <span className="text-[10px] uppercase tracking-widest text-accent/80">
            {subLabel}
          </span>
        )}
      </div>
      <p className="text-3xl font-bold text-foreground mb-2">{pct}</p>
      <div className="flex justify-between text-xs text-muted">
        <span>{score.total_decisions.toLocaleString()} decisions</span>
        <span>Last: {formatLastDecision(score.last_decision)}</span>
      </div>
    </div>
  );
}

function LeaderboardFooter({ envelope }: { envelope: Envelope }) {
  const total = envelope.total_providers_tracked;
  const active = envelope.providers_active_in_window;
  return (
    <div className="space-y-2 max-w-3xl text-sm text-muted">
      <p>
        Tracking <strong className="text-foreground">{total}</strong> providers
        across 4 tiers.{' '}
        <strong className="text-foreground">{active}</strong> active in last 24
        hours.
      </p>
      <p>
        ANFIS intelligent routing selects the optimal model for each query based
        on cost, latency, and required expertise. Trust scores accumulate as
        agents make real decisions.
      </p>
      <p className="text-xs text-muted/60">
        Expanded windows available to V2 RepID holders.
      </p>
    </div>
  );
}
