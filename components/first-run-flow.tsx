'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { InstallTabs } from '@/components/home-install';
import { BUTTON, Command, PRIMARY, SECONDARY, PathOne, PathTwo, ReportBody, ReportFileInput, useReportLoader } from '@/components/test-agent-flow';
import { ChatPath, Legend, LegendToggle, Limit } from '@/components/first-run-chat';
import { COMMANDS, EXAMPLE_CHECK, EXAMPLE_DEMO, EXAMPLE_RECORDED, LAUNCHER, MCP_CONFIG, MCP_CONFIG_WINDOWS } from '@/lib/first-run';

export type Who = 'chat' | 'vibe' | 'dev';
export type StepId = 'try' | 'test' | 'report';
export type Go = (s: StepId) => void;

const STEPS: { id: StepId; label: string }[] = [
  { id: 'try', label: 'Try' },
  { id: 'test', label: 'Test' },
  { id: 'report', label: 'Report' },
];

const FORK: { who: Who; title: string; body: string }[] = [
  { who: 'chat', title: 'I chat with AI', body: 'See a real check in this page. Nothing to install, no account, no key.' },
  { who: 'vibe', title: 'An AI builds software for me', body: 'It says the checks passed. Compare that with GitHub’s record of the run.' },
  { who: 'dev', title: 'I build or run agents', body: 'Run the CLI, connect the MCP server, set a Guard policy and inspect Trust Reports.' },
];

const TITLES: Record<Who, Record<StepId, string>> = {
  chat: { try: 'See a sentence get checked', test: 'Try your own words', report: 'Read the receipt' },
  vibe: { try: 'See a false claim get caught', test: 'Check your own run', report: 'Read the report' },
  dev: { try: 'Run it once, offline', test: 'Wire it in', report: 'Inspect the Trust Report' },
};

function Example({ text }: { text: string }) {
  return (
    <figure className="space-y-1">
      <pre className="whitespace-pre-wrap rounded-lg border border-border bg-[#0d1117] p-3 font-mono text-xs leading-relaxed text-[#c9d1d9] [overflow-wrap:anywhere]">{text}</pre>
      <figcaption className="text-xs text-slate-400">{EXAMPLE_RECORDED}</figcaption>
    </figure>
  );
}

const textLink = 'underline underline-offset-4 hover:text-white';

function VibeTry({ go }: { go: Go }) {
  return (
    <div className="space-y-4">
      <p className="text-slate-300">When an AI pushes code, GitHub Actions can run your checks and keep a record. TrustShell reads that record and sets it beside what the AI said.</p>
      <p className="text-slate-300">
        This one line checks a false claim about a real run. Paste it into a terminal. It needs Node 22.13 or newer. Once npx has fetched the package, it contacts only api.github.com.{' '}
        <a href="/devs" className={textLink}>
          What is a terminal?
        </a>
      </p>
      <Command text={COMMANDS.tryCheck} />
      <Example text={EXAMPLE_CHECK} />
      <Limit>A successful run is not proof the code is correct. It shows that one run succeeded, and it does not show which tests ran.</Limit>
      <LegendToggle />
      <button type="button" className={PRIMARY} onClick={() => go('test')}>
        Check my own run
      </button>
    </div>
  );
}

function VibeTest({ go }: { go: Go }) {
  return (
    <div className="space-y-4">
      <PathOne launcher={LAUNCHER} />
      <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-300">
        <li>Public GitHub Actions runs only, for now.</li>
        <li>Some wording comes back NOT_CHECKED, and one run never supports “All tests pass”. NOT_CHECKED is never a pass.</li>
        <li>Exit 0 means every claim was supported. Exit 1 means one was contradicted or the run failed. Exit 3 means something was not checked.</li>
      </ul>
      <p className="text-sm text-slate-300">The check leaves its record in a folder called evidence. Turn that into a report, in the same folder:</p>
      <Command text={COMMANDS.makeReport} />
      <button type="button" className={PRIMARY} onClick={() => go('report')}>
        I have a report
      </button>
    </div>
  );
}

