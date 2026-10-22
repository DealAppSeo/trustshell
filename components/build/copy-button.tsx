'use client';

import { useState } from 'react';

/**
 * Copies exactly `text` (commands without their "$ " prompts) to the visitor's own clipboard.
 * Nothing is sent anywhere. A browser can refuse clipboard access; then it says so, instead of
 * failing silently and leaving the visitor to paste whatever was there before.
 */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        aria-label={label}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setState('copied');
            setTimeout(() => setState('idle'), 1800);
          } catch {
            setState('failed');
          }
        }}
        className="inline-flex min-h-11 items-center rounded-md border border-slate-700 px-3 text-sm font-semibold text-white transition-colors hover:border-amber-500 hover:text-amber-300"
      >
        Copy
      </button>
      <span role="status" className="text-sm text-slate-400">
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Could not copy: select the text instead' : ''}
      </span>
    </span>
  );
}
