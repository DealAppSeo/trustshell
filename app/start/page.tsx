'use client';

import { useState } from 'react';

const QUESTION = 'Where do you already talk to AI?';

const CLIENTS = ['Claude', 'ChatGPT', 'Grok', 'Cursor'] as const;

const PASTE = '{ "mcpServers": { "trustshell": { "command": "trustshell-mcp" } } }';

const COMMANDS = `npm i -g @hyperdag/trustshell@1.5.0
trustshell verify "paste your own claim"
trustshell repid trinity-shofet`;

export default function StartPage() {
  const [pick, setPick] = useState<(typeof CLIENTS)[number] | 'Terminal' | null>(null);
  const chat = pick !== null && pick !== 'Terminal';

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-20 text-white">
      <div className="mx-auto max-w-xl space-y-6">
        <p className="text-3xl font-extrabold tracking-tight text-white">AI lies. Now it has to show its work.</p>
        <p className="text-base text-slate-300">Check any claim. Get a receipt. Your keys stay yours.</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-white">{QUESTION}</h1>
        <div className="flex flex-wrap gap-3">
          {CLIENTS.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={pick === name}
              onClick={() => setPick(name)}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950"
            >
              {name}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={pick === 'Terminal'}
            onClick={() => setPick('Terminal')}
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950"
          >
            Terminal
          </button>
        </div>
        {chat ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <p className="mb-3 text-sm text-slate-400">Paste this into {pick}</p>
            <pre className="overflow-x-auto font-mono text-sm text-indigo-200">
              <code>{PASTE}</code>
            </pre>
          </div>
        ) : null}
        {pick === 'Terminal' ? (
          <div className="space-y-4">
            <pre className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 font-mono text-sm text-indigo-200">
              <code>{COMMANDS}</code>
            </pre>
            <p className="text-slate-300">Copy family host verdict. That is the receipt.</p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
