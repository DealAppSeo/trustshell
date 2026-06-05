'use client';

import { CheckCircle, AlertTriangle, TrendingUp, HelpCircle, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

export function HonestStateTable() {
  const rows = [
    {
      module: 'ERC-8004 Agent Identity',
      baseSepolia: 'Active & Live',
      baseSepoliaStatus: 'live',
      staging: 'Fully Integrated',
      stagingStatus: 'active',
      roadmap: 'Contract deployed & querying agent token IDs on-chain.',
    },
    {
      module: 'EAS Attestation Receipts',
      baseSepolia: 'Active & Live',
      baseSepoliaStatus: 'live',
      staging: 'Replicated',
      stagingStatus: 'active',
      roadmap: 'Attestation UIDs linked to Basescan; clickable verification logs.',
    },
    {
      module: 'Plonky3 ZK Vault',
      baseSepolia: 'Verified & Active',
      baseSepoliaStatus: 'live',
      staging: '1-Tier Circuit',
      stagingStatus: 'active',
      roadmap: 'ZK range proofs bind agent score to public values anonymously.',
    },
    {
      module: 'BFT Swarm Quorum',
      baseSepolia: 'Testnet / Staged',
      baseSepoliaStatus: 'testnet',
      staging: 'Active (12 Agents)',
      stagingStatus: 'active',
      roadmap: 'Cross-LLM voting panel running; filters hallucination vectors.',
    },
    {
      module: 'x402 Payments (Gating)',
      baseSepolia: 'Testnet / Staged',
      baseSepoliaStatus: 'testnet',
      staging: 'Client SDK Live',
      stagingStatus: 'active',
      roadmap: 'Escrow settlement & spend authority bounded by RepID tiers.',
    },
    {
      module: 'Adaptive ANFIS Weights',
      baseSepolia: 'Inert',
      baseSepoliaStatus: 'inert',
      staging: 'Static Lookup',
      stagingStatus: 'staged',
      roadmap: 'Cost/quality routing derived statically. Real-time updates in R&D.',
    },
    {
      module: 'Two-sided Divergence Filter',
      baseSepolia: 'Inert',
      baseSepoliaStatus: 'inert',
      staging: 'Dormant',
      stagingStatus: 'staged',
      roadmap: 'Damping logic scales once swarm corpus exceeds 270 nodes.',
    },
  ];

  return (
    <section className="relative px-6 py-20 bg-slate-950 text-white overflow-hidden border-t border-slate-900">
      <div className="max-w-5xl mx-auto space-y-12 relative z-10">
        
        {/* Provable Free-LLM ROI Banner */}
        <div className="bg-gradient-to-r from-indigo-950/80 to-slate-900/90 border border-indigo-500/20 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row items-center gap-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div className="space-y-2 flex-grow text-center md:text-left">
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
              <span className="text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-full uppercase tracking-wider">
                Provable ROI (Testnet-Era)
              </span>
              <span className="text-[10px] font-mono font-bold bg-slate-800 text-slate-400 px-2.5 py-1 rounded-full uppercase tracking-wider">
                7-Day Metric
              </span>
            </div>
            <h3 className="text-xl md:text-2xl font-bold tracking-tight text-white">
              ~51,000 Verified LLM Calls for Under $0.50
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
              By utilizing a cheapest-first family quorum (Cerebras + Groq + free tiers) and routing tasks dynamically, the active swarm processed 51,000+ consensus validations last week with a total cost of just **$0.48**. 
            </p>
          </div>
          <div className="shrink-0 w-full md:w-auto">
            <Link 
              href="/dashboard" 
              className="w-full md:w-auto px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition-all duration-200 inline-flex items-center justify-center gap-1.5 shadow-lg shadow-indigo-600/20"
            >
              Audit Live Logs &rarr;
            </Link>
          </div>
        </div>

        {/* Section Header */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-400" />
            <span className="text-xs font-mono font-bold text-indigo-400 uppercase tracking-widest">Transparency Ledger</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white">
            Honest-State Ledger
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed max-w-3xl">
            We reject marketing theater. Below is the verified engineering reality of the TrustShell protocol stack, clearly separating live features, testnet integrations, and roadmap items.
          </p>
        </div>

        {/* Honest State Table */}
        <div className="overflow-hidden border border-slate-800 bg-slate-900/25 rounded-2xl shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs font-mono">
              <thead>
                <tr className="bg-slate-900/65 border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                  <th className="p-4 font-bold">Module / Protocol</th>
                  <th className="p-4 font-bold">Base Sepolia (Live)</th>
                  <th className="p-4 font-bold">Staging / Sandbox</th>
                  <th className="p-4 font-bold">Roadmap / Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {rows.map((row) => (
                  <tr key={row.module} className="hover:bg-slate-900/30 transition-colors">
                    <td className="p-4 font-bold text-white text-sm">{row.module}</td>
                    <td className="p-4">
                      {row.baseSepoliaStatus === 'live' && (
                        <span className="inline-flex items-center gap-1 text-emerald-400 font-bold bg-emerald-400/5 border border-emerald-400/10 px-2 py-1 rounded-lg">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          {row.baseSepolia}
                        </span>
                      )}
                      {row.baseSepoliaStatus === 'testnet' && (
                        <span className="inline-flex items-center gap-1 text-amber-400 font-bold bg-amber-400/5 border border-amber-400/10 px-2 py-1 rounded-lg">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                          {row.baseSepolia}
                        </span>
                      )}
                      {row.baseSepoliaStatus === 'inert' && (
                        <span className="text-slate-500 bg-slate-800/10 border border-slate-800/20 px-2 py-1 rounded-lg">
                          {row.baseSepolia}
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      <span className={`font-semibold ${row.stagingStatus === 'active' ? 'text-slate-300' : 'text-amber-500'}`}>
                        {row.staging}
                      </span>
                    </td>
                    <td className="p-4 text-slate-400 leading-relaxed text-[11px] font-sans">
                      {row.roadmap}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </section>
  );
}
