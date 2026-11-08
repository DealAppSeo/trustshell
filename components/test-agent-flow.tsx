'use client';

import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import {
  MAX_REPORT_BYTES,
  PATH_TWO_COMMANDS,
  inspectCommand,
  isRunUrl,
  isShellSafe,
  parseTrustReport,
  type ReportView,
} from '@/lib/trust-report-view';

const STEPS = [
  { id: 'try', label: 'Try example' },
  { id: 'test', label: 'Test my agent' },
  { id: 'review', label: 'Review report' },
  { id: 'next', label: 'Next action' },
] as const;
type StepId = (typeof STEPS)[number]['id'];

const EXAMPLE_URL = '/examples/trust-report-example.json';
const BUTTON = 'min-h-[44px] rounded-lg px-4 py-2 text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300';
const PRIMARY = `${BUTTON} bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-60`;
const SECONDARY = `${BUTTON} border border-slate-600 text-white hover:border-slate-400`;

/** Every status carries its word as well as its colour. */
function Status({ value }: { value: string }) {
  const tone =
    value === 'SUPPORTED' || value === 'ALLOWED'
      ? 'border-emerald-500/60 text-emerald-300'
      : value === 'CONTRADICTED' || value === 'DENIED'
        ? 'border-red-500/60 text-red-300'
        : 'border-amber-500/60 text-amber-300';
  return <span className={`inline-block rounded border px-2 py-0.5 font-mono text-xs ${tone}`}>{value}</span>;
}

function Command({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
  };
  return (
    <div className="space-y-1">
      <pre className="whitespace-pre-wrap break-all rounded-lg bg-slate-950 p-3 font-mono text-xs text-slate-200">
        {text}
      </pre>
      <div className="flex items-center gap-3">
        <button type="button" onClick={copy} className={SECONDARY} aria-label={`Copy command: ${text}`}>
          Copy
        </button>
        <span role="status" className="text-xs text-[#94a3b8]">
          {state === 'copied' ? 'Copied.' : state === 'failed' ? 'Could not copy. Select the text above.' : ''}
        </span>
      </div>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-base font-bold text-white">{title}</h3>
      {note ? <p className="text-sm text-[#94a3b8] break-words">{note}</p> : null}
      {children}
    </section>
  );
}

