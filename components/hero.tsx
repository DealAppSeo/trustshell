'use client';

import { useState } from 'react';

const WIN_COMMANDS = `npm i -g @hyperdag/trustshell@1.4.0
trustshell status`;

const MCP_PASTE = `{ "mcpServers": { "trustshell": { "command": "trustshell-mcp" } } }`;

export function Hero() {
  const [panel, setPanel] = useState<'mcp' | 'terminal' | null>(null);

  return (
    <section className="relative px-6 py-20 md:py-28 bg-slate-950 text-white overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.05)_0%,transparent_70%)] pointer-events-none" />

      <div className="absolute top-6 left-6 flex items-center gap-2">
        <span className="text-xl font-bold tracking-tight text-white flex items-center gap-1.5">
          <span className="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center text-xs">⚡</span>
          TrustShell
        </span>
      </div>

      <div className="max-w-3xl w-full min-w-0 mx-auto text-center space-y-8 relative z-10">
        <h1 className="max-w-full text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-white text-wrap leading-tight">
          AI lies. Now it has to show its work.
        </h1>

        <p className="max-w-xl mx-auto text-base sm:text-lg text-slate-300 text-wrap">
          Check any claim. Get a receipt. Your keys stay yours.
        </p>

        <p className="max-w-xl mx-auto text-base text-slate-300 text-wrap">
          No signup. No wallet. Leave whenever you want.
        </p>

        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            aria-expanded={panel === 'mcp'}
            onClick={() => setPanel('mcp')}
            className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-5 py-3 text-base font-medium text-white hover:bg-indigo-500"
          >
            Check a claim in the chat you already use: Claude, ChatGPT, Grok, Cursor
          </button>
          <button
            type="button"
            aria-expanded={panel === 'terminal'}
            onClick={() => setPanel('terminal')}
            className="text-sm text-slate-400 underline underline-offset-4 hover:text-white"
          >
            I have a terminal
          </button>
        </div>

        {panel === 'mcp' ? (
          <div className="max-w-xl w-full min-w-0 mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-6 text-left shadow-2xl">
            <p className="text-sm text-slate-400 mb-3">Claude, ChatGPT, Grok, Cursor</p>
            <pre className="max-w-full overflow-x-auto font-mono text-xs md:text-sm text-indigo-200 whitespace-pre-wrap break-words">
              <code>{MCP_PASTE}</code>
            </pre>
          </div>
        ) : null}

        {panel === 'terminal' ? (
          <div className="max-w-xl w-full min-w-0 mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-6 text-left shadow-2xl">
            <pre className="max-w-full overflow-x-auto font-mono text-xs md:text-sm text-indigo-200 whitespace-pre-wrap break-words">
              <code>{WIN_COMMANDS}</code>
            </pre>
            <a href="/devs" className="mt-4 inline-block text-sm text-slate-400 underline underline-offset-4 hover:text-white">
              Devs
            </a>
          </div>
        ) : null}
      </div>
    </section>
  );
}