function DevTry({ go }: { go: Go }) {
  return (
    <div className="space-y-4">
      <p className="text-slate-300">One command seals a sample receipt and verifies it on your machine. The first run makes an install key in your TrustShell home. No account, and once npx has fetched the package, nothing leaves the machine.</p>
      <Command text={COMMANDS.demo} />
      <Example text={EXAMPLE_DEMO} />
      <Limit>Five of the six claims are NOT_CHECKED, and the command still exits 0. An owner’s own signature shows the record is whole and who sealed it. It does not show the action was right.</Limit>
      <button type="button" className={PRIMARY} onClick={() => go('test')}>
        Wire it in
      </button>
    </div>
  );
}

function DevTest({ go }: { go: Go }) {
  return (
    <div className="space-y-5">
      <Limit>TrustShell sees only what goes through trustshell run, the MCP server and the SDK’s gated functions. It cannot see an agent’s direct edits, its own network calls or commands in another terminal.</Limit>
      <InstallTabs
        tabs={[
          {
            id: 'guard',
            label: 'Guard',
            body: (
              <div className="space-y-3" data-testid="dev-guard">
                <PathTwo />
                <p className="text-sm text-slate-300">On Windows, npm and npx cannot be started through trustshell run: the policy allows them and they then fail to start. Start the script they wrap, pinned the same way.</p>
              </div>
            ),
          },
          {
            id: 'cli',
            label: 'CLI',
            body: (
              <div className="space-y-3" data-testid="dev-cli">
                <PathOne launcher={LAUNCHER} />
                <p className="text-sm text-slate-300">For more than one claim, put them in a file, one per paragraph, and pass --claims-file instead of --claims.</p>
              </div>
            ),
          },
          {
            id: 'mcp',
            label: 'MCP',
            body: (
              <div className="space-y-3" data-testid="dev-mcp">
                <p className="text-sm text-slate-300">Paste this into your MCP client’s settings file. npx fetches the package, so there is nothing to install first.</p>
                <Command text={MCP_CONFIG} />
                <p className="text-sm text-slate-300">If your client reports it cannot find npx on Windows, use this form:</p>
                <Command text={MCP_CONFIG_WINDOWS} />
                <p className="text-sm text-slate-300">The inspect_run tool reads a public run from api.github.com, with no model and no key. The check_claim and verify_output tools send text to hosted checkers, so that text leaves your machine.</p>
                <p className="text-sm text-slate-300">With a Guard policy in the server’s TRUSTSHELL_HOME, every tool call is decided against it first. With no policy there, the call runs.</p>
              </div>
            ),
          },
        ]}
      />
      <button type="button" className={PRIMARY} onClick={() => go('report')}>
        I have a report
      </button>
    </div>
  );
}

