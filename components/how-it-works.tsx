'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

const steps = [
  {
    title: 'Install',
    code: 'npm install @hyperdag/trustshell',
    language: 'bash',
  },
  {
    title: 'Wrap your agent',
    code: `import { TrustShell } from '@hyperdag/trustshell';

const shell = new TrustShell({
  agentId: 'your-agent-id',
  apiKey: 'your-api-key',
  profile: 'balanced'
});

const result = await shell.evaluate(
  'Execute trade: buy 0.1 BTC at market',
  0.87
);`,
    language: 'typescript',
  },
  {
    title: 'Get the verdict',
    code: `{
  "approved": true,
  "hal_score": 0.08,
  "repid_delta": 3,
  "tier": "EARNING_AUTONOMY",
  "x402_eligible": true
}`,
    language: 'json',
  },
];

export function HowItWorks() {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopy = async (code: string, index: number) => {
    await navigator.clipboard.writeText(code);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 1500);
  };

  return (
    <section className="px-4 py-20 md:py-28 border-t border-border">
      <div className="max-w-5xl mx-auto space-y-12">
        <h2 className="text-3xl md:text-4xl font-bold text-foreground">
          How it works.
        </h2>

        <div className="grid md:grid-cols-3 gap-6">
          {steps.map((step, index) => (
            <div key={step.title} className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-accent text-white text-sm font-semibold flex items-center justify-center">
                  {index + 1}
                </span>
                <h3 className="font-semibold text-foreground">{step.title}</h3>
              </div>
              <div className="relative group">
                <pre className="p-4 bg-[#1a1a1a] rounded-lg overflow-x-auto text-sm">
                  <code className="font-mono text-zinc-300 whitespace-pre">{step.code}</code>
                </pre>
                <button
                  onClick={() => handleCopy(step.code, index)}
                  className="absolute top-2 right-2 p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label={`Copy ${step.title} code`}
                >
                  {copiedIndex === index ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4 text-zinc-400" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        <a
          href="https://github.com/DealAppSeo/trustshell"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-muted hover:text-accent transition-colors"
        >
          <span>&rarr;</span> See full SDK reference on GitHub
        </a>

        <div className="text-sm text-muted/70 leading-relaxed max-w-2xl space-y-2">
          <p className="font-semibold text-foreground">Which package do I install?</p>
          <ul className="space-y-1.5">
            <li>
              Building an agent/app <span className="text-foreground">in code</span> —{' '}
              <code className="font-mono text-accent">npm install @hyperdag/trustshell</code> (the SDK: HAL + ERC-8004 RepID + x402, in your TS/JS).
            </li>
            <li>
              Using an <span className="text-foreground">AI tool</span> (Claude Desktop, Cursor, Windsurf), no code —{' '}
              <code className="font-mono text-accent">npx @hyperdag/trustshell-mcp</code> (the same three protocols as AI-callable tools).
            </li>
            <li>
              Only verifying <span className="text-foreground">ZK proofs</span> client-side —{' '}
              <code className="font-mono text-accent">npm install @hyperdag/proof-verifier</code> (usually bundled with trustshell — rarely installed directly).
            </li>
          </ul>
          <p className="text-muted/60">
            Most people want <code className="font-mono">@hyperdag/trustshell</code> (building in code) or{' '}
            <code className="font-mono">@hyperdag/trustshell-mcp</code> (adding trust to your AI, no code). <code className="font-mono">proof-verifier</code> is a building block that ships inside trustshell.
          </p>
        </div>

        <p className="text-sm text-muted/70 leading-relaxed max-w-2xl">
          <code className="font-mono text-accent">npm install @hyperdag/trustshell</code> is live today and delivers all three protocols — HAL, ERC-8004 RepID, and x402 — in one wrapper.
          {' '}There&apos;s now an AI-native install too — no terminal: the{' '}
          <span className="text-foreground">MCP server</span> (
          <a
            href="https://www.npmjs.com/package/@hyperdag/trustshell-mcp"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-accent hover:underline"
          >
            @hyperdag/trustshell-mcp
          </a>
          ) is <span className="text-foreground">live on npm</span> and exposes the same three protocols as AI-callable tools in Claude Desktop and Cursor. Run{' '}
          <code className="font-mono text-accent">npx @hyperdag/trustshell-mcp</code>, or add{' '}
          <code className="font-mono">{'{"mcpServers":{"trustshell":{"command":"npx","args":["-y","@hyperdag/trustshell-mcp"]}}}'}</code>{' '}
          to your Claude Desktop / Cursor config.{' '}
          <span className="text-muted/60">A GitHub install (github:DealAppSeo/trustshell) is still coming.</span>
        </p>
      </div>
    </section>
  );
}