function ReportBody({ report }: { report: ReportView }) {
  return (
    <div className="space-y-6" data-testid="report-view">
      <header className="space-y-1">
        <h3 className="text-lg font-bold text-white break-words">{report.title}</h3>
        <p className="text-sm text-[#94a3b8]">
          There is no overall score. Made {report.generated_at} by {report.generator}.
        </p>
      </header>

      {report.inspect.map((i) => (
        <Section
          key={`${i.repo}-${i.run_id}`}
          title={`Path 1 · What the agent said about ${i.repo} run ${i.run_id}`}
          note={`Compared with GitHub's own record, read ${i.fetched_at}: ${i.verdict}, conclusion ${i.conclusion ?? 'none'}. TrustShell needed no access to the agent.`}
        >
          <ul className="space-y-2">
            {i.claims.map((c, n) => (
              <li key={n} className="break-words text-sm text-white">
                <Status value={c.status} /> {c.claim}
                <span className="mt-1 block text-[#94a3b8]">{c.scope}</span>
              </li>
            ))}
          </ul>
        </Section>
      ))}

      {report.bound_claims.length ? (
        <Section title="Claims paired with a command" note="TrustShell only reads how the chosen command ended.">
          <ul className="space-y-2">
            {report.bound_claims.map((b, n) => (
              <li key={n} className="break-words text-sm text-white">
                <Status value={b.status} /> {b.claim}
                <span className="mt-1 block text-[#94a3b8]">
                  decided by {b.decided_by}: {b.why}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section
        title="Path 2 · Commands that went through trustshell run"
        note={report.guard.commands.length ? `Only these. Record chain ${report.guard.ledger.verdict}, ${report.guard.ledger.count} records.` : 'No command went through TrustShell, so this report says nothing about what the agent ran.'}
      >
        <ul className="space-y-2">
          {report.guard.commands.map((c) => (
            <li key={c.seq} className="break-words text-sm text-white">
              <Status value={c.decision} /> #{c.seq} {c.action}: {c.result}
              {c.reasons.length ? <span className="mt-1 block text-[#94a3b8]">{c.reasons.join('; ')}</span> : null}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="What this report cannot see">
        <ul className="list-disc space-y-1 pl-5 text-sm text-[#cbd5e1]">
          {report.guard.not_mediated.map((t) => (
            <li key={t} className="break-words">
              {t}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function PathChoice({ path, onChange }: { path: 1 | 2; onChange: (p: 1 | 2) => void }) {
  const options = [
    { p: 1 as const, title: 'Check what it said', body: 'Compare the agent’s claims with GitHub’s record of a public Actions run. No access to the agent or its keys.' },
    { p: 2 as const, title: 'Run a task through TrustShell', body: 'Opt in: start the agent’s commands with trustshell run. Only those commands are seen.' },
  ];
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-white">How do you want to test it?</legend>
      {options.map((o) => (
        <label key={o.p} className={`flex min-h-[44px] cursor-pointer gap-3 rounded-lg border p-3 ${path === o.p ? 'border-amber-500' : 'border-slate-700'}`}>
          <input type="radio" name="path" checked={path === o.p} onChange={() => onChange(o.p)} className="mt-1 h-5 w-5 accent-amber-500" />
          <span>
            <span className="block text-sm font-bold text-white">{o.title}</span>
            <span className="block text-sm text-[#94a3b8]">{o.body}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function PathOne() {
  const [url, setUrl] = useState('');
  const [claim, setClaim] = useState('');
  const urlBad = url.trim() !== '' && !isRunUrl(url);
  const claimBad = claim.trim() !== '' && !isShellSafe(claim);
  const ready = isRunUrl(url) && isShellSafe(claim.trim());
  return (
    <div className="space-y-4" data-testid="path-one">
      <div className="space-y-1">
        <label htmlFor="run-url" className="block text-sm font-semibold text-white">
          GitHub Actions run URL
        </label>
        <input
          id="run-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          inputMode="url"
          autoComplete="off"
          aria-invalid={urlBad}
          aria-describedby="run-url-help"
          placeholder="https://github.com/owner/repo/actions/runs/123"
          className="min-h-[44px] w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white"
        />
        <p id="run-url-help" className={`text-xs ${urlBad ? 'text-red-300' : 'text-[#94a3b8]'}`} role={urlBad ? 'alert' : undefined}>
          {urlBad ? 'That is not a GitHub Actions run URL. It should end in /actions/runs/ and a number.' : 'A public repository’s run. Open its Actions tab and copy the address of one run.'}
        </p>
      </div>
      <div className="space-y-1">
        <label htmlFor="claim" className="block text-sm font-semibold text-white">
          What your agent said
        </label>
        <input
          id="claim"
          value={claim}
          onChange={(e) => setClaim(e.target.value)}
          autoComplete="off"
          aria-invalid={claimBad}
          aria-describedby="claim-help"
          placeholder="The check workflow succeeded, run 123."
          className="min-h-[44px] w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white"
        />
        <p id="claim-help" className={`text-xs ${claimBad ? 'text-red-300' : 'text-[#94a3b8]'}`} role={claimBad ? 'alert' : undefined}>
          {claimBad ? 'Quotes, $, backticks and backslashes do not survive every shell. Put the text in a file and use --claims-file instead.' : 'One plain sentence that names the run. A vague claim comes back NOT_CHECKED, which is not a pass.'}
        </p>
      </div>
      {ready ? (
        <div className="space-y-2">
          <p className="text-sm text-[#cbd5e1]">Run this. It works the same in bash, zsh and PowerShell. It contacts only api.github.com, and your text stays on your machine.</p>
          <Command text={inspectCommand(url, claim)} />
        </div>
      ) : (
        <p className="text-sm text-[#94a3b8]">Fill in both fields to get the command.</p>
      )}
    </div>
  );
}

function PathTwo() {
  return (
    <div className="space-y-3" data-testid="path-two">
      <p className="rounded-lg border border-amber-500/40 px-3 py-2 text-sm text-amber-200">
        trust-report is not in a published release yet. Until it is, follow the steps in{' '}
        <a className="underline" href="https://github.com/DealAppSeo/trustshell/blob/main/examples/own-agent/README.md">
          examples/own-agent
        </a>
        , which run it from a clone.
      </p>
      <p className="text-sm text-[#cbd5e1]">Use a fresh TRUSTSHELL_HOME for each test, then, in your project:</p>
      <ol className="space-y-3">
        {PATH_TWO_COMMANDS.map((c, i) => (
          <li key={c} className="space-y-1">
            <span className="text-xs text-[#94a3b8]">Step {i + 1}</span>
            <Command text={c} />
          </li>
        ))}
      </ol>
      <p className="text-sm text-[#94a3b8]">Anything not in the policy is refused and never starts. Anything the agent does without trustshell run is not seen.</p>
    </div>
  );
}

export function TestAgentFlow() {
  const [step, setStep] = useState<StepId>('try');
  const [path, setPath] = useState<1 | 2>(1);
  const [report, setReport] = useState<ReportView | null>(null);
  const [isExample, setIsExample] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  // A step change moves focus to the new heading, so keyboard and screen-reader users land on it.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    heading.current?.focus();
  }, [step]);

  const go = (s: StepId) => {
    setError(null);
    setStep(s);
  };

  const loadExample = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(EXAMPLE_URL);
      if (!res.ok) throw new Error(String(res.status));
      const parsed = parseTrustReport(await res.text());
      if (!parsed.ok) throw new Error(parsed.why);
      setReport(parsed.report);
      setIsExample(true);
      setStep('review');
    } catch {
      setError('The example could not be loaded. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const pickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    if (file.size > MAX_REPORT_BYTES) {
      setError('That file is larger than a Trust Report should be. Choose the report.json from your report folder.');
      return;
    }
    setLoading(true);
    try {
      const parsed = parseTrustReport(await file.text());
      if (!parsed.ok) {
        setError(parsed.why);
        return;
      }
      setReport(parsed.report);
      setIsExample(false);
    } catch {
      setError('That file could not be read. Try choosing it again.');
    } finally {
      setLoading(false);
    }
  };

  const current = STEPS.findIndex((s) => s.id === step);
  const title = STEPS[current]?.label ?? '';

  return (
    <div className="space-y-6" data-testid="test-agent-flow" data-step={step}>
      <nav aria-label="Steps">
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => go(s.id)}
                aria-current={s.id === step ? 'step' : undefined}
                className={`${BUTTON} w-full border text-left ${s.id === step ? 'border-amber-500 text-amber-300' : 'border-slate-700 text-[#cbd5e1]'}`}
              >
                <span className="font-mono text-xs">{i + 1}</span> {s.label}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <h2 ref={heading} tabIndex={-1} className="text-2xl font-bold text-white focus:outline-none">
        {title}
      </h2>

      <div role="status" aria-live="polite" className="min-h-[1.25rem] text-sm text-[#94a3b8]">
        {loading ? 'Loading…' : ''}
      </div>
      {error ? (
        <div role="alert" className="rounded-lg border border-red-500/60 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {step === 'try' ? (
        <div className="space-y-4">
          <p className="text-[#cbd5e1]">See a real report before you install anything. No account, no key. It comes from a test task where the agent said it was finished and the test said otherwise.</p>
          <button type="button" className={PRIMARY} onClick={loadExample} disabled={loading}>
            {error ? 'Try again' : 'Show the example report'}
          </button>
        </div>
      ) : null}

      {step === 'test' ? (
        <div className="space-y-5">
          <PathChoice path={path} onChange={setPath} />
          {path === 1 ? <PathOne /> : <PathTwo />}
          <button type="button" className={PRIMARY} onClick={() => go('review')}>
            I have a report
          </button>
        </div>
      ) : null}

      {step === 'review' ? (
        <div className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="report-file" className="block text-sm font-semibold text-white">
              Open your report.json
            </label>
            <input id="report-file" type="file" accept=".json,application/json" onChange={pickFile} className="block min-h-[44px] w-full text-sm text-[#cbd5e1]" />
            <p className="text-xs text-[#94a3b8]">The file is read in this page and is not sent anywhere.</p>
          </div>
          {report ? (
            <>
              {isExample ? <p className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-[#cbd5e1]">This is the example report, not yours.</p> : null}
              <ReportBody report={report} />
              <button type="button" className={PRIMARY} onClick={() => go('next')}>
                What should I do next?
              </button>
            </>
          ) : (
            <button type="button" className={SECONDARY} onClick={loadExample} disabled={loading}>
              Use the example report
            </button>
          )}
        </div>
      ) : null}

      {step === 'next' ? (
        <div className="space-y-5">
          {report ? (
            <>
              <ul className="space-y-2" data-testid="next-actions">
                {report.next_actions.map((a) => (
                  <li key={a} className="break-words rounded-lg border border-slate-700 p-3 text-sm text-white">
                    {a}
                  </li>
                ))}
              </ul>
              <Section title="Check the report yourself" note="This page shows what the file says. It does not prove the file is unchanged. This does, using the key printed when the report was made:">
                <Command text="trustshell trust-report verify report --root 0x<key>" />
              </Section>
              <button type="button" className={SECONDARY} onClick={() => go('test')}>
                Test again
              </button>
            </>
          ) : (
            <>
              <p className="text-[#cbd5e1]">Open a report first, and the next steps it calls for will appear here.</p>
              <button type="button" className={PRIMARY} onClick={() => go('review')}>
                Open a report
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
