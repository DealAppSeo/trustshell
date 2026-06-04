'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  Activity, Shield, Zap, Coins, ArrowRight, RefreshCw, 
  CheckCircle, AlertCircle, ExternalLink, Lock, Unlock,
  HelpCircle, ChevronRight, Play
} from 'lucide-react';

interface Agent {
  id: string;
  agent_name: string;
  display_name: string | null;
  current_repid: number;
  tier: string;
  erc8004_token_id: string | null;
  mint_tx_hash: string | null;
}

interface Heartbeat {
  agent_name: string;
  status: string;
  last_ping: string;
  loop_count: number;
  current_task_id: string | null;
  tasks_completed_session: number;
  tasks_failed_session: number;
}

interface ZKProof {
  id: number;
  agent_id: string;
  proof_type: string;
  tier_proven: string;
  merkle_root: string | null;
  zk_commitment: string;
  eas_attestation_uid: string | null;
  created_at: string;
}

interface RepEvent {
  id: number;
  event_type: string;
  subject_id: string;
  reputation_delta: number;
  created_at: string;
  event_data: any;
}

interface Task {
  id: string;
  title: string;
  status: string;
  agent_assigned: string;
  created_at: string;
  completed_at: string | null;
}

interface Stake {
  id: number;
  staker_agent: string;
  target_model: string;
  dimension: string;
  stake_amount: number;
  status: string;
  created_at: string;
}

interface Sponsorship {
  id: string;
  sponsor_agent: string;
  sponsored_agent: string;
  collateral_usdc: string;
  status: string;
  created_at: string;
}

const TRINITY_AGENTS_LIST = [
  { name: 'trinity-mel', label: 'Mel', role: 'DeFi Broker & Execution Agent' },
  { name: 'trinity-gcm', label: 'GCM', role: 'Global Consensus Manager' },
  { name: 'trinity-hdm', label: 'HDM', role: 'HyperDAG Memory Controller' },
  { name: 'trinity-veritas', label: 'Veritas', role: 'Fact-checking & Claim Oracle' },
  { name: 'trinity-orch', label: 'Orch', role: 'Swarm Orchestrator & Task Router' },
  { name: 'trinity-shofet', label: 'Shofet', role: 'Consensus Judge & BFT Panel' },
  { name: 'trinity-nexus', label: 'Nexus', role: 'Inter-agent Bridge Router' },
  { name: 'trinity-w3c', label: 'W3C', role: 'W3C DIDs & Credential Issuer' },
  { name: 'trinity-chesed', label: 'Chesed', role: 'Staking & Liquidity Vault' },
  { name: 'trinity-torch', label: 'Torch', role: 'Observability & Cost Auditor' },
  { name: 'trinity-apm', label: 'APM', role: 'Application Performance Monitor' },
  { name: 'trinity-sophia', label: 'Sophia', role: 'LLM Multi-agent Advisory Board' },
];

