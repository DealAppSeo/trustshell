'use client';

import { useState, useEffect } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';

interface HALStats {
  agents_minted: number;
  lifetime_reputation_writes: number;
  peer_verification_queue: number;
  audit_chain_length: number;
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

export function LiveOnChain() {
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [stats, setStats] = useState<HALStats | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('May 2026');

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('https://repid-engine-production.up.railway.app/api/v1/hal/stats', {
          signal: AbortSignal.timeout(5000),
        });
        if (response.ok) {
          const data = await response.json();
          setStats(data);
          setLastUpdated(new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }));
        }
      } catch {
        // Use fallback values
      }
    };

    fetchStats();
  }, []);

  const handleCopy = async (address: string) => {
    await navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 1500);
  };

  const displayStats = stats || {
    agents_minted: 4,
    lifetime_reputation_writes: 32,
    peer_verification_queue: 31,
    audit_chain_length: 4467,
  };

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
              <div>
                <p className="text-4xl font-bold text-accent">{displayStats.agents_minted}</p>
                <p className="text-sm text-muted">agents minted on canonical registry</p>
              </div>
              <div>
                <p className="text-4xl font-bold text-accent">{displayStats.lifetime_reputation_writes}</p>
                <p className="text-sm text-muted">lifetime on-chain reputation writes</p>
              </div>
              <div>
                <p className="text-4xl font-bold text-accent">{displayStats.peer_verification_queue}</p>
                <p className="text-sm text-muted">entries in peer verification queue</p>
              </div>
              <div>
                <p className="text-4xl font-bold text-accent">{displayStats.audit_chain_length.toLocaleString()}</p>
                <p className="text-sm text-muted">audit chain length</p>
              </div>
            </div>
            {!stats && (
              <p className="text-xs text-muted/60 mt-4">Updated: {lastUpdated}</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
