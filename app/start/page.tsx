'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ORIGIN, WHERE, planFor, type Origin, type Where } from '@/lib/start-plan';

const SENTENCE = 'Paste something an AI told you and see if it checks out.';

const QUESTION = 'Where do you already talk to AI?';

// Asked only after the first answer. Fresh is offered first: nothing they already have is touched.
const SECOND = 'A fresh agent, or one you already have?';

// The README's first screen: the same command and one real run of the published package.
const COMMANDS = `npx @hyperdag/trustshell check "If you drive 60 miles at 30 mph and drive back at 60 mph, your average speed for the trip is 45 mph."`;

const OUTPUT = `veto
The classifier labelled this sentence veto — do not rely on it (356 ms).`;

/**
 * The front door. Where you already talk to AI, then a fresh agent or one you have; each pair of
 * answers lands on one short plan whose first step is the next thing to do (lib/start-plan.ts).
 * The first screen asks for nothing but a pick.
 */
export default function StartPage() {
  const [where, setWhere] = useState<Where | null>(null);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const plan = where && origin ? planFor(where, origin) : null;

  return (
    <main className="min-h-screen bg-slate-950 px-4 sm:px-6 py-16 text-white">
      <div className="mx-auto max-w-xl min-w-0 space-y-8">
        <p className="text-3xl font-extrabold tracking-tight text-white">{SENTENCE}</p>

        <section className="space-y-3">
          <h1 className="text-3xl font-extrabold tracking-tight text-white">{QUESTION}</h1>
          <div className="flex flex-wrap gap-2">
            {WHERE.map((w) => (
              <button
                key={w.id}
                type="button"
                aria-pressed={where === w.id}
                onClick={() => setWhere(w.id)}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${where === w.id ? 'bg-amber-500 text-slate-950' : 'bg-white text-slate-950'}`}
              >
                {w.label}
              </button>
            ))}
          </div>
        </section>

        {where && (
          <section className="space-y-3">
            {where === 'terminal' && (
              <div className="space-y-3">
                <p className="text-sm text-slate-300">First, check something:</p>
                <pre className="max-w-full overflow-x-hidden whitespace-pre-wrap break-all rounded-2xl border border-slate-800 bg-slate-900 p-4 font-mono text-sm text-indigo-200">
                  <code>{COMMANDS}</code>
                </pre>
                <pre className="max-w-full overflow-x-hidden whitespace-pre-wrap break-all rounded-2xl border border-slate-800 bg-slate-900 p-4 font-mono text-sm text-indigo-200">
                  <code>{OUTPUT}</code>
                </pre>
                <p className="text-slate-300">That run exited 1.</p>
              </div>
            )}
            <h2 className="text-2xl font-bold text-white">{SECOND}</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {ORIGIN.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={origin === o.id}
                  onClick={() => setOrigin(o.id)}
                  className={`rounded-xl border px-4 py-3 text-left ${origin === o.id ? 'border-amber-500 bg-amber-500/10' : 'border-slate-700 bg-slate-900'}`}
                >
                  <span className="block font-semibold text-white">{o.label}</span>
                  <span className="block text-sm text-slate-400">{o.sub}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {plan && (
          <section aria-labelledby="plan-h" className="space-y-3">
            <h2 id="plan-h" className="text-xl font-bold text-white">What to do</h2>
            <ol className="space-y-4">
              {plan.map((step, i) => {
                const cls = `inline-block rounded-lg px-4 py-2 text-sm font-bold ${i === 0 ? 'bg-amber-600 text-white hover:bg-amber-500' : 'border border-slate-600 text-white hover:bg-slate-800'}`;
                return (
                  <li key={i} className="space-y-2 rounded-xl border border-slate-800 bg-slate-900 p-4 min-w-0">
                    <p className="text-sm text-slate-200 break-words">
                      <span className="mr-2 font-mono text-slate-500">{i + 1}.</span>
                      {step.notYet && <span className="mr-2 rounded bg-slate-700 px-1.5 py-0.5 text-xs text-slate-200">not built yet</span>}
                      {step.text}
                    </p>
                    {step.code && (
                      <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-slate-950 p-3 font-mono text-xs text-indigo-200">
                        <code>{step.code}</code>
                      </pre>
                    )}
                    {step.href && step.label && (step.href.startsWith('/') ? (
                      <Link href={step.href} className={cls}>{step.label}</Link>
                    ) : (
                      <a href={step.href} className={cls}>{step.label}</a>
                    ))}
                  </li>
                );
              })}
            </ol>
          </section>
        )}
      </div>
    </main>
  );
}