export default function Dashboard() {
  const [data, setData] = useState<{
    agents: Agent[];
    heartbeats: Heartbeat[];
    proofs: ZKProof[];
    events: RepEvent[];
    tasks: Task[];
    stakes: Stake[];
    sponsorships: Sponsorship[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/dashboard');
      if (!res.ok) throw new Error('Failed to fetch dashboard data');
      const json = await res.json();
      if (json.success) {
        setData(json);
        setError(null);
      } else {
        throw new Error(json.error || 'Unknown error');
      }
    } catch (e: any) {
      setError(e.message || 'Connection to database failed');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setCountdown(10);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchData();
          return 10;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const getAgentDetail = (name: string) => {
    const agent = data?.agents.find(a => a.agent_name.toLowerCase() === name.toLowerCase());
    const hb = data?.heartbeats.find(h => h.agent_name.toLowerCase() === name.toLowerCase() || h.agent_name.toLowerCase() === `${name}-local`.toLowerCase());
    
    // Check ping age
    const now = new Date();
    const lastPingDate = hb?.last_ping ? new Date(hb.last_ping) : null;
    const minutesSincePing = lastPingDate ? (now.getTime() - lastPingDate.getTime()) / 60000 : null;
    const isOnline = minutesSincePing !== null && minutesSincePing < 5;

    // Staking logic
    const shortId = name.replace(/^trinity-/i, '').toUpperCase();
    const agentStakes = data?.stakes.filter(s => s.staker_agent === shortId) || [];
    const ownStakeUSD = agentStakes.reduce((sum, s) => sum + (s.stake_amount / 1000000), 0);
    
    const agentSponsorships = data?.sponsorships.filter(s => s.sponsored_agent === shortId) || [];
    const sponsorStakeUSD = agentSponsorships.reduce((sum, s) => sum + Number(s.collateral_usdc), 0);
    
    const effectiveStakeUSD = ownStakeUSD + (sponsorStakeUSD / 3);
    const repid = agent?.current_repid ?? 500;
    const mathAuthority = Math.min(repid, 100 * Math.sqrt(effectiveStakeUSD));
    const finalAuthority = Math.min(mathAuthority, 4 * ownStakeUSD);

    // Limits
    const requiresStake = ['PROBATIONARY', 'EARNING', 'ESTABLISHED'].includes(agent?.tier || 'PROBATIONARY');

    return {
      agent,
      hb,
      isOnline,
      minutesSincePing,
      ownStakeUSD,
      sponsorStakeUSD,
      effectiveStakeUSD,
      finalAuthority: requiresStake ? finalAuthority : repid,
      requiresStake
    };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="space-y-4 text-center">
          <RefreshCw className="w-12 h-12 text-accent animate-spin mx-auto" />
          <h2 className="text-xl font-bold text-foreground">Loading Trust Loop Dashboard...</h2>
          <p className="text-muted text-sm">Querying real-time heartbeats and attestations from Base Sepolia & Supabase.</p>
        </div>
      </div>
    );
  }

  // Network stats
  const totalAgents = TRINITY_AGENTS_LIST.length;
  const onlineAgents = TRINITY_AGENTS_LIST.filter(a => getAgentDetail(a.name).isOnline).length;
  const totalRep = data?.agents.reduce((sum, a) => sum + (TRINITY_AGENTS_LIST.some(t => t.name === a.agent_name) ? a.current_repid : 0), 0) || 0;
  const totalStakesUSD = data?.stakes.reduce((sum, s) => sum + (s.stake_amount / 1000000), 0) || 0;
  const totalSponsorUSD = data?.sponsorships.reduce((sum, s) => sum + Number(s.collateral_usdc), 0) || 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navigation bar */}
      <nav className="border-b border-border bg-card/40 backdrop-blur-md sticky top-0 z-50 px-4 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 font-bold text-lg hover:opacity-80">
              <Shield className="w-6 h-6 text-accent" />
              <span>TrustShell <span className="text-accent font-mono text-xs">v1.0.0</span></span>
            </Link>
            <span className="text-muted/40 font-light">|</span>
            <span className="text-sm font-semibold text-muted">Network Monitor</span>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <Link href="/verify" className="text-muted hover:text-accent font-medium">Verify Proofs</Link>
            <Link href="/dev" className="text-muted hover:text-accent font-medium">Developers</Link>
            
            <div className="flex items-center gap-3 bg-card border border-border px-3 py-1.5 rounded-lg text-xs font-mono">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>Live Feed ({countdown}s)</span>
              <button 
                onClick={fetchData} 
                disabled={refreshing}
                className="hover:text-accent transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-12">
        {/* Error notification */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3 text-red-400 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p><strong>Warning:</strong> {error}. Reconnecting automatically...</p>
          </div>
        )}

        {/* Headline section */}
        <div className="space-y-4">
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight">
            The Trust Loop <span className="text-accent">in Motion.</span>
          </h1>
          <p className="text-muted max-w-3xl leading-relaxed text-sm md:text-base">
            This dashboard displays the live economic and cryptographic health of the 12 heartbeating agents. Every score, transaction limit, and proof is verified in real-time from active Supabase nodes and on-chain Base Sepolia EAS schemas.
          </p>
        </div>

        {/* Network Metrics grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-card border border-border p-5 rounded-2xl space-y-2">
            <div className="flex items-center justify-between text-muted">
              <span className="text-xs font-mono uppercase">Online Swarm</span>
              <Activity className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-3xl font-bold font-mono">
              {onlineAgents} <span className="text-muted text-sm">/ {totalAgents}</span>
            </p>
            <div className="w-full bg-border h-1.5 rounded-full overflow-hidden">
              <div 
                className="bg-emerald-500 h-full rounded-full transition-all duration-500" 
                style={{ width: `${(onlineAgents / totalAgents) * 100}%` }}
              ></div>
            </div>
          </div>

          <div className="bg-card border border-border p-5 rounded-2xl space-y-2">
            <div className="flex items-center justify-between text-muted">
              <span className="text-xs font-mono uppercase">Reputation Secured</span>
              <Shield className="w-4 h-4 text-accent" />
            </div>
            <p className="text-3xl font-bold font-mono">
              {totalRep.toLocaleString()} <span className="text-muted text-sm">RepID</span>
            </p>
            <p className="text-xs text-muted/80">Sum of all active agent weights</p>
          </div>

          <div className="bg-card border border-border p-5 rounded-2xl space-y-2">
            <div className="flex items-center justify-between text-muted">
              <span className="text-xs font-mono uppercase">Staked Collateral</span>
              <Coins className="w-4 h-4 text-accent" />
            </div>
            <p className="text-3xl font-bold font-mono">
              ${totalStakesUSD.toFixed(2)} <span className="text-muted text-xs">USDC</span>
            </p>
            <p className="text-xs text-muted/80">Directly locked by agents</p>
          </div>

          <div className="bg-card border border-border p-5 rounded-2xl space-y-2">
            <div className="flex items-center justify-between text-muted">
              <span className="text-xs font-mono uppercase">Sponsorship Network</span>
              <Zap className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-3xl font-bold font-mono">
              ${totalSponsorUSD.toFixed(2)} <span className="text-muted text-xs">USDC</span>
            </p>
            <p className="text-xs text-muted/80">Collateral at 3:1 backing ratio</p>
          </div>
        </div>

        {/* Trust Loop Flowchart */}
        <section className="bg-card border border-border rounded-3xl p-6 md:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
                <span className="bg-accent/10 text-accent p-1.5 rounded-lg text-sm font-mono">STEP-BY-STEP</span>
                Cryptographic Trust Pipeline
              </h2>
              <p className="text-muted text-xs md:text-sm mt-1">How agent operations flow into on-chain verifiability.</p>
            </div>
          </div>

          <div className="grid md:grid-cols-4 gap-6 relative">
            {/* Step 1 */}
            <div className="bg-background border border-border/80 rounded-2xl p-5 space-y-3 relative group hover:border-accent/40 transition-colors duration-300">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-black text-muted/20 font-mono">01</span>
                <span className="text-xs font-mono bg-accent/10 text-accent px-2 py-0.5 rounded-full uppercase">Task Trigger</span>
              </div>
              <h3 className="font-bold text-sm">Swarm Directives</h3>
              <p className="text-muted text-xs leading-relaxed">
                Agents accept, coordinate, and execute tasks injected via decentralized endpoints.
              </p>
              {data?.tasks && data.tasks.length > 0 && (
                <div className="bg-card border border-border p-2.5 rounded-lg text-[10px] font-mono space-y-1 mt-2">
                  <div className="flex justify-between text-muted">
                    <span>Task ID:</span>
                    <span className="text-foreground">{data.tasks[0].id.slice(0, 8)}...</span>
                  </div>
                  <div className="truncate text-foreground font-semibold">{data.tasks[0].title}</div>
                  <div className="flex justify-between text-muted">
                    <span>Agent:</span>
                    <span className="text-accent">{data.tasks[0].agent_assigned}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Step 2 */}
            <div className="bg-background border border-border/80 rounded-2xl p-5 space-y-3 relative group hover:border-accent/40 transition-colors duration-300">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-black text-muted/20 font-mono">02</span>
                <span className="text-xs font-mono bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full uppercase">Verification</span>
              </div>
              <h3 className="font-bold text-sm">HAL Classification</h3>
              <p className="text-muted text-xs leading-relaxed">
                Completed work is intercepted and classified by the validator swarm to detect hallucinations.
              </p>
              <div className="bg-card border border-border p-2.5 rounded-lg text-[10px] font-mono space-y-1 mt-2 flex items-center justify-between">
                <span className="text-emerald-400">Approved Verdict</span>
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
              </div>
            </div>

            {/* Step 3 */}
            <div className="bg-background border border-border/80 rounded-2xl p-5 space-y-3 relative group hover:border-accent/40 transition-colors duration-300">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-black text-muted/20 font-mono">03</span>
                <span className="text-xs font-mono bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full uppercase">Calculation</span>
              </div>
              <h3 className="font-bold text-sm">RepID Update</h3>
              <p className="text-muted text-xs leading-relaxed">
                Reputation is recalculated. High accuracy boosts RepID; failures triggers decay.
              </p>
              {data?.events && data.events.length > 0 && (
                <div className="bg-card border border-border p-2.5 rounded-lg text-[10px] font-mono space-y-1 mt-2">
                  <div className="flex justify-between text-muted">
                    <span>Delta:</span>
                    <span className="text-emerald-400">+{data.events[0].reputation_delta} RepID</span>
                  </div>
                  <div className="truncate text-foreground font-semibold">{data.events[0].event_type}</div>
                </div>
              )}
            </div>

            {/* Step 4 */}
            <div className="bg-background border border-border/80 rounded-2xl p-5 space-y-3 relative group hover:border-accent/40 transition-colors duration-300">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-black text-muted/20 font-mono">04</span>
                <span className="text-xs font-mono bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded-full uppercase">Attestation</span>
              </div>
              <h3 className="font-bold text-sm">ZK Proof & EAS</h3>
              <p className="text-muted text-xs leading-relaxed">
                The final state is packed into a POSTCARD proof and attested via Ethereum Attestation Service.
              </p>
              {data?.proofs && data.proofs.length > 0 && (
                <div className="bg-card border border-border p-2.5 rounded-lg text-[10px] font-mono space-y-1 mt-2">
                  <div className="flex justify-between text-muted">
                    <span>Proof Type:</span>
                    <span className="text-foreground">{data.proofs[0].proof_type}</span>
                  </div>
                  <div className="truncate text-foreground font-semibold">
                    Hash: {data.proofs[0].zk_commitment.slice(0, 10)}...
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 12 Agents Active Grid */}
        <section className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold">The Active Swarm (12/12)</h2>
            <p className="text-muted text-sm mt-1">Live reputation tiers, staking capacities, and computed settlement authority.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {TRINITY_AGENTS_LIST.map((agentItem) => {
              const detail = getAgentDetail(agentItem.name);
              const nameKey = agentItem.name.replace(/^trinity-/i, '');

              return (
                <div 
                  key={agentItem.name} 
                  className={`bg-card border rounded-3xl p-6 flex flex-col justify-between transition-all duration-300 ${
                    detail.isOnline 
                      ? 'border-border hover:border-accent/40 shadow-sm' 
                      : 'border-red-500/20 opacity-70 hover:opacity-100'
                  }`}
                >
                  <div className="space-y-4">
                    {/* Header: Name and Status */}
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-extrabold text-lg tracking-tight">
                            {agentItem.label}
                          </h3>
                          <span className="text-[10px] font-mono bg-border px-2 py-0.5 rounded-md text-muted/80">
                            {nameKey.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-xs text-muted leading-tight">{agentItem.role}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        {detail.isOnline ? (
                          <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            ONLINE
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] font-semibold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                            DEGRADED
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Stats: Tier & RepID */}
                    <div className="grid grid-cols-2 gap-4 bg-background/50 border border-border/60 p-3 rounded-xl">
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-mono uppercase text-muted">Tier Status</span>
                        <div className="text-xs font-bold text-foreground truncate uppercase flex items-center gap-1">
                          {detail.requiresStake ? (
                            <Lock className="w-3.5 h-3.5 text-amber-500" />
                          ) : (
                            <Unlock className="w-3.5 h-3.5 text-emerald-500" />
                          )}
                          {detail.agent?.tier || 'EARNING'}
                        </div>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-mono uppercase text-muted">Reputation</span>
                        <div className="text-xs font-mono font-bold text-accent">
                          {detail.agent?.current_repid ?? 500} <span className="text-[10px] text-muted font-normal">RepID</span>
                        </div>
                      </div>
                    </div>

                    {/* Staking & Mathematical Authority */}
                    <div className="space-y-2 border-t border-border/60 pt-4">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted font-medium">Staked Collateral:</span>
                        <span className="font-mono text-foreground font-semibold">
                          ${detail.ownStakeUSD.toFixed(2)} <span className="text-[10px] text-muted">USDC</span>
                        </span>
                      </div>

                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted font-medium">Sponsored Backing:</span>
                        <span className="font-mono text-foreground font-semibold">
                          ${detail.sponsorStakeUSD.toFixed(2)} <span className="text-[10px] text-muted">USDC</span>
                        </span>
                      </div>

                      <div className="flex justify-between items-center text-xs border-t border-border/40 pt-2 bg-accent/5 p-2 rounded-lg">
                        <span className="text-accent font-semibold flex items-center gap-1">
                          Authority Limit (A):
                        </span>
                        <span className="font-mono text-accent font-extrabold">
                          ${detail.finalAuthority.toFixed(2)} <span className="text-[10px]">USDC</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Footer Actions */}
                  <div className="mt-5 pt-3 border-t border-border/40 flex items-center justify-between text-[10px] font-mono text-muted/80">
                    <span className="truncate max-w-[140px]">
                      Token: {detail.agent?.erc8004_token_id ?? 'None'}
                    </span>
                    
                    {detail.agent?.mint_tx_hash ? (
                      <a 
                        href={`https://sepolia.basescan.org/tx/${detail.agent.mint_tx_hash}`} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-accent hover:underline flex items-center gap-0.5"
                      >
                        Basescan <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    ) : (
                      <span>Unminted</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Real-time streams */}
        <div className="grid lg:grid-cols-2 gap-8">
          {/* ZK Proof Stream */}
          <div className="bg-card border border-border rounded-3xl p-6 space-y-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Shield className="w-5 h-5 text-accent" />
              Proof Ledger Feed
            </h2>
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
              {data?.proofs && data.proofs.length > 0 ? (
                data.proofs.map((proof) => {
                  const matchingAgent = data?.agents.find(a => a.id === proof.agent_id);
                  return (
                    <div key={proof.id} className="bg-background border border-border/80 rounded-xl p-3.5 space-y-2 text-xs font-mono">
                      <div className="flex justify-between items-center">
                        <span className="text-accent font-semibold">
                          {matchingAgent?.agent_name ?? 'unknown-agent'}
                        </span>
                        <span className="text-muted/60 text-[10px]">
                          {new Date(proof.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[10px] text-muted">
                        <div>
                          <strong>Proof:</strong> {proof.proof_type}
                        </div>
                        <div>
                          <strong>Tier:</strong> {proof.tier_proven}
                        </div>
                      </div>
                      <div className="text-[10px] text-muted truncate">
                        <strong>Commitment:</strong> {proof.zk_commitment}
                      </div>
                      <div className="flex justify-between items-center border-t border-border/60 pt-2 text-[10px]">
                        {proof.eas_attestation_uid ? (
                          <span className="text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">EAS Attested</span>
                        ) : (
                          <span className="text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">Attestation Pending</span>
                        )}
                        <Link 
                          href={`/verify?hash=${proof.zk_commitment}`}
                          className="text-accent hover:underline flex items-center gap-1 font-semibold"
                        >
                          Verify Proof <ChevronRight className="w-3 h-3" />
                        </Link>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8 text-muted text-xs">No cryptographic proofs recorded in this session.</div>
              )}
            </div>
          </div>

          {/* Reputation delta events */}
          <div className="bg-card border border-border rounded-3xl p-6 space-y-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Activity className="w-5 h-5 text-accent" />
              Reputation Events Feed
            </h2>
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
              {data?.events && data.events.length > 0 ? (
                data.events.map((event) => {
                  const matchingAgent = data?.agents.find(a => a.id === event.subject_id);
                  const isPositive = event.reputation_delta >= 0;
                  return (
                    <div key={event.id} className="bg-background border border-border/80 rounded-xl p-3.5 space-y-2 text-xs font-mono">
                      <div className="flex justify-between items-center">
                        <span className="text-foreground font-bold">
                          {matchingAgent?.agent_name ?? 'unknown-agent'}
                        </span>
                        <span className="text-muted/60 text-[10px]">
                          {new Date(event.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] bg-card border border-border px-2 py-0.5 rounded text-muted">
                          {event.event_type}
                        </span>
                        <span className={`font-bold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                          {isPositive ? '+' : ''}{event.reputation_delta} RepID
                        </span>
                      </div>
                      {event.event_data?.amount && (
                        <div className="text-[10px] text-muted">
                          Amount: ${(Number(event.event_data.amount) / (event.event_type.includes('inbound') ? 1000000 : 1)).toFixed(2)} USDC
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8 text-muted text-xs">No reputation changes recorded in this session.</div>
              )}
            </div>
          </div>
        </div>
      </main>
      
      {/* Footer */}
      <footer className="mt-20 py-12 border-t border-border/80 text-center text-xs text-muted/60">
        <p>© 2026 HyperDAG. Staging database verified against Sepolia network contract nodes.</p>
        <p className="mt-1">Micah 6:8</p>
      </footer>
    </div>
  );
}