function ReportStep({ loader, verify, onward }: { loader: ReturnType<typeof useReportLoader>; verify: string; onward: ReactNode }) {
  const { report, isExample, loading, error, loadExample, pickFile } = loader;
  return (
    <div className="space-y-5">
      <ReportFileInput onPick={pickFile} />
      <div role="status" aria-live="polite" className="min-h-[1.25rem] text-sm text-slate-400">
        {loading ? 'Loading…' : ''}
      </div>
      {error ? (
        <div role="alert" className="rounded-lg border border-[#fb7185]/60 px-4 py-3 text-sm text-[#fecdd3]">
          {error}
        </div>
      ) : null}
      {report ? (
        <>
          {isExample ? <p className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-300">This is an example report, not yours. It is real output from a test task.</p> : null}
          <ReportBody report={report} />
          <section className="space-y-2">
            <h3 className="text-base font-bold text-white">What to do next</h3>
            <ul className="space-y-2" data-testid="next-actions">
              {report.next_actions.map((a) => (
                <li key={a} className="break-words rounded-lg border border-border p-3 text-sm text-white">
                  {a}
                </li>
              ))}
            </ul>
          </section>
          <section className="space-y-2">
            <h3 className="text-base font-bold text-white">Check the report yourself</h3>
            <p className="text-sm text-slate-300">This page shows what the file says. It does not prove the file is unchanged. This does, using the key printed when the report was made:</p>
            <Command text={verify} />
          </section>
        </>
      ) : (
        <div className="space-y-3" data-testid="report-empty">
          <p className="text-slate-300">No report is open yet. Choose your report.json above, or look at a real one first.</p>
          <button type="button" className={SECONDARY} onClick={() => void loadExample()} disabled={loading}>
            {error ? 'Try the example again' : 'Use the example report'}
          </button>
        </div>
      )}
      <section className="space-y-3">
        <h3 className="text-base font-bold text-white">What the words mean</h3>
        <Legend />
      </section>
      {onward}
    </div>
  );
}

function BuilderPath({ who, step, go, pick }: { who: 'vibe' | 'dev'; step: StepId; go: Go; pick: (w: Who) => void }) {
  const loader = useReportLoader();
  if (step === 'try') return who === 'vibe' ? <VibeTry go={go} /> : <DevTry go={go} />;
  if (step === 'test') return who === 'vibe' ? <VibeTest go={go} /> : <DevTest go={go} />;
  return (
    <ReportStep
      loader={loader}
      verify={who === 'vibe' ? COMMANDS.verifyReportNpx : COMMANDS.verifyReport}
      onward={
        who === 'vibe' ? (
          <div className="space-y-2">
            <p className="text-sm text-slate-300">This report covers what the AI said about a run. To record what it runs from now on, start its commands through TrustShell.</p>
            <button type="button" className={SECONDARY} onClick={() => pick('dev')}>
              Set up Guard and MCP
            </button>
          </div>
        ) : (
          <p className="text-sm text-slate-300">
            Found a verdict that looks wrong?{' '}
            <a href="https://github.com/DealAppSeo/trustshell/issues/new?template=wrong-verdict.yml" className={textLink}>
              Report it on GitHub
            </a>
            . A supported claim that should not be is the worst bug this tool can have.
          </p>
        )
      }
    />
  );
}

export function FirstRunFlow() {
  const [who, setWho] = useState<Who | null>(null);
  const [step, setStep] = useState<StepId>('try');
  const heading = useRef<HTMLHeadingElement>(null);
  const forkHeading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  // Any change of path or step moves focus to the new heading, so keyboard and screen-reader users land on it.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    (who ? heading : forkHeading).current?.focus();
  }, [who, step]);

  const pick = (w: Who) => {
    setWho(w);
    setStep('try');
  };
  const chosen = FORK.find((f) => f.who === who);

  return (
    <div className="space-y-6" data-testid="first-run-flow" data-who={who ?? 'none'} data-step={who ? step : 'none'}>
      {chosen ? (
        <p className="flex flex-wrap items-center gap-x-3 text-sm text-slate-300">
          <span data-testid="chosen-path">Your path: {chosen.title}</span>
          <button type="button" onClick={() => setWho(null)} className={`${BUTTON} px-0 font-semibold text-amber-300 underline underline-offset-4`}>
            Change path
          </button>
        </p>
      ) : (
        <section className="space-y-3" data-testid="fork">
          <h2 ref={forkHeading} tabIndex={-1} className="scroll-mt-24 text-2xl font-semibold text-white focus:outline-none">
            Which sounds like you?
          </h2>
          <ul className="space-y-2">
            {FORK.map((f) => (
              <li key={f.who}>
                <button type="button" onClick={() => pick(f.who)} className="flex min-h-11 w-full items-center gap-3 rounded-lg border border-border bg-card p-4 text-left hover:border-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-white">{f.title}</span>
                    <span className="mt-1 block text-sm text-slate-300">{f.body}</span>
                  </span>
                  <ChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 text-amber-300" />
                </button>
              </li>
            ))}
          </ul>
          <p className="text-sm text-slate-400">You can change this at any time. Every path goes Try, Test, Report.</p>
        </section>
      )}

      {who ? (
        <>
          <nav aria-label="Steps">
            <ol className="grid grid-cols-3 gap-2">
              {STEPS.map((s, i) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setStep(s.id)}
                    aria-current={s.id === step ? 'step' : undefined}
                    className={`${BUTTON} w-full border text-left ${s.id === step ? 'border-amber-500 text-amber-300' : 'border-border text-slate-300'}`}
                  >
                    <span className="font-mono text-xs">{i + 1}</span> {s.label}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
          <h2 ref={heading} tabIndex={-1} className="scroll-mt-24 text-2xl font-semibold text-white focus:outline-none">
            {TITLES[who][step]}
          </h2>
          {who === 'chat' ? <ChatPath step={step} go={setStep} toVibe={() => pick('vibe')} /> : <BuilderPath key={who} who={who} step={step} go={setStep} pick={pick} />}
        </>
      ) : null}
    </div>
  );
}
