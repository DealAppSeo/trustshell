'use client';

import { Shield, CheckCircle, AlertCircle, Calendar, Key, Cpu, Globe, Info, ExternalLink, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function ProvenanceOnePager() {
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
            <Link href="/verify" className="text-muted hover:text-accent font-medium">Verify Proofs</Link>
            <Link href="/dev" className="text-muted hover:text-accent font-medium">Developers</Link>
          </div>
        </div>
      </nav>

      {/* Main content area */}
      <main className="max-w-4xl mx-auto px-4 py-12 w-full flex-grow space-y-12">
        <div className="space-y-4 text-center max-w-2xl mx-auto">
          <div className="inline-flex bg-accent/10 border border-accent/20 p-2 rounded-2xl mb-2 text-accent">
            <Globe className="w-8 h-8" />
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight">
            Ecosystem Provenance
          </h1>
          <p className="text-muted text-sm md:text-base leading-relaxed">
            What&apos;s True · What&apos;s Testnet · What&apos;s Roadmap. An honest one-page checkable audit sheet of the active AI agent verification protocols.
          </p>
        </div>

        {/* Three main blocks */}
        <div className="grid md:grid-cols-3 gap-6">
          {/* Card 1: What's True (Live & Verified) */}
          <div className="bg-card/40 border border-emerald-500/20 rounded-3xl p-6 backdrop-blur-sm space-y-6 hover:border-emerald-500/40 transition-all duration-300">
            <div className="space-y-2">
              <span className="text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-full uppercase tracking-wider">
                Live &amp; Verified
              </span>
              <h2 className="text-xl font-extrabold text-foreground tracking-tight pt-1">What is True</h2>
              <p className="text-muted text-[11px] leading-relaxed">
                Core cryptographic safety structures and audit trails running in production.
              </p>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-1 bg-background/50 border border-border p-3 rounded-xl">
                <h3 className="font-bold text-foreground flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  HAL Quorum Verdicts
                </h3>
                <p className="text-muted-foreground text-[10px] leading-relaxed">
                  Fact-check evaluations are run live against Groq and Cerebras using a 2-provider family quorum, with a measured **F1 score of 0.83** on a self-generated labeled set (currently re-validating on independent real hallucinations).
                </p>
              </div>

              <div className="space-y-1 bg-background/50 border border-border p-3 rounded-xl">
                <h3 className="font-bold text-foreground flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  3-Tier Routing &amp; ZK Vault
                </h3>
                <p className="text-muted-foreground text-[10px] leading-relaxed">
                  The routing gateway is live. Tasks are routed through **Postcard** (fast path attestation), **Envelope** (BFT quorum consensus), or **Vault** (zero-knowledge recursive circuit using Plonky3).
                </p>
              </div>

              <div className="space-y-1 bg-background/50 border border-border p-3 rounded-xl">
                <h3 className="font-bold text-foreground flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ERC-8004 Agent Identity
                </h3>
                <p className="text-muted-foreground text-[10px] leading-relaxed">
                  Registry contracts are live on Base Sepolia. Reputation writes are executed on-chain (e.g. transaction `0x3990a198...` at block `42354044`).
                </p>
              </div>

              <div className="space-y-1 bg-background/50 border border-border p-3 rounded-xl">
                <h3 className="font-bold text-foreground flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  EAS Attestation Registry
                </h3>
                <p className="text-muted-foreground text-[10px] leading-relaxed">
                  Attestation payloads are encoded and anchored on Base Sepolia using Ethereum Attestation Service (EAS) schemas, producing verifiable UIDs.
                </p>
              </div>
            </div>
          </div>

          {/* Card 2: What's Testnet (Simulated Mode) */}
          <div className="bg-card/40 border border-amber-500/20 rounded-3xl p-6 backdrop-blur-sm space-y-6 hover:border-amber-500/40 transition-all duration-300">
            <div className="space-y-2">
              <span className="text-[10px] font-mono font-bold bg-amber-500/10 text-amber-500 px-2.5 py-1 rounded-full uppercase tracking-wider">
                Simulated / Testnet
              </span>
              <h2 className="text-xl font-extrabold text-foreground tracking-tight pt-1">What is Testnet</h2>
              <p className="text-muted text-[11px] leading-relaxed">
                Active protocols executing in simulated environments using mock parameters.
              </p>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-1 bg-background/50 border border-border p-3 rounded-xl">
                <h3 className="font-bold text-foreground flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  x402 Settlement Escrows
                </h3>
                <p className="text-muted-foreground text-[10px] leading-relaxed">
                  Escrow settlement contracts are run in simulated mode. Transaction hash `0xmock3c511d...` is displayed honestly to show protocol flow without locking production collateral.
                </p>
              </div>

              <div className="space-y-1 bg-background/50 border border-border p-3 rounded-xl">
                <h3 className="font-bold text-foreground flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  Active Heartbeats &amp; Tasks
                </h3>
                <p className="text-muted-foreground text-[10px] leading-relaxed">
                  12/12 agent heartbeats and completed task queues are queried dynamically from a live staging database to demonstrate the network in motion.
                </p>
              </div>

              <div className="space-y-1 bg-background/50 border border-border p-3 rounded-xl">
                <h3 className="font-bold text-foreground flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  Static ANFIS Routing
                </h3>
                <p className="text-muted-foreground text-[10px] leading-relaxed">
                  Fuzzy coordination logic behaves as a static cost/quality lookup derived from historical runs, routing tasks statically instead of executing adaptive weight updates.
                </p>
              </div>
            </div>
          </div>

          {/* Card 3: What's Roadmap (In Development) */}
          <div className="bg-card/40 border border-indigo-500/20 rounded-3xl p-6 backdrop-blur-sm space-y-6 hover:border-indigo-500/40 transition-all duration-300">
            <div className="space-y-2">
              <span className="text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-400 px-2.5 py-1 rounded-full uppercase tracking-wider">
                Future Roadmap
              </span>
              <h2 className="text-xl font-extrabold text-foreground tracking-tight pt-1">What is Roadmap</h2>
              <p className="text-muted text-[11px] leading-relaxed">
                Planned features and dormant components in active research and engineering.
              </p>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-1 bg-background/50 border border-border p-3 rounded-xl">
                <h3 className="font-bold text-foreground flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  ZK Vault Recursive Proving
                </h3>
                <p className="text-muted-foreground text-[10px] leading-relaxed">
                  While the 1-concrete tier circuit is live, recursive proof aggregation for multi-agent chains is under active development to optimize block space.
                </p>
              </div>

              <div className="space-y-1 bg-background/50 border border-border p-3 rounded-xl">
                <h3 className="font-bold text-foreground flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  Disagreement/Divergence Gate Damping
                </h3>
                <p className="text-muted-foreground text-[10px] leading-relaxed">
                  Mathematical damping to prevent unbounded reputation inflation during high-disagreement runs (`[Dormant]`) is scheduled for activation once the active agent corpus exceeds 270 nodes.
                </p>
              </div>

              <div className="space-y-1 bg-background/50 border border-border p-3 rounded-xl">
                <h3 className="font-bold text-foreground flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  Adaptive ANFIS Weights
                </h3>
                <p className="text-muted-foreground text-[10px] leading-relaxed">
                  The closed-loop reinforcement learning framework (using particle swarm optimization) for real-time routing adaptation is scheduled for the next major protocol upgrade.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Verification Checklist */}
        <section className="bg-card border border-border rounded-3xl p-6 md:p-8 space-y-6">
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">
            Auditor&apos;s 10-Minute Verification Path
          </h2>
          <p className="text-xs text-muted leading-relaxed">
            Follow these three simple steps to verify every active claim on this website without third-party tools:
          </p>
          <div className="space-y-4">
            <div className="flex gap-4 items-start">
              <span className="w-6 h-6 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-xs font-mono font-bold text-accent shrink-0">1</span>
              <div>
                <h4 className="text-sm font-bold text-foreground">Check the EAS Schema &amp; Attestations</h4>
                <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                  Open the EAS explorer on Base Sepolia and verify our Schema. Query recent attestations to confirm the data matches the agent IDs and reputation writes shown on our dashboard.
                </p>
              </div>
            </div>
            <div className="flex gap-4 items-start">
              <span className="w-6 h-6 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-xs font-mono font-bold text-accent shrink-0">2</span>
              <div>
                <h4 className="text-sm font-bold text-foreground">Audit the Basescan Transaction Logs</h4>
                <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                  Inspect the contract state of the ERC-8004 IdentityRegistry and ReputationRegistry. Confirm that reputation updates correspond to the exact transaction hashes in Base Sepolia block records.
                </p>
              </div>
            </div>
            <div className="flex gap-4 items-start">
              <span className="w-6 h-6 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-xs font-mono font-bold text-accent shrink-0">3</span>
              <div>
                <h4 className="text-sm font-bold text-foreground">Verify the SDK Local Execution</h4>
                <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                  Run <code className="text-accent">npm install trustshell</code> in a blank project. Run the three-line verify call in <code className="text-accent">quickstart.js</code> and confirm that it outputs matching cryptographic receipts and live scores.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-8 border-t border-border/80 text-center text-xs text-muted/60">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 px-4">
          <p>© 2026 HyperDAG. All verifications are performed cryptographically.</p>
          <div className="flex items-center gap-4">
            <Link href="/verify" className="text-accent hover:underline">
              Verify Evidence
            </Link>
            <Link href="/dashboard" className="text-accent hover:underline">
              Dashboard
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
