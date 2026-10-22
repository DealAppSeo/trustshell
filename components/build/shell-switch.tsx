'use client';

import { useState } from 'react';
import { CopyButton } from './copy-button';
import { Cmd } from './cmd';

export type Shell = { id: string; label: string; prompt: string; commands: string[] };

/**
 * The same commands for each shell, behind a visible switch (a tablist, not a hidden disclosure).
 * Each panel's Copy takes the commands without prompts. Without script, the first shell shows.
 */
export function ShellSwitch({ shells, label }: { shells: Shell[]; label: string }) {
  const [current, setCurrent] = useState(shells[0].id);

  return (
    <div className="min-w-0 rounded-lg border border-slate-800 bg-[#0b1220]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-2 py-1">
        <div role="tablist" aria-label={label} className="flex gap-1">
          {shells.map((s) => {
            const selected = s.id === current;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                id={`shell-tab-${s.id}`}
                aria-selected={selected}
                aria-controls={`shell-panel-${s.id}`}
                onClick={() => setCurrent(s.id)}
                className={`min-h-11 rounded-md px-3 text-sm font-semibold transition-colors ${
                  selected ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
        {shells.map((s) =>
          s.id === current ? <CopyButton key={s.id} text={s.commands.join('\n')} label={`Copy the ${s.label} commands`} /> : null,
        )}
      </div>
      {shells.map((s) => (
        <pre
          key={s.id}
          role="tabpanel"
          id={`shell-panel-${s.id}`}
          aria-labelledby={`shell-tab-${s.id}`}
          hidden={s.id !== current}
          tabIndex={0}
          className="overflow-x-auto px-4 py-4 font-mono text-[13px] leading-6 text-white [font-variant-ligatures:none]"
        >
          {s.commands.map((c, i) => (
            <span key={i} className="block whitespace-pre-wrap [overflow-wrap:normal]">
              <span aria-hidden="true" className="select-none text-slate-400">
                {s.prompt}{' '}
              </span>
              <Cmd text={c} />
            </span>
          ))}
        </pre>
      ))}
    </div>
  );
}
