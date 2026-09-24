'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

const WIN_COMMANDS = `npm i -g @hyperdag/trustshell@1.4.0
trustshell verify "The capital of France is Paris."
trustshell verify "The Eiffel Tower is located in Rome, Italy."`;

export function Hero() {
  const [copied, setCopied] = useState(false);
  const [demoMissing, setDemoMissing] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(WIN_COMMANDS);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

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
          Gate, not a chatbot
        </h1>

        <p className="max-w-xl mx-auto text-base sm:text-lg text-slate-300 text-wrap">
          Install. Check a true sentence. Check a false one.
        </p>

        <figure className="max-w-xl w-full min-w-0 mx-auto text-left">
          <div className="relative aspect-video overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
            <video
              className="h-full w-full bg-slate-900"
              controls
              playsInline
              preload="metadata"
              src="/trustshell-demo-20s.mp4"
              aria-label="TrustShell 20 second demo"
              onError={() => setDemoMissing(true)}
            />
            {demoMissing ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-sm text-slate-400">
                20s demo slot
              </div>
            ) : null}
          </div>
          <figcaption className="mt-2 text-xs text-slate-500 leading-relaxed">
            Embed slot: <code className="break-all text-slate-400">public/trustshell-demo-20s.mp4</code>.
            The file is not in the repo yet. Copy it from{' '}
            <code className="break-all text-slate-400">E:\TrustDisk\video\trustshell-demo-20s.mp4</code>{' '}
            when that file exists.
          </figcaption>
        </figure>

        <div className="max-w-xl w-full min-w-0 mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-6 text-left shadow-2xl">
          <pre className="max-w-full overflow-x-auto font-mono text-xs md:text-sm text-indigo-200 whitespace-pre-wrap break-words">
            <code>{WIN_COMMANDS}</code>
          </pre>
          <button
            type="button"
            onClick={handleCopy}
            className="mt-4 inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied' : 'Copy the three commands'}
          </button>
        </div>
      </div>
    </section>
  );
}
