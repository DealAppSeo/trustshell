'use client';

import { useState } from 'react';
import { Activity, ShieldCheck, Heart, AlertTriangle, Info, ArrowUpRight, HelpCircle } from 'lucide-react';

export default function DiagnosticSurface() {
  const [activeTab, setActiveTab] = useState<'earned' | 'perceived' | 'gap'>('earned');

  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6 backdrop-blur-sm shadow-2xl relative overflow-hidden">
      {/* Background radial highlight */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header & Honest Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/60 pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-400" />
            <h3 className="text-xl font-bold text-white tracking-tight">RepID &quot;Blood Pressure&quot; Diagnostic</h3>
          </div>
          <p className="text-xs text-slate-400">
            A multi-dimensional view of AI agent reliability: Earned (systolic) vs. Perceived (diastolic).
          </p>
        </div>
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 text-[10px] font-mono font-bold uppercase tracking-wider animate-pulse">
            <AlertTriangle className="w-3.5 h-3.5" />
            Activating (Staging Only)
          </span>
        </div>
      </div>

      {/* The headline blended score */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Blended Score */}
        <div className="p-4 bg-slate-950/40 border border-slate-800/80 rounded-2xl flex flex-col justify-between min-h-[100px]">
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">Blended RepID</span>
          <div className="py-2">
            <span className="text-3xl font-extrabold text-indigo-400">765</span>
            <span className="text-xs text-slate-500"> / 1000</span>
          </div>
          <span className="text-[9px] text-slate-500">Weighted combination score</span>
        </div>

        {/* Earned Score (Systolic) */}
        <button 
          onClick={() => setActiveTab('earned')}
          className={`p-4 border rounded-2xl flex flex-col justify-between min-h-[100px] text-left transition-all duration-200 ${
            activeTab === 'earned' 
              ? 'bg-emerald-500/5 border-emerald-500/40 shadow-lg shadow-emerald-500/5' 
              : 'bg-slate-950/40 border-slate-800/80 hover:border-slate-700'
          }`}
        >
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider flex items-center justify-between w-full">
            Earned (systolic)
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          </span>
          <div className="py-2">
            <span className="text-3xl font-extrabold text-emerald-400">892</span>
          </div>
          <span className="text-[9px] text-slate-400 font-sans">Verified behaviors (Reality)</span>
        </button>

        {/* Perceived Score (Diastolic) */}
        <button 
          onClick={() => setActiveTab('perceived')}
          className={`p-4 border rounded-2xl flex flex-col justify-between min-h-[100px] text-left transition-all duration-200 ${
            activeTab === 'perceived' 
              ? 'bg-sky-500/5 border-sky-500/40 shadow-lg shadow-sky-500/5' 
              : 'bg-slate-950/40 border-slate-800/80 hover:border-slate-700'
          }`}
        >
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider flex items-center justify-between w-full">
            Perceived (diastolic)
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
          </span>
          <div className="py-2">
            <span className="text-3xl font-extrabold text-sky-400">620</span>
          </div>
          <span className="text-[9px] text-slate-400 font-sans">External peer ratings</span>
        </button>

        {/* Diagnostic Gap */}
        <button 
          onClick={() => setActiveTab('gap')}
          className={`p-4 border rounded-2xl flex flex-col justify-between min-h-[100px] text-left transition-all duration-200 ${
            activeTab === 'gap' 
              ? 'bg-indigo-500/5 border-indigo-500/40 shadow-lg shadow-indigo-500/5' 
              : 'bg-slate-950/40 border-slate-800/80 hover:border-slate-700'
          }`}
        >
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider flex items-center justify-between w-full">
            RepID Gap
            <ArrowUpRight className="w-3.5 h-3.5 text-indigo-400" />
          </span>
          <div className="py-2">
            <span className="text-3xl font-extrabold text-white">+272</span>
          </div>
          <span className="text-[9px] text-indigo-400 font-bold uppercase">Under-valued (Safe)</span>
        </button>
      </div>

      {/* Drill-down section */}
      <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-5 space-y-4">
        {activeTab === 'earned' && (
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <h4 className="font-bold text-white text-sm">Reality Metrics (Earned)</h4>
              <span className="text-[10px] text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded font-mono">Verified logs</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Earned RepID is compiled from cryptographic, decision-by-decision audits. It represents the ground truth of the agent&apos;s computational history.
            </p>
            <div className="grid md:grid-cols-3 gap-3 pt-2 text-[11px] font-mono">
              <div className="bg-slate-900/80 p-3 border border-slate-800 rounded-xl space-y-1">
                <span className="text-slate-500 block uppercase">Fact-Check Accuracy</span>
                <span className="text-emerald-400 font-bold">92.4% (892 / 965)</span>
              </div>
              <div className="bg-slate-900/80 p-3 border border-slate-800 rounded-xl space-y-1">
                <span className="text-slate-500 block uppercase">Consensus Match Rate</span>
                <span className="text-emerald-400 font-bold">98.1% (51k calls)</span>
              </div>
              <div className="bg-slate-900/80 p-3 border border-slate-800 rounded-xl space-y-1">
                <span className="text-slate-500 block uppercase">Decay Coeff (Inactivity)</span>
                <span className="text-slate-300 font-bold">0% (Active)</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'perceived' && (
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <h4 className="font-bold text-white text-sm">External Perception Metrics (Perceived)</h4>
              <span className="text-[10px] text-sky-400 bg-sky-400/10 px-2 py-0.5 rounded font-mono">Peer Network</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Perceived RepID is calculated from external peer signatures, staking vouchers, and reputation endorsements. It is bounded to prevent marketing-led inflation.
            </p>
            <div className="grid md:grid-cols-3 gap-3 pt-2 text-[11px] font-mono">
              <div className="bg-slate-900/80 p-3 border border-slate-800 rounded-xl space-y-1">
                <span className="text-slate-500 block uppercase">Active Staking Bonds</span>
                <span className="text-sky-400 font-bold">450.00 USDC</span>
              </div>
              <div className="bg-slate-900/80 p-3 border border-slate-800 rounded-xl space-y-1">
                <span className="text-slate-500 block uppercase">SWARM Peer Rating</span>
                <span className="text-sky-400 font-bold">4.52 / 5.00</span>
              </div>
              <div className="bg-slate-900/80 p-3 border border-slate-800 rounded-xl space-y-1">
                <span className="text-slate-500 block uppercase">Attestor Endorsements</span>
                <span className="text-sky-300 font-bold">12 SWARM Nodes</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'gap' && (
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <h4 className="font-bold text-white text-sm">Diagnostic Gap Assessment</h4>
              <span className="text-[10px] text-indigo-400 bg-indigo-400/10 px-2 py-0.5 rounded font-mono">Systolic/Diastolic</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              The RepID Gap is the alignment difference (Earned minus Perceived). It is the critical diagnostic metric of the swarm.
            </p>
            <div className="bg-slate-900/80 p-4 border border-indigo-500/20 rounded-xl space-y-2 text-xs">
              <h5 className="font-bold text-white font-mono flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-400" />
                Under-Valued Agent (+272 Gap)
              </h5>
              <p className="text-slate-300 font-sans leading-relaxed text-[11px]">
                This agent has high verified performance (892) but low public exposure or perception (620). This represents an exceptional safety profile. It is highly secure for high-value executions as its reality exceeds its market perception.
              </p>
              <div className="text-[10px] text-amber-400/80 border-t border-slate-800 pt-2 font-mono leading-relaxed">
                ⚠️ Contrast: A negative gap (Perceived &gt;&gt; Earned) represents high-risk &quot;marketing inflation&quot; (like high blood pressure) and automatically triggers validation challenges.
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="text-[10px] text-slate-500/80 flex items-center gap-1.5 font-mono">
        <Info className="w-3.5 h-3.5 shrink-0" />
        <span>This diagnostic view is executing in staging mode. Real-time metric feeds are being wired by the XC team.</span>
      </div>
    </div>
  );
}
