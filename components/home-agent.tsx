'use client';

import { useState } from 'react';
import { SPEED_TRAP } from '@/lib/home-samples';
import { CHROME_STORE_URL, STAMPED_SITES, TEST_BUILD_ZIP } from '@/lib/extension-links';

/**
 * Screen 3: every door, in the order a stranger is most likely to use. Chrome first (the stamp on
 * the chat sites they already use), then the apps that speak MCP, then the terminal.
 *
 * The MCP paste is the server .mcp.json names "trustshell", which runs the bin published on
 * @hyperdag/trustshell@1.6.0 (npm view: trustshell-mcp). The same JSON for each tab; only the file
 * it goes in changes. The Chrome block switches to one "Add to Chrome" button when
 * lib/extension-links.ts names the store listing.
 */
export const MCP_SERVER = {
  command: 'npx',
  args: ['-y', '-p', '@hyperdag/trustshell@1.6.0', 'trustshell-mcp'],
};

export function mcpPaste(): string {
  return JSON.stringify({ mcpServers: { trustshell: MCP_SERVER } }, null, 2);
}

/** The ChatGPT and Grok apps do not load MCP servers; the extension stamps their websites instead. */
export const NOT_YET = 'ChatGPT and Grok apps: not yet. On their websites, use the Chrome extension.';

// npm 1.6.0 ships `trustshell check "<sentence>"`: exit 0 checks out, 1 caught, 2 not checked.
export const TERMINAL_COMMAND = `npx @hyperdag/trustshell check "${SPEED_TRAP}"`;

// A global install of 1.6.0 puts `trustshell` and `trustshell-mcp` on PATH.
export const INSTALL = 'npm i -g @hyperdag/trustshell@1.6.0';

const CODE =
  'max-w-full min-w-0 overflow-x-auto whitespace-pre-wrap break-all rounded-xl border border-slate-800 bg-slate-900 p-4 font-mono text-xs text-indigo-200';

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

        <section aria-labelledby="add-chrome" data-step="chrome" className="space-y-2">
          <h3 id="add-chrome" className="text-base font-semibold text-white">
            In Chrome
          </h3>
          <p className="text-sm text-slate-300 break-words">
            Every reply on {STAMPED_SITES.slice(0, -1).join(', ')} and {STAMPED_SITES[STAMPED_SITES.length - 1]} gets a
            stamp: Checks out, Caught, or Not checked.
          </p>
          {CHROME_STORE_URL ? (
            <a
              href={CHROME_STORE_URL}
              data-testid="add-to-chrome"
              className="inline-flex items-center justify-center rounded-lg bg-amber-600 px-5 py-3 text-sm font-bold text-white hover:bg-amber-500"
            >
              Add to Chrome
            </a>
          ) : (
            <p className="text-sm text-slate-400 break-words" data-testid="chrome-in-review">
              Coming to the Chrome Web Store. To try it now, download the{' '}
              <a href={TEST_BUILD_ZIP} className="underline underline-offset-4 hover:text-white">
                test build
              </a>
              , unzip it, open chrome://extensions, turn on Developer mode and choose Load unpacked.
            </p>
          )}
        </section>

        <h3 className="text-base font-semibold text-white">In Claude Desktop, Cursor or Claude Code</h3>
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
            <pre className={CODE}>
              <code>{PASTE}</code>
            </pre>
          </div>
        ))}
        <p className="text-sm text-slate-400" data-testid="agent-not-yet">
          {NOT_YET}
        </p>

        <section aria-labelledby="add-terminal" data-step="terminal" className="space-y-2 pt-4">
          <h3 id="add-terminal" className="text-base font-semibold text-white">
            In your terminal
          </h3>
          <pre className={CODE}>
            <code>{TERMINAL_COMMAND}</code>
          </pre>
          <p className="text-sm text-slate-400">
            Exits 0 when it checks out, 1 when caught, 2 when not checked.{' '}
            <a href="/devs" className="underline underline-offset-4 hover:text-white">
              What is a terminal?
            </a>
          </p>
          <p className="text-sm text-slate-400">To keep it installed:</p>
          <pre className={CODE}>
            <code>{INSTALL}</code>
          </pre>
        </section>
      </div>
    </section>
  );
}
