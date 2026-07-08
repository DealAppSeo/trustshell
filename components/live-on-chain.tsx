'use client';

import { useState, useEffect } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';

// Two of the four "What we've built" numbers come from the live
// /api/v1/hal/stats response:
//   - audit_chain_length            (growing, HAL is actively auditing)
//   - peer_verification_queue_size  (growing, peer-verification active)
// The other two (agents minted on the canonical registry; lifetime REAL
// on-chain reputation writes) now read from the public
// /api/v1/observability/onchain-stats endpoint when it's live, and grow as
// agents onboard. If that endpoint isn't deployed yet, they gracefully fall
// back to the constants below (labeled "static") so the page never breaks.
interface HALStats {
  audit_chain_length?: number;
  peer_verification_queue_size?: number;
  last_updated?: string;
}

// Shape of the public /api/v1/observability/onchain-stats response.
interface OnchainStats {
  agents_minted: number;
  lifetime_onchain_writes: number;
  as_of?: string;
}

const ENGINE_URL =
  process.env.NEXT_PUBLIC_REPID_ENGINE_URL ??
  'https://repid-engine-production.up.railway.app';

const contracts = [
  {
    name: 'IdentityRegistry',
    address: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
  },
  {
    name: 'ReputationRegistry',
    address: '0x8004B663056A597Dffe9eCcC1965A193B7388713',
  },
];

// Static numbers verified against production DB + Base Sepolia at edit time. See
// block comment above for the rationale. Update on the same cadence as the static
// landing copy. Verified 2026-07-08: all 12 core Trinity agents minted on the
// canonical IdentityRegistry; 46 lifetime on-chain reputation writes. Writes are
// currently paused (drain/anchor worker down) — most recent write 2026-06-22.
const STATIC_AGENTS_MINTED = 12;
const STATIC_LIFETIME_REAL_WRITES = 46;
const STATIC_FROZEN_AT = '2026-06-22'; // last real on-chain write date (writes currently paused)

