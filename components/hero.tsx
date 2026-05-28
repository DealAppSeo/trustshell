'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export function Hero() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText('npm install @hyperdag/trustshell');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section className="relative px-4 py-20 md:py-32">
      {/* Logo */}
      <div className="absolute top-6 left-6">
        <span className="text-xl font-bold text-foreground">TrustShell</span>
      </div>

      <div className="max-w-4xl mx-auto text-center space-y-8">
        {/* H1 */}
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight text-foreground text-balance">
          AI agents that earn your trust.
        </h1>

        {/* Subhead */}
        <p className="text-lg md:text-xl text-muted max-w-3xl mx-auto leading-relaxed text-pretty">
          The open-source trust layer for AI agents — any framework, any model, any chain. Hallucination defense, earned on-chain ERC-8004 RepID, and x402 payment gating. Visible to owners. Opaque to everyone else. Apache 2.0.
        </p>

        {/* Badge row */}
        <div className="flex flex-wrap justify-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-sm border border-border rounded-full text-muted">
            <svg className="w-4 h-4" viewBox="0 0 256 417" preserveAspectRatio="xMidYMid">
              <path fill="currentColor" d="M127.961 0l-2.795 9.5v275.668l2.795 2.79 127.962-75.638z"/>
              <path fill="currentColor" opacity="0.6" d="M127.962 0L0 212.32l127.962 75.639V154.158z"/>
              <path fill="currentColor" d="M127.961 312.187l-1.575 1.92v98.199l1.575 4.6L256 236.587z"/>
              <path fill="currentColor" opacity="0.6" d="M127.962 416.905v-104.72L0 236.585z"/>
            </svg>
            ERC-8004 Compatible
          </span>
          <span className="inline-flex items-center px-3 py-1 text-sm border border-border rounded-full text-muted">
            x402 Ready
          </span>
          <span className="inline-flex items-center px-3 py-1 text-sm border border-border rounded-full text-muted">
            Apache 2.0
          </span>
        </div>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <a
            href="https://trustshell.dev/connect"
            className="px-6 py-3 bg-accent hover:bg-accent/90 text-white font-semibold rounded-lg transition-colors duration-200 inline-flex items-center gap-2"
          >
            Try the live app
            <span aria-hidden="true">&rarr;</span>
          </a>

          <div className="flex flex-col items-center gap-1">
            <button
              onClick={handleCopy}
              className="group flex items-center gap-3 px-4 py-2.5 bg-card border border-border rounded-lg font-mono text-sm hover:border-muted transition-colors duration-200"
            >
              <code className="text-foreground">npm install @hyperdag/trustshell</code>
              <span className="text-muted group-hover:text-foreground transition-colors">
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </span>
            </button>
            <span className="text-xs text-muted">
              {copied ? 'Copied!' : 'npm v0.6.1'}
            </span>
          </div>
        </div>

        {/* Privacy note */}
        <p className="text-sm text-muted/70 max-w-xl mx-auto">
          Free Groq + Gemini + Cerebras. Bring your own paid keys when you need premium models. Your keys never leave your browser.
        </p>
      </div>
    </section>
  );
}
