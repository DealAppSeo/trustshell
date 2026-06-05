'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
  Shield, CheckCircle, Lock, Mail, 
  Sparkles, ArrowLeft, ExternalLink, Users, Cpu, Award
} from 'lucide-react';

const GithubIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

const LinkedinIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect x="2" y="9" width="4" height="12" />
    <circle cx="4" cy="4" r="2" />
  </svg>
);
import { submitLead } from '@/app/actions/leads';

interface EcosystemItem {
  id: string;
  name: string;
  category: 'built' | 'blurred';
  tagline: string;
  description: string;
  icon?: any;
  badges?: string[];
  link?: string;
}

export default function EcosystemMap() {
  const [selectedVertical, setSelectedVertical] = useState<EcosystemItem | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'developer' | 'investor' | 'creator' | 'other'>('developer');
  const [handle, setHandle] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ecosystemItems: EcosystemItem[] = [
    // Built (MVP)
    {
      id: 'harness',
      name: 'TrustShell Harness',
      category: 'built',
      tagline: 'Core SDK & Verification Wrapper',
      description: 'The open-source framework-agnostic runtime that intercepts LLM calls, evaluates hallucination signals, and enforces safety boundaries.',
      icon: Cpu,
      badges: ['Production Ready', 'v1.0.0'],
      link: '/dev'
    },
    {
      id: 'repid',
      name: 'RepID.dev',
      category: 'built',
      tagline: 'ERC-8004 Registry & Engine',
      description: 'Decentralized identity registry and reputation scoring system for autonomous agents, tracking compliance history and settlement limits.',
      icon: Award,
      badges: ['Active Scorer', 'ERC-8004'],
      link: '/dashboard'
    },
    {
      id: 'trustchat',
      name: 'TrustChat.dev',
      category: 'built',
      tagline: 'Verifiable Conversation Surface',
      description: 'Secure, verified communication layer for human-to-agent and agent-to-agent interactions, packing and validating cryptographic proofs.',
      icon: Sparkles,
      badges: ['Beta Live'],
      link: 'https://trustchat.dev'
    },
    {
      id: 'protocol',
      name: 'Protocol Layer',
      category: 'built',
      tagline: 'On-chain Base Sepolia Anchors',
      description: 'Ethereum Attestation Service (EAS) schemas and smart contracts on Base Sepolia ensuring tamper-proof verification history.',
      icon: Shield,
      badges: ['Smart Contracts', 'Base Sepolia'],
      link: '/verify'
    },

    // Semi-blurred (post-MVP)
    {
      id: 'trustrepid',
      name: 'TrustRepID',
      category: 'blurred',
      tagline: 'Decentralized Credential Ledger',
      description: 'Advanced credential issuing and verification portal allowing agents to claim and prove off-chain accomplishments cryptographically.'
    },
    {
      id: 'trusttrader',
      name: 'TrustTrader',
      category: 'blurred',
      tagline: 'Multi-Agent DeFi Execution',
      description: 'Trust-minimized brokerage agent system allowing verified agents to execute complex financial transactions within authorized limit caps.'
    },
    {
      id: 'trustrails',
      name: 'TrustRails',
      category: 'blurred',
      tagline: 'x402 Micro-Payment Protocol',
      description: 'Standardized payment protocol enabling fine-grained, pay-per-token API exchanges and autonomous economic flows between agents.'
    },
    {
      id: 'trustcre',
      name: 'TrustCRE',
      category: 'blurred',
      tagline: 'Commercial Real Estate Settlement',
      description: 'Decentralized settlement agency orchestrating multi-party real estate paperwork, title checks, and escrow execution via autonomous agents.'
    },
    {
      id: 'trustmarket',
      name: 'TrustMarket',
      category: 'blurred',
      tagline: 'Open Agent Directory & Swap',
      description: 'The public marketplace to discover, hire, lease, and sponsor high-RepID utility agents for personal or corporate workflows.'
    },
    {
      id: 'trustmedical',
      name: 'TrustMedical',
      category: 'blurred',
      tagline: 'HIPAA-Compliant Medical Audits',
      description: 'Federated clinical evidence validation agents ensuring absolute medical protocol compliance without leaking private health records.'
    },
    {
      id: 'socialmirror',
      name: 'AISocialMirror',
      category: 'blurred',
      tagline: 'Autonomous Presence Sync',
      description: 'Coordinated social consensus layers translating agent reasoning directly into verified social posts and public outreach pipelines.'
    },
    {
      id: 'aidebate',
      name: 'AIDebate',
      category: 'blurred',
      tagline: 'Consensus-Seeking Arenas',
      description: 'Multi-agent adversarial debates resolving policy draft alignment, verification standards, and model drift in public view.'
    },
    {
      id: 'purposehub',
      name: 'PurposeHub',
      category: 'blurred',
      tagline: 'Social Impact Verifiers',
      description: 'Verification dashboard compiling agent work receipts against carbon offset protocols and charity-directed donation APIs.'
    },
    {
      id: 'imagebearer',
      name: 'ImageBearer',
      category: 'blurred',
      tagline: 'Verifiable AI Media Attestation',
      description: 'Watermarking and zk-proven metadata framework attesting to the precise generation parameters and editing history of AI media.'
    }
  ];

  const handleOpenModal = (item: EcosystemItem) => {
    if (item.category === 'blurred') {
      setSelectedVertical(item);
      setEmail('');
      setHandle('');
      setSuccess(false);
      setError(null);
    }
  };

  const handleCloseModal = () => {
    setSelectedVertical(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setError('Please provide a valid email address.');
      return;
    }

    setLoading(true);
    setError(null);

    const isDeveloper = role === 'developer';
    const isInvestor = role === 'investor';
    const isCreator = role === 'creator';

    const payload = {
      email,
      role,
      github: isDeveloper ? handle : undefined,
      linkedin: isInvestor ? handle : undefined,
      preferred_ecosystem: selectedVertical?.name,
      interest: `Waitlist submission for blurred vertical: ${selectedVertical?.name}. Handle type (${role}): ${handle || 'none'}`,
      source: `trustshell.dev/map#${selectedVertical?.id}`
    };

    try {
      const res = await submitLead(payload);
      if (res.success) {
        setSuccess(true);
      } else {
        setError(res.error || 'Failed to submit interest. Please try again.');
      }
    } catch {
      setError('Connection to waitlist server failed.');
    } finally {
      setLoading(false);
    }
  };

  const builtItems = ecosystemItems.filter(item => item.category === 'built');
  const blurredItems = ecosystemItems.filter(item => item.category === 'blurred');

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between">
      {/* Navigation bar */}
      <nav className="border-b border-border bg-card/40 backdrop-blur-md sticky top-0 z-50 px-4 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
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

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-12 w-full flex-grow space-y-12">
        <div className="space-y-4 text-center max-w-2xl mx-auto">
          <Link 
            href="/" 
            className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline mb-2 font-mono font-bold"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> BACK TO HOMEPAGE
          </Link>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight">
            Ecosystem Map
          </h1>
          <p className="text-muted text-sm md:text-base leading-relaxed">
            Discover the TrustShell ecosystem layout honestly. Explore our production-ready MVP core layers and learn about future vertical extensions currently in incubation.
          </p>
        </div>

        {/* Layer 1: Production Core (Built MVP) */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <h2 className="text-xl font-bold uppercase tracking-wider font-mono">Built MVP Core (Live)</h2>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6">
            {builtItems.map((item) => {
              const Icon = item.icon;
              return (
                <div 
                  key={item.id}
                  className="bg-card border border-border/80 rounded-3xl p-6 md:p-8 flex flex-col justify-between hover:border-accent/40 shadow-sm transition-all duration-300 group"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3 rounded-2xl">
                        <Icon className="w-6 h-6" />
                      </div>
                      <div className="flex flex-wrap gap-1.5 justify-end">
                        {item.badges?.map((badge, idx) => (
                          <span 
                            key={idx}
                            className="text-[9px] font-mono font-bold bg-background border border-border/80 px-2 py-0.5 rounded-md text-muted-foreground uppercase"
                          >
                            {badge}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-lg font-bold text-foreground tracking-tight group-hover:text-accent transition-colors">
                        {item.name}
                      </h3>
                      <p className="text-xs text-accent font-semibold font-mono">{item.tagline}</p>
                    </div>
                    <p className="text-xs text-muted leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                  {item.link && (
                    <div className="pt-6">
                      <Link 
                        href={item.link}
                        className="inline-flex items-center gap-1.5 text-xs text-foreground bg-background hover:bg-border border border-border/80 px-4 py-2 rounded-xl transition-all duration-200"
                      >
                        Explore Layer <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Layer 2: Incubating Verticals (Semi-blurred Post-MVP) */}
        <section className="space-y-6 pt-6">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500"></span>
            <h2 className="text-xl font-bold uppercase tracking-wider font-mono">Incubating Verticals (Post-MVP)</h2>
          </div>
          <p className="text-xs text-muted max-w-2xl leading-relaxed">
            These sectors represent upcoming extensions of the reputation network. Click on any vertical to view the waitlist interest capture modal and reserve priority access.
          </p>

          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
            {blurredItems.map((item) => (
              <button 
                key={item.id}
                onClick={() => handleOpenModal(item)}
                className="bg-card/45 border border-border/60 hover:border-accent/30 rounded-3xl p-6 text-left space-y-4 flex flex-col justify-between cursor-pointer transition-all duration-300 relative overflow-hidden group hover:scale-[1.01]"
              >
                {/* Visual glassmorphic overlay for blurred layer */}
                <div className="absolute inset-0 bg-background/5 opacity-0 group-hover:opacity-10 backdrop-blur-[1px] transition-opacity duration-300"></div>

                <div className="space-y-3 relative z-10">
                  <div className="flex items-center justify-between">
                    <div className="bg-amber-500/10 border border-amber-500/20 text-amber-500 p-2.5 rounded-xl">
                      <Lock className="w-4 h-4" />
                    </div>
                    <span className="text-[8px] font-mono bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded-full">
                      IN PROGRESS
                    </span>
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-foreground/90 tracking-tight group-hover:text-accent transition-colors">
                      {item.name}
                    </h3>
                    <p className="text-[10px] text-muted font-medium font-mono uppercase">{item.tagline}</p>
                  </div>
                  <p className="text-xs text-muted-foreground/80 leading-relaxed font-sans line-clamp-3">
                    {item.description}
                  </p>
                </div>

                <div className="pt-4 text-xs font-mono font-bold text-accent group-hover:underline flex items-center gap-1.5 relative z-10">
                  Submit Interest &rarr;
                </div>
              </button>
            ))}
          </div>
        </section>
      </main>

      {/* Email-Capture Modal */}
      {selectedVertical && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/70 backdrop-blur-md transition-opacity">
          <div className="bg-card border border-border rounded-3xl shadow-2xl max-w-md w-full overflow-hidden p-6 md:p-8 space-y-6 relative animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-amber-500 uppercase tracking-widest flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" /> Vertical Waitlist
                </span>
                <button 
                  onClick={handleCloseModal}
                  className="text-muted hover:text-foreground p-1 hover:bg-border/40 rounded-lg transition-colors font-mono text-sm"
                >
                  ✕
                </button>
              </div>
              <h3 className="text-xl font-bold tracking-tight text-foreground">
                Join the {selectedVertical.name} Waitlist
              </h3>
              <p className="text-xs text-muted-foreground">
                Reserve your developer priority access or sponsorship queue slot for this vertical.
              </p>
            </div>

            {success ? (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6 text-center space-y-3">
                <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto" />
                <h4 className="font-bold text-foreground">Successfully Registered!</h4>
                <p className="text-xs text-muted leading-relaxed">
                  We have recorded your interest in the {selectedVertical.name} ecosystem vertical. You will be prioritized for SDK beta access.
                </p>
                <button 
                  onClick={handleCloseModal}
                  className="mt-2 w-full bg-border text-foreground hover:bg-border/85 text-xs font-bold py-2 rounded-xl transition-all"
                >
                  Close Window
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Email Input */}
                <div className="space-y-1">
                  <label htmlFor="modal-email" className="block text-xs font-semibold text-muted">
                    Email Address <span className="text-accent">*</span>
                  </label>
                  <div className="relative">
                    <input 
                      type="email" 
                      id="modal-email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-xl text-foreground placeholder:text-muted/65 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/40 text-xs"
                    />
                    <Mail className="w-4 h-4 text-muted/65 absolute left-3 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                {/* Role selection */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-muted">
                    Your Profile / Interest
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button 
                      type="button"
                      onClick={() => { setRole('developer'); setHandle(''); }}
                      className={`py-2 px-3 rounded-xl border font-medium transition-all ${
                        role === 'developer' 
                          ? 'border-accent bg-accent/10 text-accent font-bold' 
                          : 'border-border bg-background hover:bg-border/40 text-muted'
                      }`}
                    >
                      Developer
                    </button>
                    <button 
                      type="button"
                      onClick={() => { setRole('investor'); setHandle(''); }}
                      className={`py-2 px-3 rounded-xl border font-medium transition-all ${
                        role === 'investor' 
                          ? 'border-accent bg-accent/10 text-accent font-bold' 
                          : 'border-border bg-background hover:bg-border/40 text-muted'
                      }`}
                    >
                      Investor
                    </button>
                    <button 
                      type="button"
                      onClick={() => { setRole('creator'); setHandle(''); }}
                      className={`py-2 px-3 rounded-xl border font-medium transition-all ${
                        role === 'creator' 
                          ? 'border-accent bg-accent/10 text-accent font-bold' 
                          : 'border-border bg-background hover:bg-border/40 text-muted'
                      }`}
                    >
                      Creator
                    </button>
                    <button 
                      type="button"
                      onClick={() => { setRole('other'); setHandle(''); }}
                      className={`py-2 px-3 rounded-xl border font-medium transition-all ${
                        role === 'other' 
                          ? 'border-accent bg-accent/10 text-accent font-bold' 
                          : 'border-border bg-background hover:bg-border/40 text-muted'
                      }`}
                    >
                      Other
                    </button>
                  </div>
                </div>

                {/* Conditional Handle Input */}
                {role === 'developer' && (
                  <div className="space-y-1 animate-in slide-in-from-top-1.5 duration-200">
                    <label htmlFor="handle-dev" className="block text-xs font-semibold text-muted">
                      GitHub Handle
                    </label>
                    <div className="relative">
                      <input 
                        type="text" 
                        id="handle-dev"
                        required
                        value={handle}
                        onChange={(e) => setHandle(e.target.value)}
                        placeholder="github_username"
                        className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-xl text-foreground placeholder:text-muted/65 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/40 text-xs"
                      />
                      <GithubIcon className="w-4 h-4 text-muted/65 absolute left-3 top-1/2 -translate-y-1/2" />
                    </div>
                  </div>
                )}

                {role === 'investor' && (
                  <div className="space-y-1 animate-in slide-in-from-top-1.5 duration-200">
                    <label htmlFor="handle-inv" className="block text-xs font-semibold text-muted">
                      LinkedIn URL / Profile
                    </label>
                    <div className="relative">
                      <input 
                        type="text" 
                        id="handle-inv"
                        required
                        value={handle}
                        onChange={(e) => setHandle(e.target.value)}
                        placeholder="linkedin.com/in/username"
                        className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-xl text-foreground placeholder:text-muted/65 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/40 text-xs"
                      />
                      <LinkedinIcon className="w-4 h-4 text-muted/65 absolute left-3 top-1/2 -translate-y-1/2" />
                    </div>
                  </div>
                )}

                {role === 'creator' && (
                  <div className="space-y-1 animate-in slide-in-from-top-1.5 duration-200">
                    <label htmlFor="handle-creator" className="block text-xs font-semibold text-muted">
                      Social Handle (IG/TikTok/YT/X)
                    </label>
                    <div className="relative">
                      <input 
                        type="text" 
                        id="handle-creator"
                        required
                        value={handle}
                        onChange={(e) => setHandle(e.target.value)}
                        placeholder="@social_handle"
                        className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-xl text-foreground placeholder:text-muted/65 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/40 text-xs"
                      />
                      <Users className="w-4 h-4 text-muted/65 absolute left-3 top-1/2 -translate-y-1/2" />
                    </div>
                  </div>
                )}

                {role === 'other' && (
                  <div className="space-y-1 animate-in slide-in-from-top-1.5 duration-200">
                    <label htmlFor="handle-other" className="block text-xs font-semibold text-muted">
                      Interest Details
                    </label>
                    <input 
                      type="text" 
                      id="handle-other"
                      required
                      value={handle}
                      onChange={(e) => setHandle(e.target.value)}
                      placeholder="Tell us about your use case..."
                      className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-foreground placeholder:text-muted/65 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/40 text-xs"
                    />
                  </div>
                )}

                {error && (
                  <p className="text-red-500 text-[10px] leading-tight font-semibold">{error}</p>
                )}

                {/* Submit button */}
                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full bg-accent hover:bg-accent/90 text-white font-bold py-2.5 rounded-xl transition-all duration-200 text-xs disabled:opacity-50"
                >
                  {loading ? 'Submitting Interest...' : 'Submit Interest &rarr;'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="py-8 border-t border-border/80 text-center text-xs text-muted/60">
        <p>© 2026 HyperDAG. All layers and incubated modules are verified cryptographically.</p>
      </footer>
    </div>
  );
}
