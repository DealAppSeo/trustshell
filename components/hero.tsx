'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Copy } from 'lucide-react';

export function Hero() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText('npm install @hyperdag/trustshell');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section className="relative px-6 py-24 md:py-36 bg-slate-950 text-white overflow-hidden">
      {/* Background Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.05)_0%,transparent_70%)] pointer-events-none" />

      {/* Header bar with Navigation Logo & Links */}
      <div className="absolute top-6 left-6 right-6 flex items-center justify-between z-20">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg text-white hover:opacity-85">
          <span className="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center text-xs">⚡</span>
          <span>TrustShell</span>
        </Link>
        <div className="flex items-center gap-4 text-xs md:text-sm font-semibold text-slate-300">
          <Link href="/dashboard" className="hover:text-accent transition-colors">Dashboard</Link>
          <Link href="/verify" className="hover:text-accent transition-colors">Verify</Link>
          <Link href="/dev" className="hover:text-accent transition-colors text-accent">Developers</Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto text-center space-y-8 relative z-10">
        {/* H1 */}
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white text-balance leading-tight">
          Add trust scoring to any AI app in 3 lines
        </h1>

        {/* Code Snippet Box */}
        <div className="max-w-xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-6 text-left relative shadow-2xl">
          <pre className="font-mono text-xs md:text-sm text-indigo-200 space-y-1 overflow-x-auto">
            <code>
              <div><span className="text-indigo-400">const</span> shell = <span className="text-indigo-400">new</span> <span className="text-emerald-400">TrustShell</span>();</div>
              <div><span className="text-indigo-400">const</span> result = <span className="text-indigo-400">await</span> shell.score(response);</div>
              <div>console.log(result.trustScore); <span className="text-slate-500">// 87</span></div>
            </code>
          </pre>
        </div>

        {/* Install box */}
        <div className="flex flex-col items-center gap-2 pt-2">
          <button
            onClick={handleCopy}
            className="group flex items-center gap-3 px-5 py-3 bg-slate-900 border border-slate-800 rounded-xl font-mono text-sm hover:border-indigo-500 hover:bg-slate-900/80 transition-all duration-200 shadow-lg"
          >
            <code className="text-indigo-300">npm install @hyperdag/trustshell</code>
            <span className="text-slate-400 group-hover:text-white transition-colors">
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </span>
          </button>
          <span className="text-xs text-slate-500">
            {copied ? 'Copied to clipboard!' : 'npm package v1.0.0'}
          </span>
        </div>

        {/* CTAs */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
          <Link
            href="/dev"
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all duration-200 shadow-md hover:shadow-lg inline-flex items-center gap-2 text-sm"
          >
            Get Started
            <span aria-hidden="true">&rarr;</span>
          </Link>
          <a
            href="https://www.npmjs.com/package/@hyperdag/trustshell"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 hover:text-white font-semibold rounded-xl transition-all duration-200 text-sm"
          >
            npm
          </a>
          <a
            href="https://github.com/DealAppSeo/trustshell"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 hover:text-white font-semibold rounded-xl transition-all duration-200 text-sm"
          >
            GitHub
          </a>
        </div>
      </div>
    </section>
  );
}
