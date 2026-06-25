'use client';

import { useState, useEffect } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';

interface HALStats {
  audit_chain_length?: number;
  peer_verification_queue_size?: number;
  last_updated?: string;
}

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

// Verified against production DB + on-chain audit at edit time (2026-06-25).
// Pipeline frozen since last real mint/write — do NOT present as live counters.
const STATIC_AGENTS_MINTED = 4;
const STATIC_LIFETIME_REAL_WRITES = 32;
const STATIC_FROZEN_AT = '2026-05-24';

const RAILWAY_STATS_URL =
  'https://repid-engine-production.up.railway.app/api/v1/hal/stats';
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
  const [backendDown, setBackendDown] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let mounted = true;

    const fetchStats = async () => {
      try {
        const response = await fetch(RAILWAY_STATS_URL, {
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) throw new Error('stats not ok');
        const data = await response.json();
        if (mounted) {
          setStats({
            audit_chain_length: data.audit_chain_length,
            peer_verification_queue_size: data.peer_verification_queue_size,
            last_updated: data.last_updated,
          });
          setBackendDown(false);
        }
      } catch {
        if (mounted) setBackendDown(true);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, LIVE_REFRESH_MS);
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

  const isLive = stats != null && !backendDown;
  void tick;
  const liveAuditChain = stats?.audit_chain_length;
  const livePeerQueue = stats?.peer_verification_queue_size;
  const liveAt = stats?.last_updated;

  return (
    <section className="px-4 py-20 md:py-28 border-t border-border">
      <div className="max-w-5xl mx-auto space-y-12">
        <h2 className="text-3xl md:text-4xl font-bold text-foreground">
          Live on Base Sepolia. Receipts, not promises.
        </h2>

        <div className="grid md:grid-cols-2 gap-12">
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

          <div>
            <h3 className="text-sm font-medium text-muted mb-4">
              What we&apos;ve built:
            </h3>
            <div className="grid grid-cols-2 gap-6">
              <StatCard
                value={STATIC_AGENTS_MINTED.toLocaleString()}
                label="squad agents minted on canonical registry"
                source="frozen"
                detail={`frozen since ${STATIC_FROZEN_AT}`}
              />
              <StatCard
                value={STATIC_LIFETIME_REAL_WRITES.toLocaleString()}
                label="lifetime on-chain reputation writes"
                source="frozen"
                detail={`frozen since ${STATIC_FROZEN_AT}`}
              />
              <StatCard
                value={
                  backendDown
                    ? 'unavailable'
                    : livePeerQueue != null
                      ? livePeerQueue.toLocaleString()
                      : '—'
                }
                label="entries in peer verification queue"
                source={backendDown ? 'blocked' : livePeerQueue != null ? 'live' : 'loading'}
                detail={
                  backendDown
                    ? 'repid-engine unreachable (Railway)'
                    : undefined
                }
              />
              <StatCard
                value={
                  backendDown
                    ? 'unavailable'
                    : liveAuditChain != null
                      ? liveAuditChain.toLocaleString()
                      : '—'
                }
                label="audit chain length"
                source={backendDown ? 'blocked' : liveAuditChain != null ? 'live' : 'loading'}
                detail={
                  backendDown
                    ? 'repid-engine unreachable (Railway)'
                    : undefined
                }
              />
            </div>
            <div className="mt-4 space-y-1">
              {isLive ? (
                <p className="text-xs text-muted/60">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 align-middle" />
                  HAL stats live · last fetched {formatRelativeTime(liveAt)} · refreshes every 60s
                </p>
              ) : backendDown ? (
                <p className="text-xs text-amber-500/80">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5 align-middle" />
                  HAL stats backend unreachable — repid-engine on Railway is not responding (mint pipeline resume pending Sean).
                  On-chain RepID above still reads directly from Base Sepolia RPC.
                </p>
              ) : (
                <p className="text-xs text-muted/60">Loading HAL stats…</p>
              )}
              <p className="text-xs text-muted/40">
                Minted-agent count + lifetime writes are static snapshots — no new mints or on-chain writes since {STATIC_FROZEN_AT}.
                Pipeline resume is Railway-blocked (Sean-only).
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
  detail,
}: {
  value: string;
  label: string;
  source: 'live' | 'loading' | 'frozen' | 'blocked';
  detail?: string;
}) {
  const valueClass =
    source === 'loading'
      ? 'text-4xl font-bold text-muted/40'
      : source === 'blocked'
        ? 'text-2xl font-bold text-muted/60'
        : source === 'frozen'
          ? 'text-4xl font-bold text-foreground/80'
          : 'text-4xl font-bold text-accent';

  return (
    <div>
      <p className={valueClass}>{value}</p>
      <p className="text-sm text-muted">{label}</p>
      {source === 'frozen' && detail && (
        <p className="text-[10px] text-muted/50 mt-1 uppercase tracking-wide">static · {detail}</p>
      )}
      {source === 'blocked' && detail && (
        <p className="text-[10px] text-amber-500/70 mt-1">{detail}</p>
      )}
    </div>
  );
}