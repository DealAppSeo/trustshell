'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
  Shield, Terminal, Cpu, CheckCircle, AlertCircle, 
  ArrowRight, Copy, Check, Code, BookOpen, Layers
} from 'lucide-react';
import { submitLead } from '../actions/leads';

export default function DevLanding() {
  const [email, setEmail] = useState('');
  const [github, setGithub] = useState('');
  const [framework, setFramework] = useState('langchain');
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');

    const result = await submitLead({
      email,
      github,
      interest: `Framework: ${framework}`,
      role: 'developer',
      source: 'trustshell.dev/dev-landing',
    });

    if (result.success) {
      setStatus('success');
    } else {
      setStatus('error');
      setErrorMsg(result.error || 'Failed to submit email. Please try again.');
    }
  };

  const installCmd = 'npm install @hyperdag/trustshell';

  const sdkCode = `import { TrustShell } from '@hyperdag/trustshell';

// 1. Initialize with your agent's identity
const shell = new TrustShell({
  privateKey: process.env.AGENT_PRIVATE_KEY,
  rpcUrl: 'https://sepolia.base.org'
});

// 2. Perform a HAL evaluation over LLM outputs
const output = await llm.complete(prompt);
const verification = await shell.verify({
  prompt,
  output,
  proofType: 'POSTCARD'
});

// 3. Inspect results before execution or settling payment
if (verification.verified) {
  await shell.settleX402(paymentPayload);
} else {
  console.error("Haluncination caught: ", verification.denialReason);
}`;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 flex flex-col justify-between selection:bg-accent selection:text-white">
      {/* Navigation bar */}
      <nav className="border-b border-zinc-800 bg-[#0e0e0e]/80 backdrop-blur-md sticky top-0 z-50 px-4 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg text-zinc-100 hover:opacity-80">
            <Shield className="w-6 h-6 text-accent" />
            <span>TrustShell <span className="text-zinc-500 font-mono text-[10px]">dev</span></span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/dashboard" className="text-zinc-400 hover:text-accent font-medium">Dashboard</Link>
            <Link href="/verify" className="text-zinc-400 hover:text-accent font-medium">Verify Proofs</Link>
            <Link href="/docs" className="text-zinc-400 hover:text-accent font-medium">Docs</Link>
          </div>
        </div>
      </nav>

      {/* Main hero space */}
      <main className="max-w-5xl mx-auto px-4 py-16 w-full space-y-20">
        {/* Intro */}
        <div className="space-y-6 text-center max-w-3xl mx-auto">
          <div className="inline-flex bg-zinc-900 border border-zinc-800 p-2 rounded-2xl mb-2 text-accent font-mono text-xs uppercase tracking-widest px-4">
            npm install @hyperdag/trustshell
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white">
            Trust-security <span className="text-accent">for AI agents.</span>
          </h1>
          <p className="text-zinc-400 text-sm md:text-lg leading-relaxed max-w-2xl mx-auto">
            Interleave HAL evaluations, ERC-8004 reputation writeback, and cryptographic x402 payment gates directly into your LLM pipelines in under 3 lines of code.
          </p>
        </div>

        {/* Installation and SDK snippet Showcase */}
        <div className="grid lg:grid-cols-5 gap-8">
          {/* Left instructions block */}
          <div className="lg:col-span-2 space-y-6 flex flex-col justify-center">
            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <Terminal className="w-5 h-5 text-accent" /> Setup SDK
              </h2>
              <p className="text-zinc-400 text-xs md:text-sm leading-relaxed">
                Add TrustShell as a middleware to verify and attest agent constitution compliance. Protects your balance against hallucinations.
              </p>
            </div>

            {/* Terminal Command bar */}
            <div className="bg-[#121212] border border-zinc-800 rounded-xl p-3.5 flex items-center justify-between font-mono text-xs text-zinc-300">
              <div className="flex items-center gap-2">
                <span className="text-accent">$</span>
                <span>{installCmd}</span>
              </div>
              <button 
                onClick={() => copyToClipboard(installCmd, 'install')}
                className="text-zinc-500 hover:text-accent transition-colors"
              >
                {copiedText === 'install' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            {/* Quick benefits */}
            <div className="space-y-3 pt-4 border-t border-zinc-800 text-xs">
              <div className="flex items-center gap-2 text-zinc-300">
                <CheckCircle className="w-4 h-4 text-accent" />
                <span>Framework-agnostic (LangChain, LlamaIndex, Custom)</span>
              </div>
              <div className="flex items-center gap-2 text-zinc-300">
                <CheckCircle className="w-4 h-4 text-accent" />
                <span>Auto-attests onto Base Sepolia testnet</span>
              </div>
              <div className="flex items-center gap-2 text-zinc-300">
                <CheckCircle className="w-4 h-4 text-accent" />
                <span>Enforces x402 Staking & Sponsorship policies</span>
              </div>
            </div>
          </div>

          {/* Right code box */}
          <div className="lg:col-span-3 bg-[#121212] border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
            <div className="bg-[#161616] border-b border-zinc-800 px-4 py-3 flex items-center justify-between text-xs text-zinc-400 font-mono">
              <span className="flex items-center gap-1.5">
                <Code className="w-3.5 h-3.5 text-accent" /> index.ts
              </span>
              <button 
                onClick={() => copyToClipboard(sdkCode, 'code')}
                className="hover:text-accent flex items-center gap-1 transition-colors"
              >
                {copiedText === 'code' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[10px] text-emerald-400">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-5 font-mono text-[11px] md:text-xs overflow-x-auto text-zinc-300 leading-relaxed max-h-[380px]">
              <code>{sdkCode}</code>
            </pre>
          </div>
        </div>

        {/* Developer Waitlist Form */}
        <section className="bg-zinc-900/60 border border-zinc-800 rounded-3xl p-6 md:p-10 space-y-6 max-w-3xl mx-auto">
          <div className="space-y-2">
            <h2 className="text-xl md:text-2xl font-bold text-white">Join the Developer Early-Access</h2>
            <p className="text-zinc-400 text-xs md:text-sm">
              We are opening priority access queues and SDK support channels for developer teams building commercial AI agents.
            </p>
          </div>

          {status === 'success' ? (
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl p-5 text-center text-xs font-medium space-y-1">
              <p className="font-bold">Registration Successful!</p>
              <p className="text-zinc-400 text-[10px]">Your email has been recorded in the trinity_leads queue. We will contact you shortly.</p>
            </div>
          ) : (
            <form onSubmit={handleWaitlistSubmit} className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="dev-email" className="block text-xs font-semibold uppercase font-mono text-zinc-400">
                    Email Address <span className="text-accent">*</span>
                  </label>
                  <input 
                    type="email" 
                    id="dev-email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="dev@example.com"
                    className="w-full bg-[#161616] border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="dev-github" className="block text-xs font-semibold uppercase font-mono text-zinc-400">
                    GitHub Handle
                  </label>
                  <input 
                    type="text" 
                    id="dev-github"
                    value={github}
                    onChange={(e) => setGithub(e.target.value)}
                    placeholder="octocat"
                    className="w-full bg-[#161616] border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <span className="block text-xs font-semibold uppercase font-mono text-zinc-400">Primary Framework</span>
                <div className="grid grid-cols-3 gap-2">
                  {['langchain', 'llamaindex', 'autogen'].map((fw) => (
                    <button
                      key={fw}
                      type="button"
                      onClick={() => setFramework(fw)}
                      className={`py-2 px-3 rounded-lg text-xs font-mono border capitalize transition-all ${
                        framework === fw 
                          ? 'border-accent bg-accent/10 text-accent font-bold' 
                          : 'border-zinc-800 bg-[#121212] text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      {fw}
                    </button>
                  ))}
                </div>
              </div>

              {status === 'error' && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-3 rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={status === 'loading'}
                className="w-full bg-accent hover:bg-accent/80 text-white font-bold py-3 px-4 rounded-xl text-xs uppercase tracking-wider transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {status === 'loading' ? (
                  <span>Registering...</span>
                ) : (
                  <>
                    Request Early SDK Access <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-12 text-center text-xs text-zinc-500 bg-[#080808]">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 px-4">
          <p>© 2026 HyperDAG. SDK is licensed under Apache 2.0.</p>
          <div className="flex gap-4">
            <Link href="/dashboard" className="text-zinc-400 hover:text-accent">Network Monitor</Link>
            <Link href="/verify" className="text-zinc-400 hover:text-accent">Verification Page</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
