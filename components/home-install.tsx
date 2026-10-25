'use client';

import { useState } from 'react';
import { mcpPaste } from '@/components/home-agent';

/** The MCP paste, from the one config .mcp.json pins (npx, no global install needed). */
export function McpConfig() {
  return <CopyCommand text={mcpPaste()} />;
}

/** A command a visitor copies. The text is exactly what gets copied; it scrolls inside its box, never the page. */
export function CopyCommand({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false); // no clipboard (http, old browser): the text stays selectable
    }
  };
  return (
    <div className="group relative min-w-0 rounded-lg border border-border bg-[#0d1117]">
      {/* Wraps instead of scrolling sideways: a cut-off command reads as broken on a phone. Copy takes the exact text. */}
      <pre className="whitespace-pre-wrap px-4 py-3.5 pr-20 font-mono text-[13px] leading-relaxed text-[#e6edf3] [overflow-wrap:anywhere]">
        <code>{text}</code>
      </pre>
      <button
        type="button"
        onClick={copy}
        className="absolute right-2 top-2 min-h-9 rounded-md border border-border bg-card px-3 text-xs font-medium text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-amber-500"
      >
        <span aria-live="polite">{copied ? 'Copied' : label}</span>
      </button>
    </div>
  );
}

type Tab = { id: string; label: string; body: React.ReactNode };

/** Where the visitor works decides how they install. One panel shows at a time. */
export function InstallTabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  return (
    <div>
      <div role="tablist" aria-label="Where you work" className="flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            role="tab"
            type="button"
            aria-selected={active === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setActive(t.id)}
            className={`min-h-11 shrink-0 border-b-2 px-4 text-sm font-medium transition-colors ${
              active === t.id ? 'border-amber-500 text-foreground' : 'border-transparent text-muted hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} id={`panel-${t.id}`} role="tabpanel" aria-labelledby={`tab-${t.id}`} hidden={active !== t.id} className="pt-6">
          {t.body}
        </div>
      ))}
    </div>
  );
}
