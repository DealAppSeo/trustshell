'use client';

import { useState } from 'react';

export function CopyReceiptLine({ line }: { line: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
      <code className="font-mono text-sm text-foreground">{line}</code>
      <button
        type="button"
        className="text-sm text-amber-500"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(line);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
