'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Shield, CheckCircle, AlertCircle, Search, ExternalLink, 
  ArrowLeft, Cpu, Globe, Calendar, Key, AlertTriangle, RefreshCw
} from 'lucide-react';

interface ProofDetails {
  id: any;
  agent_name?: string;
  agent_id?: string;
  proof_type: string;
  tier_proven?: string;
  merkle_root: string | null;
  zk_commitment?: string;
  proof_hash?: string;
  eas_schema?: string;
  eas_attestation_uid: string | null;
  anchor_tx_hash?: string;
  created_at?: string;
  computed_at?: string;
  expires_at: string | null;
  verified: boolean;
  status?: string;
}

export default function VerifyProof() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    source: string;
    proof: ProofDetails;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Automatically search if hash is in URL query parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hashParam = params.get('hash') || params.get('agent');
    if (hashParam) {
      setQuery(hashParam);
      handleSearch(hashParam);
    }
  }, []);

  const handleSearch = async (searchQuery: string) => {
    const term = searchQuery.trim();
    if (!term) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const isHash = term.startsWith('0x') || term.length > 30;
      const url = isHash 
        ? `/api/verify-proof?hash=${encodeURIComponent(term)}`
        : `/api/verify-proof?agent=${encodeURIComponent(term)}`;

      const res = await fetch(url);
      const json = await res.json();

      if (res.ok && json.success) {
        setResult(json);
      } else {
        setError(json.error || 'Proof not found. Check the hash or agent name and try again.');
      }
    } catch {
      setError('Connection to verification server failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(query);
  };

  const getEasUrl = (uid: string) => {
    return `https://base-sepolia.easscan.org/attestation/view/${uid}`;
  };

  const getBasescanUrl = (tx: string) => {
    return `https://sepolia.basescan.org/tx/${tx}`;
  };

  const displayHash = (result?.proof.zk_commitment || result?.proof.proof_hash || result?.proof.merkle_root || '—');
  const agentDisplayName = (result?.proof.agent_name || result?.proof.agent_id || 'Swarm Agent');

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between">
      {/* Navigation bar */}
      <nav className="border-b border-border bg-card/40 backdrop-blur-md sticky top-0 z-50 px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg hover:opacity-80">
            <Shield className="w-6 h-6 text-accent" />
            <span>TrustShell</span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/dashboard" className="text-muted hover:text-accent font-medium">Dashboard</Link>
            <Link href="/dev" className="text-muted hover:text-accent font-medium">Developers</Link>
          </div>
        </div>
      </nav>

      {/* Main content area */}
      <main className="max-w-4xl mx-auto px-4 py-12 w-full flex-grow space-y-12">
        <div className="space-y-4 text-center max-w-2xl mx-auto">
          <div className="inline-flex bg-accent/10 border border-accent/20 p-2 rounded-2xl mb-2 text-accent">
            <Shield className="w-8 h-8" />
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight">
            Independent Verification
          </h1>
          <p className="text-muted text-sm md:text-base leading-relaxed">
            Verify any AI agent&apos;s ZK proof of constitution or reputation score. Paste the agent name or proof hash to inspect the Base Sepolia on-chain EAS attestation directly.
          </p>
        </div>

        {/* Search Form */}
        <div className="max-w-xl mx-auto">
          <form onSubmit={onSubmit} className="relative">
            <input 
              type="text" 
              required
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Paste agent name (e.g. trinity-veritas) or ZK proof hash..."
              className="w-full pl-5 pr-14 py-4 bg-card border border-border rounded-2xl text-foreground placeholder:text-muted/65 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/40 text-sm"
            />
            <button 
              type="submit" 
              disabled={loading}
              className="absolute right-3 top-1/2 -translate-y-1/2 bg-accent hover:bg-accent/80 text-white p-2.5 rounded-xl transition-all duration-200 disabled:opacity-50"
            >
              {loading ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : (
                <Search className="w-5 h-5" />
              )}
            </button>
          </form>
        </div>

        {/* Status / Results Card */}
        <div className="max-w-2xl mx-auto">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 text-center space-y-3">
              <AlertTriangle className="w-8 h-8 text-red-500 mx-auto" />
              <h3 className="font-bold text-foreground">Verification Failed</h3>
              <p className="text-muted text-xs">{error}</p>
            </div>
          )}

          {result && (
            <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-xl space-y-6">
              {/* Card Header: Verification Status Banner */}
              <div className="bg-emerald-500/10 border-b border-border p-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-7 h-7 text-emerald-400" />
                  <div>
                    <h3 className="font-extrabold text-sm md:text-base uppercase tracking-wider text-emerald-400 font-mono">
                      ZK Proof Valid
                    </h3>
                    <p className="text-xs text-muted/80">Cryptographic authenticity verified</p>
                  </div>
                </div>
                <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded-md font-semibold">
                  SECURED BY BASE
                </span>
              </div>

              {/* Card Body: Details */}
              <div className="p-6 md:p-8 space-y-6">
                <div className="grid sm:grid-cols-2 gap-6">
                  {/* Left Side details */}
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-mono text-muted flex items-center gap-1">
                        <Cpu className="w-3.5 h-3.5" /> Agent Identifier
                      </span>
                      <p className="font-bold text-base text-foreground font-mono">{agentDisplayName}</p>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-mono text-muted flex items-center gap-1">
                        <Globe className="w-3.5 h-3.5" /> Proof Framework
                      </span>
                      <p className="font-semibold text-sm text-foreground uppercase">{result.proof.proof_type}</p>
                    </div>

                    {result.proof.tier_proven && (
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase font-mono text-muted flex items-center gap-1">
                          <Shield className="w-3.5 h-3.5" /> Certified Tier
                        </span>
                        <p className="font-semibold text-sm text-foreground uppercase">{result.proof.tier_proven}</p>
                      </div>
                    )}
                  </div>

                  {/* Right Side details */}
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-mono text-muted flex items-center gap-1">
                        <Key className="w-3.5 h-3.5" /> Attestation Schema
                      </span>
                      <p className="font-semibold text-sm text-foreground font-mono truncate">
                        {result.proof.eas_schema || 'constitutional-compliance-v1'}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-mono text-muted flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" /> Timestamp
                      </span>
                      <p className="font-semibold text-sm text-foreground">
                        {result.proof.created_at || result.proof.computed_at 
                          ? new Date(result.proof.created_at || result.proof.computed_at || '').toLocaleString()
                          : 'Recent session'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Proof Hash details */}
                <div className="border-t border-border/80 pt-5 space-y-4">
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-mono text-muted">ZK Commitment / Proof Hash</span>
                    <div className="bg-background border border-border p-3 rounded-xl text-xs font-mono break-all text-muted-foreground select-all">
                      {displayHash}
                    </div>
                  </div>

                  {result.proof.merkle_root && (
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-mono text-muted">Anchor Merkle Root</span>
                      <div className="bg-background border border-border p-3 rounded-xl text-xs font-mono break-all text-muted-foreground select-all">
                        {result.proof.merkle_root}
                      </div>
                    </div>
                  )}
                </div>

                {/* Explorer Links */}
                <div className="border-t border-border/80 pt-6 grid sm:grid-cols-2 gap-4">
                  {/* EAS attestation block */}
                  <div className="bg-background border border-border p-4 rounded-2xl flex flex-col justify-between space-y-3">
                    <div className="space-y-1">
                      <h4 className="font-bold text-xs uppercase tracking-wider text-foreground">EAS Attestation</h4>
                      <p className="text-[10px] text-muted leading-tight">Ethereum Attestation Service on Base Sepolia.</p>
                    </div>
                    {result.proof.eas_attestation_uid ? (
                      <a 
                        href={getEasUrl(result.proof.eas_attestation_uid)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-accent/15 border border-accent/30 text-accent text-xs font-bold py-2 px-3 rounded-xl hover:bg-accent hover:text-white transition-all text-center flex items-center justify-center gap-1.5"
                      >
                        View Attestation <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    ) : (
                      <span className="bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs font-semibold py-2 px-3 rounded-xl text-center">
                        On-chain Anchor Pending
                      </span>
                    )}
                  </div>

                  {/* Basescan Block */}
                  <div className="bg-background border border-border p-4 rounded-2xl flex flex-col justify-between space-y-3">
                    <div className="space-y-1">
                      <h4 className="font-bold text-xs uppercase tracking-wider text-foreground">Anchor Transaction</h4>
                      <p className="text-[10px] text-muted leading-tight">Verification receipt on the Base Sepolia ledger.</p>
                    </div>
                    {result.proof.anchor_tx_hash || result.proof.eas_attestation_uid ? (
                      <a 
                        href={getBasescanUrl(result.proof.anchor_tx_hash || result.proof.eas_attestation_uid || '')}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-card border border-border text-foreground text-xs font-bold py-2 px-3 rounded-xl hover:bg-border transition-all text-center flex items-center justify-center gap-1.5"
                      >
                        View on Basescan <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    ) : (
                      <span className="bg-border text-muted text-xs font-semibold py-2 px-3 rounded-xl text-center">
                        Pending Block Confirmation
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Quick tips if no search has been executed */}
          {!result && !error && !loading && (
            <div className="bg-card border border-border rounded-3xl p-6 space-y-4">
              <h3 className="font-bold text-sm text-foreground">Demo Verification Hashes</h3>
              <p className="text-xs text-muted">You can test the verification page by pasting one of the active agent names or a ZK commitment hash:</p>
              <ul className="space-y-2 font-mono text-[10px] text-accent">
                <li className="flex justify-between items-center bg-background border border-border p-2 rounded-lg">
                  <span>trinity-veritas</span>
                  <button 
                    onClick={() => { setQuery('trinity-veritas'); handleSearch('trinity-veritas'); }}
                    className="hover:underline font-bold"
                  >
                    Quick Load &rarr;
                  </button>
                </li>
                <li className="flex justify-between items-center bg-background border border-border p-2 rounded-lg">
                  <span>trinity-orch</span>
                  <button 
                    onClick={() => { setQuery('trinity-orch'); handleSearch('trinity-orch'); }}
                    className="hover:underline font-bold"
                  >
                    Quick Load &rarr;
                  </button>
                </li>
                <li className="flex justify-between items-center bg-background border border-border p-2 rounded-lg">
                  <span>0xd7369c790d41f50c218e62fb5d658706c38236c2f8dee330021610c183ba5e43</span>
                  <button 
                    onClick={() => { 
                      setQuery('0xd7369c790d41f50c218e62fb5d658706c38236c2f8dee330021610c183ba5e43'); 
                      handleSearch('0xd7369c790d41f50c218e62fb5d658706c38236c2f8dee330021610c183ba5e43'); 
                    }}
                    className="hover:underline font-bold"
                  >
                    Quick Load &rarr;
                  </button>
                </li>
              </ul>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 border-t border-border/80 text-center text-xs text-muted/60">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 px-4">
          <p>© 2026 HyperDAG. All verifications are performed cryptographically.</p>
          <Link href="/dashboard" className="text-accent hover:underline">
            Back to Network Monitor
          </Link>
        </div>
      </footer>
    </div>
  );
}
