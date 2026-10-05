'use client';

import { useState } from 'react';

/**
 * Screen 3. The paste is the trustshell server from .mcp.json, which runs the
 * bin published on @hyperdag/trustshell@1.6.0 (npm view: trustshell-mcp).
 * The same JSON for each tab. Only the file it goes in changes.
 */
export const MCP_SERVER = {
  command: 'npx',
  args: ['-y', '-p', '@hyperdag/trustshell@1.6.0', 'trustshell-mcp'],
};

export function mcpPaste(): string {
  return JSON.stringify({ mcpServers: { trustshell: MCP_SERVER } }, null, 2);
}

export const NOT_YET = 'ChatGPT and Grok: not yet.';

export const AGENT_TABS = [
  {
    id: 'claude-desktop',
    label: 'Claude Desktop',
    where:
      'Windows: %APPDATA%\\Claude\\claude_desktop_config.json. Mac: ~/Library/Application Support/Claude/claude_desktop_config.json.',
  },
  {
    id: 'cursor',
    label: 'Cursor',
    where: '.cursor/mcp.json in the project, or ~/.cursor/mcp.json for every project.',
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    where: '.mcp.json in the project.',
  },
] as const;

const PASTE = mcpPaste();

export function HomeAgent() {
  const [current, setCurrent] = useState<(typeof AGENT_TABS)[number]['id']>('claude-desktop');

  return (
    <section
      id="add-agent"
      aria-labelledby="add-agent-heading"
      className="bg-slate-950 px-4 sm:px-6 pb-16 text-white"
    >
      <div className="mx-auto max-w-xl min-w-0 space-y-4">
        <h2 id="add-agent-heading" className="text-xl font-semibold text-white text-wrap">
          Add it to the agent you already use
        </h2>
        <p className="text-sm text-slate-300 break-words">
          Paste this into the file named on the tab. It runs trustshell-mcp from the published package @hyperdag/trustshell@1.6.0.
        </p>
        <div role="tablist" aria-label="Agents that already speak MCP" className="flex flex-wrap gap-2">
          {AGENT_TABS.map((tab) => {
            const selected = tab.id === current;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`tab-${tab.id}`}
                data-testid="agent-tab"
                aria-selected={selected}
                aria-controls={`panel-${tab.id}`}
                onClick={() => setCurrent(tab.id)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                  selected ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-300'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        {AGENT_TABS.map((tab) => (
          <div
            key={tab.id}
            role="tabpanel"
            id={`panel-${tab.id}`}
            aria-labelledby={`tab-${tab.id}`}
            hidden={tab.id !== current}
            data-testid="agent-panel"
            className="space-y-3 min-w-0"
          >
            <p className="text-sm text-slate-400 break-all">{tab.where}</p>
            <pre className="max-w-full min-w-0 overflow-x-auto whitespace-pre-wrap break-all rounded-xl border border-slate-800 bg-slate-900 p-4 font-mono text-xs text-indigo-200">
              <code>{PASTE}</code>
            </pre>
          </div>
        ))}
        <p className="text-sm text-slate-400" data-testid="agent-not-yet">
          {NOT_YET}
        </p>
      </div>
    </section>
  );
}
