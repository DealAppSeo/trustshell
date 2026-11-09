'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { PRIMARY, SECONDARY, Status } from '@/components/test-agent-flow';
import type { Go, StepId } from '@/components/first-run-flow';
import { EXIT_MEANING, RUNS, SENTENCES, STATUS_MEANING, STATUS_WORDS, type RunId } from '@/lib/first-run';
import type { SentenceResult } from '@/lib/first-run-check';

type Checked = { text: string; run: RunId; result: SentenceResult; own: boolean };

/** Said where it matters, in the same words: the limit a visitor is most likely to assume away. */
export function Limit({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm leading-relaxed text-slate-200">{children}</p>;
}

export function Legend() {
  return (
    <dl className="space-y-3" data-testid="status-legend">
      {STATUS_WORDS.map((w) => (
        <div key={w}>
          <dt>
            <Status value={w} />
          </dt>
          <dd className="mt-1 text-sm leading-relaxed text-slate-300">{STATUS_MEANING[w]}</dd>
        </div>
      ))}
    </dl>
  );
}

export function LegendToggle() {
  return (
    <details className="group">
      <summary className="flex min-h-11 cursor-pointer items-center gap-1 text-sm font-semibold text-amber-300">
        <ChevronRight aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-90" />
        What do these words mean?
      </summary>
      <div className="pt-2">
        <Legend />
      </div>
    </details>
  );
}

/** The checker and both saved runs, or null if either could not be fetched. */
async function prepare() {
  try {
    const lib = await import('@/lib/first-run-check');
    const runs = await lib.loadSavedRuns();
    return runs ? { runs, checkSentence: lib.checkSentence } : null;
  } catch {
    return null;
  }
}

const INPUT = 'w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white';

function Receipt({ checked, full }: { checked: Checked; full?: boolean }) {
  const { record, tally, exit } = checked.result;
  const o = record.observation;
  const heading = useRef<HTMLHeadingElement>(null);
  // A new result takes focus so it is announced and scrolled into view; opening the Report step does not need it.
  useEffect(() => {
    if (!full) heading.current?.focus();
  }, [checked, full]);
  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4" data-testid="receipt">
      <h3 ref={heading} tabIndex={-1} className="scroll-mt-24 text-lg font-bold text-white focus:outline-none">
        What the check found
      </h3>
      <p className="break-words text-sm text-white">“{checked.text}”</p>
      <p className="text-sm leading-relaxed text-slate-300">
        Compared with GitHub’s record of run {o.run_id} in {o.owner}/{o.repo}, saved {o.fetchedAt.slice(0, 10)}. GitHub reports it finished with conclusion {o.conclusion ?? 'none'}.{' '}
        <a href={o.url} className="underline underline-offset-4 hover:text-white">
          Open this run on GitHub
        </a>
      </p>
      <ul className="space-y-3">
        {record.claims.map((c, i) => (
          <li key={i} className="break-words text-sm text-white">
            <Status value={c.status} /> {c.claim}
            <span className="mt-1 block leading-relaxed text-slate-300">{c.reason}</span>
            {full ? <span className="mt-1 block leading-relaxed text-slate-400">Covers: {c.scope}</span> : null}
          </li>
        ))}
      </ul>
      <p className="text-sm text-slate-300" data-testid="tally">
        {tally.SUPPORTED} supported, {tally.CONTRADICTED} contradicted, {tally.NOT_CHECKED} not checked. {EXIT_MEANING[exit]} The command line would exit {exit}.
      </p>
      {full ? (
        <div className="space-y-2">
          <h4 className="text-sm font-bold text-white">What this does not prove</h4>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-300">
            {record.does_not_prove.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export function ChatPath({ step, go, toVibe }: { step: StepId; go: Go; toVibe: () => void }) {
  const [ready, setReady] = useState<Awaited<ReturnType<typeof prepare>>>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [checked, setChecked] = useState<Checked | null>(null);
  const [run, setRun] = useState<RunId>('failed');
  const [text, setText] = useState('');
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    let live = true;
    void prepare().then((r) => {
      if (!live) return;
      setReady(r);
      setState(r ? 'ready' : 'error');
    });
    return () => {
      live = false;
    };
  }, []);

  const retry = async () => {
    setState('loading');
    const r = await prepare();
    setReady(r);
    setState(r ? 'ready' : 'error');
  };

  const check = (sentence: string, on: RunId, own: boolean) => {
    if (ready) setChecked({ text: sentence, run: on, result: ready.checkSentence(sentence, ready.runs[on]), own });
  };

  const submit = () => {
    const sentence = text.trim();
    setEmpty(!sentence);
    if (sentence) check(sentence, run, true);
  };

  if (state !== 'ready' && step !== 'report') {
    return state === 'loading' ? (
      <p role="status" className="text-sm text-slate-300">
        Loading the saved runs…
      </p>
    ) : (
      <div className="space-y-3">
        <div role="alert" className="rounded-lg border border-[#fb7185]/60 px-4 py-3 text-sm text-[#fecdd3]">
          The saved runs could not be loaded. Check your connection and try again.
        </div>
        <button type="button" className={PRIMARY} onClick={() => void retry()}>
          Try again
        </button>
      </div>
    );
  }

  if (step === 'try') {
    const shown = checked && !checked.own ? checked : null;
    return (
      <div className="space-y-4">
        <p className="text-slate-300">These are things an AI might say about real runs of an automated check on GitHub. Pick one. The checker the TrustShell command line uses runs here in your browser, against GitHub’s record of that run.</p>
        <Limit>TrustShell cannot see your conversations with an AI. It sees only what goes through it. On this page that means the sentence you pick or type, and it stays in your browser.</Limit>
        <ul className="space-y-2" aria-label="Sentences to check">
          {SENTENCES.map((s) => (
            <li key={s.text}>
              <button
                type="button"
                aria-pressed={shown?.text === s.text}
                onClick={() => check(s.text, s.run, false)}
                className={`min-h-11 w-full rounded-lg border p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${shown?.text === s.text ? 'border-amber-500' : 'border-border hover:border-slate-500'}`}
              >
                <span className="block break-words text-sm font-semibold text-white">“{s.text}”</span>
                <span className="mt-1 block text-xs text-slate-400">About {RUNS[s.run].label.toLowerCase()}</span>
              </button>
            </li>
          ))}
        </ul>
        {shown ? <Receipt checked={shown} /> : <p className="text-sm text-slate-400">Pick a sentence to see what the record shows.</p>}
        <LegendToggle />
        <button type="button" className={PRIMARY} onClick={() => go('test')}>
          Try my own words
        </button>
      </div>
    );
  }

  if (step === 'test') {
    const shown = checked?.own ? checked : null;
    return (
      <div className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-white">Which run is it about?</legend>
          {(['failed', 'passed'] as const).map((id) => (
            <label key={id} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm text-white ${run === id ? 'border-amber-500' : 'border-border'}`}>
              <input type="radio" name="saved-run" checked={run === id} onChange={() => setRun(id)} className="h-5 w-5 accent-amber-500" />
              {RUNS[id].label}, run {RUNS[id].id}
            </label>
          ))}
        </fieldset>
        <div className="space-y-1">
          <label htmlFor="own-sentence" className="block text-sm font-semibold text-white">
            What the AI said
          </label>
          <textarea
            id="own-sentence"
            rows={3}
            maxLength={1000}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setEmpty(false);
            }}
            aria-invalid={empty}
            aria-describedby="own-sentence-help"
            placeholder={`The check workflow succeeded, run ${RUNS[run].id}.`}
            className={INPUT}
          />
          <p id="own-sentence-help" role={empty ? 'alert' : undefined} className={`text-xs ${empty ? 'text-[#fda4af]' : 'text-slate-400'}`}>
            {empty ? 'Write a sentence first, then check it.' : 'Plain sentences, one per paragraph, each naming the run. Most other wording comes back NOT_CHECKED, which is never a pass.'}
          </p>
        </div>
        <button type="button" className={SECONDARY} onClick={submit}>
          Check this sentence
        </button>
        {shown ? <Receipt checked={shown} /> : null}
        <button type="button" className={PRIMARY} onClick={() => go('report')}>
          Read the receipt
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {checked ? (
        <Receipt checked={checked} full />
      ) : (
        <div className="space-y-3" data-testid="receipt-empty">
          <p className="text-slate-300">No receipt yet. Check a sentence first, and its receipt will appear here.</p>
          <button type="button" className={PRIMARY} onClick={() => go('try')}>
            Check a sentence
          </button>
        </div>
      )}
      <section className="space-y-3">
        <h3 className="text-base font-bold text-white">What the words mean</h3>
        <Legend />
      </section>
      <Limit>This check is only about those two saved runs. It cannot read your AI chats, and it cannot tell you whether something an AI said about the world is true.</Limit>
      <section className="space-y-2">
        <h3 className="text-base font-bold text-white">What you can do next</h3>
        <p className="text-sm leading-relaxed text-slate-300">If an AI builds software for you on GitHub, you can check what it said about your own runs.</p>
        <button type="button" className={PRIMARY} onClick={toVibe}>
          Check a real GitHub run
        </button>
        <p className="text-sm leading-relaxed text-slate-300">
          For a sentence that is not about a GitHub run,{' '}
          <a href="/check" className="underline underline-offset-4 hover:text-white">
            the second-opinion check
          </a>{' '}
          asks other AI models. That is a different check, and your sentence leaves this device.
        </p>
      </section>
    </div>
  );
}
