'use client';

import { useState } from 'react';
import { SPEED_TRAP } from '@/lib/home-samples';
import { CHROME_STORE_URL, STAMPED_SITES, TEST_BUILD_ZIP } from '@/lib/extension-links';

/**
 * JOB 2: "I use AI all day. I don't want to second-guess every reply." (UX copy, 2026-10-16.) The same
 * check where they already chat, as one row of three choices: Chrome first (the stamp on the chat sites
 * they already use), then the apps that speak MCP, then the terminal. Each is a native <details>: the
 * one line that says what you get is always on screen; the install steps, the config JSON and the
 * command open on a click (progressive disclosure, no script needed to open them).
 *
 * The MCP paste is the server .mcp.json names "trustshell", which runs the bin published on
 * @hyperdag/trustshell@1.6.1 (npm view: trustshell-mcp). The same JSON for each tab; only the file
 * it goes in changes. The Chrome block switches to one "Add to Chrome" button when
 * lib/extension-links.ts names the store listing; until then it says so and offers the test build.
 */
export const MCP_SERVER = {
  command: 'npx',
  args: ['-y', '-p', '@hyperdag/trustshell@1.6.1', 'trustshell-mcp'],
};

export function mcpPaste(): string {
  return JSON.stringify({ mcpServers: { trustshell: MCP_SERVER } }, null, 2);
}

/** The ChatGPT and Grok apps do not load MCP servers; the extension stamps their websites instead. */
export const NOT_YET = 'ChatGPT and Grok apps: not yet. On their websites, use the Chrome extension.';

// npm 1.6.1 ships `trustshell check "<sentence>"`: exit 0 checks out, 1 caught, 2 not checked.
export const TERMINAL_COMMAND = `npx @hyperdag/trustshell check "${SPEED_TRAP}"`;

// A global install of 1.6.1 puts `trustshell` and `trustshell-mcp` on PATH.
export const INSTALL = 'npm i -g @hyperdag/trustshell@1.6.1';

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

const STAMP_LINE = `Every reply on ${STAMPED_SITES.slice(0, -1).join(', ')} and ${STAMPED_SITES[STAMPED_SITES.length - 1]} gets a stamp: Checks out, Caught, or Not checked.`;

/** A row at least 44px tall that opens one way in. The chevron turns when open; motion is off for those who ask. */
const ROW =
  'flex min-h-11 cursor-pointer list-none flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 hover:border-amber-500 group-open:border-amber-500 [&::-webkit-details-marker]:hidden';

function Row({ title, line, action }: { title: string; line: string; action: string }) {
  return (
    <summary className={ROW}>
      <span className="min-w-0">
        <span className="block text-base font-semibold text-white">{title}</span>
        <span className="mt-1 block text-sm text-slate-300 break-words">{line}</span>
      </span>
      <span className="shrink-0 text-sm font-semibold text-amber-400 sm:pt-0.5">
        {action}{' '}
        <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">
          ›
        </span>
      </span>
    </summary>
  );
}

export function HomeAgent() {
  const [current, setCurrent] = useState<(typeof AGENT_TABS)[number]['id']>('claude-desktop');
  const [copied, setCopied] = useState(false);

  // A person's click only. Nothing is sent anywhere: the text goes to their own clipboard.
  async function copy() {
    try {
      await navigator.clipboard.writeText(PASTE);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section
      id="add-agent"
      aria-labelledby="add-agent-heading"
      className="bg-slate-950 px-4 sm:px-6 py-14 text-white border-t border-slate-800"
    >
      <div className="mx-auto max-w-3xl min-w-0 space-y-4">
        <h2 id="add-agent-heading" className="text-2xl sm:text-3xl font-bold text-white text-wrap">
          Get the check where you already use AI
        </h2>
        <p className="text-base text-slate-300">Works with whatever model you use.</p>

        <details data-step="chrome" className="group">
          <Row title="In Chrome" line={STAMP_LINE} action={CHROME_STORE_URL ? 'Add to Chrome' : 'How to add it'} />
          <div className="space-y-2 px-4 pt-3 pb-1">
            {CHROME_STORE_URL ? (
              <a
                href={CHROME_STORE_URL}
                data-testid="add-to-chrome"
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-amber-600 px-5 py-3 text-sm font-bold text-black hover:bg-amber-500"
              >
                Add to Chrome
              </a>
            ) : (
              <p className="text-sm text-slate-300 break-words" data-testid="chrome-in-review">
                Coming to the Chrome Web Store. To try it now, download the{' '}
                <a href={TEST_BUILD_ZIP} className="underline underline-offset-4 hover:text-white">
                  test build
                </a>
                , unzip it, open chrome://extensions, turn on Developer mode and choose Load unpacked.
              </p>
            )}
          </div>
        </details>

        <details data-step="mcp" className="group">
          <Row title="In Claude Desktop, Cursor or Claude Code" line="Paste one block into a settings file." action="Copy the setup" />
          <div className="space-y-3 px-4 pt-3 pb-1 min-w-0">
            <p className="text-sm text-slate-300 break-words">
              Paste this into the file named on the tab. It runs trustshell-mcp from the published package @hyperdag/trustshell@1.6.1.
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
                    className={`min-h-11 rounded-full px-4 py-2 text-sm font-medium ${
                      selected ? 'bg-amber-600 text-black' : 'bg-slate-800 text-slate-300 hover:text-white'
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
            <p className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                data-testid="copy-setup"
                onClick={() => void copy()}
                className="min-h-11 rounded-lg border border-amber-600 px-4 py-2 text-sm font-bold text-amber-400 hover:bg-amber-600 hover:text-black"
              >
                Copy the setup
              </button>
              <span role="status" className="text-sm text-slate-400">
                {copied ? 'Copied.' : ''}
              </span>
            </p>
            <p className="text-sm text-slate-400" data-testid="agent-not-yet">
              {NOT_YET}
            </p>
          </div>
        </details>

        <details data-step="terminal" className="group">
          <Row title="In your terminal" line="One command checks one sentence." action="See the command" />
          <section className="space-y-2 px-4 pt-3 pb-1">
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
        </details>

        <p className="text-sm text-slate-400">
          <a href="/start" className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-white">
            Not sure which one fits? Pick where you talk to AI
          </a>
        </p>
      </div>
    </section>
  );
}
