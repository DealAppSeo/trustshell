'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
  Shield, CheckCircle, AlertCircle, ArrowLeft, Cpu, 
  Globe, Key, Send, Check, Heart, HelpCircle
} from 'lucide-react';
import { submitLead } from '@/app/actions/leads';

export default function RecruitingPage() {
  const [email, setEmail] = useState('');
  const [github, setGithub] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [role, setRole] = useState('Developer');
  const [ecosystem, setEcosystem] = useState('Base');
  const [interest, setInterest] = useState('');
  
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await submitLead({
        email,
        github,
        linkedin,
        role,
        preferred_ecosystem: ecosystem,
        interest,
        source: 'recruiting'
      });

      if (res.success) {
        setSubmitted(true);
      } else {
        setError(res.error || 'Failed to submit waitlist form. Please try again.');
      }
    } catch (err: any) {
      setError('A connection error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

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
            <Heart className="w-8 h-8 animate-pulse text-rose-500" />
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight">
            FaithTech &amp; Builder Story
          </h1>
          <p className="text-muted text-sm md:text-base leading-relaxed">
            We are building the trust layer for the agentic economy. No theater, no opaque assertions. Cryptographically auditable, honest-state, values-aligned AI.
          </p>
        </div>

        {/* Stories Grid */}
        <div className="grid md:grid-cols-2 gap-8">
          {/* FaithTech Story Card */}
          <div className="bg-card/45 border border-border/80 rounded-3xl p-6 backdrop-blur-sm space-y-4 hover:border-accent/30 transition-all duration-300">
            <div className="flex items-center gap-2 text-rose-400 font-bold text-lg font-mono">
              <Heart className="w-5 h-5 shrink-0 text-rose-400" />
              <h2>The FaithTech Mission</h2>
            </div>
            <div className="text-muted text-xs leading-relaxed space-y-3">
              <p>
                FaithTech is more than code; it is a commitment to technology that respects human dignity, speaks the truth, and is accountable to all. In the emerging world of autonomous AI agents, opacity creates vulnerability. The last, the lost, and the least are often the first to suffer from systemic errors and manipulation.
              </p>
              <p>
                Our work is grounded in <strong>Micah 6:8</strong>: <em>&quot;To do justice, love mercy, and walk humbly.&quot;</em> By building a cryptographically auditable reputation ledger (RepID) and open hallucination classification layers, we ensure AI agents are truthful, fair, and bound to auditable constitutions.
              </p>
            </div>
          </div>

          {/* Builder Story Card */}
          <div className="bg-card/45 border border-border/80 rounded-3xl p-6 backdrop-blur-sm space-y-4 hover:border-accent/30 transition-all duration-300">
            <div className="flex items-center gap-2 text-accent font-bold text-lg font-mono">
              <Cpu className="w-5 h-5 shrink-0 text-accent" />
              <h2>The Builder Manifesto</h2>
            </div>
            <div className="text-muted text-xs leading-relaxed space-y-3">
              <p>
                We believe that trust cannot be assumed; it must be cryptographically proven. We reject closed-source security theater and centralized lock-in. TrustShell is built under the Apache 2.0 license, leveraging Ethereum Attestation Service (EAS) schemas and zero-knowledge proofs.
              </p>
              <p>
                As a builder here, you work on genuine cryptographic vaults (Plonky3 STARK circuits), BFT consensus panels, and decentralized payment interfaces (x402). We co-sign our claims with on-chain records, maintaining a public, clear distinction between what is live, what is sandboxed, and what is roadmap.
              </p>
            </div>
          </div>
        </div>

        {/* Honest-State Table Card */}
        <section className="bg-card border border-border rounded-3xl p-6 md:p-8 space-y-6">
          <div className="space-y-1.5">
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
              Honest-State Ledger
            </h2>
            <p className="text-xs text-muted leading-relaxed">
              We stand by verified realities. Below is the honest deployment status of each module across our codebase.
            </p>
          </div>

          <div className="overflow-x-auto border border-border/80 rounded-2xl">
            <table className="w-full border-collapse text-left text-xs font-mono">
              <thead>
                <tr className="bg-background/80 border-b border-border/80 text-muted uppercase tracking-wider text-[10px]">
                  <th className="p-4 font-bold">Module / Protocol</th>
                  <th className="p-4 font-bold">Base Sepolia (Live)</th>
                  <th className="p-4 font-bold">Staging / Sandbox</th>
                  <th className="p-4 font-bold">Roadmap / Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                <tr>
                  <td className="p-4 font-bold text-foreground">ERC-8004 Agent Identity</td>
                  <td className="p-4 text-emerald-400 font-semibold">Active &amp; Live</td>
                  <td className="p-4 text-muted">Fully Integrated</td>
                  <td className="p-4 text-muted-foreground">Contract deployed &amp; querying</td>
                </tr>
                <tr>
                  <td className="p-4 font-bold text-foreground">EAS Attestation Receipts</td>
                  <td className="p-4 text-emerald-400 font-semibold">Active &amp; Live</td>
                  <td className="p-4 text-muted">Replicated</td>
                  <td className="p-4 text-muted-foreground">Clickable verifications on-chain</td>
                </tr>
                <tr>
                  <td className="p-4 font-bold text-foreground">Plonky3 ZK Vault (Tier-3)</td>
                  <td className="p-4 text-emerald-400 font-semibold">Verified &amp; Active</td>
                  <td className="p-4 text-muted">1-Tier Circuit</td>
                  <td className="p-4 text-muted-foreground">Proves anonymous human ownership of the agent; reputation remains public by design.</td>
                </tr>
                <tr>
                  <td className="p-4 font-bold text-foreground">BFT Swarm Quorum</td>
                  <td className="p-4 text-amber-500 font-semibold">Testnet / Staged</td>
                  <td className="p-4 text-emerald-400">Active (12 Agents)</td>
                  <td className="p-4 text-muted-foreground">Multi-LLM voting panel running</td>
                </tr>
                <tr>
                  <td className="p-4 font-bold text-foreground">x402 Payments (Gating)</td>
                  <td className="p-4 text-amber-500 font-semibold">Testnet / Staged</td>
                  <td className="p-4 text-muted">Client SDK Live</td>
                  <td className="p-4 text-muted-foreground">Dry-runs completed; API token gated</td>
                </tr>
                <tr>
                  <td className="p-4 font-bold text-foreground">Adaptive ANFIS Weights</td>
                  <td className="p-4 text-muted-foreground">Inert</td>
                  <td className="p-4 text-amber-500 font-semibold">Static Lookup</td>
                  <td className="p-4 text-indigo-400 font-semibold">Roadmap Upgrade</td>
                </tr>
                <tr>
                  <td className="p-4 font-bold text-foreground">Two-sided Comma Gate</td>
                  <td className="p-4 text-muted-foreground">Inert</td>
                  <td className="p-4 text-muted-foreground">Dormant</td>
                  <td className="p-4 text-indigo-400 font-semibold">Roadmap (270+ agents)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Lead Capture Form */}
        <div className="max-w-xl mx-auto bg-card border border-border rounded-3xl p-6 md:p-8 space-y-6">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold text-foreground">Join the Swarm</h2>
            <p className="text-xs text-muted">Submit your profile to contribute to the TrustShell ecosystem.</p>
          </div>

          {submitted ? (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6 text-center space-y-3">
              <Check className="w-8 h-8 text-emerald-400 mx-auto" />
              <h3 className="font-bold text-foreground">Application Received</h3>
              <p className="text-muted text-xs">Your information has been written to the trinity_leads registry. We will contact you once opportunities open.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs text-red-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono text-muted block">Email Address *</label>
                  <input 
                    type="email" 
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@domain.com"
                    className="w-full px-3 py-2 bg-background border border-border rounded-xl text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono text-muted block">Role / Specialty</label>
                  <select 
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full px-3 py-2 bg-background border border-border rounded-xl text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    <option value="Developer">Developer</option>
                    <option value="Creator">Creator / Architect</option>
                    <option value="Validator">Validator Swarm Node</option>
                    <option value="Staker">Liquidity / Staking Pool</option>
                    <option value="Observer">Ethicist / Academic</option>
                  </select>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono text-muted block">GitHub Username</label>
                  <input 
                    type="text" 
                    value={github}
                    onChange={(e) => setGithub(e.target.value)}
                    placeholder="github-handle"
                    className="w-full px-3 py-2 bg-background border border-border rounded-xl text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-accent font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono text-muted block">LinkedIn Username</label>
                  <input 
                    type="text" 
                    value={linkedin}
                    onChange={(e) => setLinkedin(e.target.value)}
                    placeholder="linkedin-handle"
                    className="w-full px-3 py-2 bg-background border border-border rounded-xl text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-accent font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-mono text-muted block">Preferred Ecosystem</label>
                <select 
                  value={ecosystem}
                  onChange={(e) => setEcosystem(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-xl text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="Base">Base (Sepolia / Mainnet)</option>
                  <option value="Ethereum">Ethereum (Sepolia / Mainnet)</option>
                  <option value="Arbitrum">Arbitrum</option>
                  <option value="Optimism">Optimism</option>
                  <option value="Solana">Solana</option>
                  <option value="Multi">Cross-Chain / Protocol Agnostic</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-mono text-muted block">Interest / Projects you are building</label>
                <textarea 
                  value={interest}
                  onChange={(e) => setInterest(e.target.value)}
                  placeholder="I am interested in ZK-SNARK verifiers / writing custom agent compliance checks..."
                  className="w-full px-3 py-2 bg-background border border-border rounded-xl text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-accent h-20 resize-none"
                />
              </div>

              <button 
                type="submit" 
                disabled={submitting}
                className="w-full bg-accent hover:bg-accent/80 text-white font-bold p-3 rounded-xl transition-all duration-200 disabled:opacity-50 text-xs flex items-center justify-center gap-1.5"
              >
                {submitting ? 'Submitting Application...' : (
                  <>
                    Submit Profile <Send className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 border-t border-border/80 text-center text-xs text-muted/60">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 px-4">
          <p>© 2026 HyperDAG. All verifications are performed cryptographically.</p>
          <div className="flex items-center gap-4">
            <Link href="/provenance" className="text-accent hover:underline">
              Ecosystem Provenance
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