const LIVE_REFRESH_MS = 60_000;

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return 'just now';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return 'just now';
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export function LiveOnChain() {
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [stats, setStats] = useState<HALStats | null>(null);
  const [onchain, setOnchain] = useState<OnchainStats | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let mounted = true;

    const fetchStats = async () => {
      try {
        const response = await fetch(`${ENGINE_URL}/api/v1/hal/stats`, {
          signal: AbortSignal.timeout(5000),
        });
        if (response.ok && mounted) {
          const data = await response.json();
          setStats({
            audit_chain_length: data.audit_chain_length,
            peer_verification_queue_size: data.peer_verification_queue_size,
            last_updated: data.last_updated,
          });
        }
      } catch {
        // Silent — leaves the prior `stats` value intact, or falls through
        // to the static fallback below if we have nothing.
      }
    };

    const fetchOnchain = async () => {
      try {
        const response = await fetch(`${ENGINE_URL}/api/v1/observability/onchain-stats`, {
          signal: AbortSignal.timeout(5000),
        });
        if (response.ok && mounted) {
          const data = await response.json();
          // Only accept the live values if both numbers are present & numeric.
          if (
            typeof data.agents_minted === 'number' &&
            typeof data.lifetime_onchain_writes === 'number'
          ) {
            setOnchain({
              agents_minted: data.agents_minted,
              lifetime_onchain_writes: data.lifetime_onchain_writes,
              as_of: data.as_of,
            });
          }
        }
        // Non-2xx (e.g. 404 not-deployed) → leave `onchain` null → static fallback.
      } catch {
        // Silent — falls back to the static constants below.
      }
    };

    fetchStats();
    fetchOnchain();
    const interval = setInterval(() => {
      fetchStats();
      fetchOnchain();
    }, LIVE_REFRESH_MS);
    // Re-tick once a minute so the "X min ago" text refreshes between fetches.
    const tickInterval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => {
      mounted = false;
      clearInterval(interval);
      clearInterval(tickInterval);
    };
  }, []);

  const handleCopy = async (address: string) => {
    await navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 1500);
  };

  const isLive = stats != null;
  // tick is read here to satisfy the lint rule for the effect's setInterval(setTick) call.
  void tick;
  const liveAuditChain = stats?.audit_chain_length;
  const livePeerQueue = stats?.peer_verification_queue_size;
  const liveAt = stats?.last_updated;

  // Agents-minted + lifetime-writes: live from onchain-stats when available,
  // else fall back to the static constants (labeled honestly).
  const onchainLive = onchain != null;
  const agentsMinted = onchain?.agents_minted ?? STATIC_AGENTS_MINTED;
  const lifetimeWrites = onchain?.lifetime_onchain_writes ?? STATIC_LIFETIME_REAL_WRITES;

  return (
    <section className="px-4 py-20 md:py-28 border-t border-border">
      <div className="max-w-5xl mx-auto space-y-12">
        <h2 className="text-3xl md:text-4xl font-bold text-foreground">
          Live on Base Sepolia. Receipts, not promises.
        </h2>

        <div className="grid md:grid-cols-2 gap-12">
          {/* Left Column - Addresses */}
          <div>
            <h3 className="text-sm font-medium text-muted mb-4">
              ERC-8004 Registries (verifiable on basescan):
            </h3>
            <div className="space-y-4">
              {contracts.map((contract) => (
                <div key={contract.name} className="space-y-1">
                  <p className="text-sm text-foreground font-medium">{contract.name}:</p>
                  <div className="flex items-center gap-2">
                    <a
                      href={`https://sepolia.basescan.org/address/${contract.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-sm text-muted hover:text-accent transition-colors truncate"
                    >
                      {contract.address}
                    </a>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleCopy(contract.address)}
                        className="p-1.5 hover:bg-card rounded transition-colors"
                        aria-label={`Copy ${contract.name} address`}
                      >
                        {copiedAddress === contract.address ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4 text-muted" />
                        )}
                      </button>
                      <a
                        href={`https://sepolia.basescan.org/address/${contract.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 hover:bg-card rounded transition-colors"
                        aria-label={`View ${contract.name} on basescan`}
                      >
                        <ExternalLink className="w-4 h-4 text-muted" />
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column - Stats */}
          <div>
            <h3 className="text-sm font-medium text-muted mb-4">
              What we&apos;ve built:
            </h3>
            <div className="grid grid-cols-2 gap-6">
              <StatCard
                value={agentsMinted.toLocaleString()}
                label="agents minted on canonical registry"
                source={onchainLive ? 'live' : 'static'}
              />
              <StatCard
                value={lifetimeWrites.toLocaleString()}
                label="lifetime on-chain reputation writes"
                source={onchainLive ? 'live' : 'static'}
              />
              <StatCard
                value={livePeerQueue != null ? livePeerQueue.toLocaleString() : '—'}
                label="entries in peer verification queue"
                source={livePeerQueue != null ? 'live' : 'loading'}
              />
              <StatCard
                value={liveAuditChain != null ? liveAuditChain.toLocaleString() : '—'}
                label="audit chain length"
                source={liveAuditChain != null ? 'live' : 'loading'}
              />
            </div>
            <div className="mt-4 space-y-1">
              {isLive ? (
                <p className="text-xs text-muted/60">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 align-middle" />
                  Live · last fetched {formatRelativeTime(liveAt)} · refreshes every 60s
                </p>
              ) : (
                <p className="text-xs text-muted/60">Loading live values…</p>
              )}
              <p className="text-xs text-muted/40">
                {onchainLive
                  ? 'Agents minted + lifetime writes are live from the engine — they grow as agents onboard.'
                  : `Agents minted + lifetime writes are static fallbacks (live stats endpoint unavailable). All 12 core agents are minted; on-chain writes are currently paused — most recent write ${STATIC_FROZEN_AT}.`}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatCard({
  value,
  label,
  source,
}: {
  value: string;
  label: string;
  source: 'live' | 'loading' | 'static';
}) {
  return (
    <div>
      <p
        className={
          source === 'loading'
            ? 'text-4xl font-bold text-muted/40'
            : 'text-4xl font-bold text-accent'
        }
      >
        {value}
      </p>
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}
