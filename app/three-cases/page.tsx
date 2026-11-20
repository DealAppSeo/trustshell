import type { Metadata } from 'next';
import { BYLINE, FIXTURE_LABEL, ORDER, SENTENCE, SOURCE, VIDEO_URL, caseLines, summaryTable } from './content';

// /three-cases: a self-contained page. It fetches nothing and runs no script of its own: the
// reveal is a native <details>, so it works with the keyboard and with JavaScript off, and all
// three outcomes are in the HTML the server sends. Remove the folder and the one link on the home
// page and it is gone.

const DESCRIPTION =
  'Three made-up cases, replayed from saved output of the real checker code. See what a panel opinion showed and what an answer key showed. No account, key or install.';

export const metadata: Metadata = {
  title: 'Try the three cases: TrustShell',
  description: DESCRIPTION,
};

const ENGINE = `https://github.com/${SOURCE.repository}`;
const AT = `${ENGINE}/blob/${SOURCE.commit}`;
const TRUSTSHELL = 'https://github.com/DealAppSeo/trustshell';

const RUN_DEMO = 'npx ts-node --transpile-only scripts/demo/checked-answer-demo.ts';
const INSTALL = 'npm ci --legacy-peer-deps';
const CONFORMANCE = 'node scripts/trust-backend-conformance.mjs';
const INSPECT =
  'npx @hyperdag/trustshell@1.9.3 check https://github.com/DealAppSeo/trustshell/actions/runs/44544121933 --claims-file claims.txt';

const PRE = 'whitespace-pre-wrap rounded-lg border border-border bg-[#0d1117] px-4 py-3.5 font-mono text-[13px] leading-relaxed text-[#c9d1d9] [overflow-wrap:anywhere]';
const LINK = 'text-foreground underline underline-offset-2 hover:text-amber-300';
const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400';

function Case({ id, ours, next }: { id: string; ours: string; next?: string }) {
  const { before, after } = caseLines(id);
  return (
    <section id={`case-${id.toLowerCase()}`} aria-labelledby={`case-${id}-title`} className="scroll-mt-20 border-t border-border py-10">
      <h3 id={`case-${id}-title`} className="font-display text-xl font-semibold text-foreground">Case {id}</h3>
      <p className="mb-2 mt-4 font-mono text-xs text-muted">Demo output, case {id}: what the AI was asked, what it answered, what the panel said</p>
      <pre className={PRE}>{before.join('\n')}</pre>
      <p className="mt-5 text-base text-foreground">What would you rely on? The panel called this reply clean. Decide whether you would act on the AI&apos;s answer, then open the check.</p>
      <details className="mt-3">
        <summary className={`inline-block min-h-11 cursor-pointer rounded-lg border border-amber-500/60 px-5 py-2.5 text-sm font-semibold text-amber-300 hover:bg-card ${FOCUS}`}>
          Reveal the independent check
        </summary>
        <p className="mb-2 mt-4 font-mono text-xs text-muted">Demo output, case {id}: the independent check</p>
        <pre className={PRE}>{after.join('\n')}</pre>
        <p className="mt-3 border-l-2 border-amber-500 pl-4 text-base text-foreground">
          <span className="block font-mono text-xs text-muted">Our comment, not demo output:</span>{' '}
          {ours}
        </p>
      </details>
      {next && (
        <p className="mt-6">
          <a href={`#case-${next.toLowerCase()}`} className={`text-sm ${LINK}`}>Next: Case {next}</a>
        </p>
      )}
    </section>
  );
}

export default function ThreeCasesPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 pb-20 pt-14 sm:pt-20">
        <p className="font-mono text-xs text-muted" data-byline>{BYLINE}</p>
        <h1 className="mt-5 font-display text-3xl font-semibold leading-tight text-foreground sm:text-5xl">{SENTENCE}</h1>
        <p className="mt-6 text-lg leading-relaxed text-muted">
          TrustShell is a free, open source command-line tool. It checks what an AI agent says about a GitHub Actions run
          against GitHub&apos;s own record, and marks each claim supported, contradicted or not checked. This page shows the
          idea underneath it on three made-up cases, using checker code from the project&apos;s engine repository.
        </p>
        <p className="mt-4 text-base leading-relaxed text-muted">
          An AI answered three true-or-false questions. A three-member panel gave an opinion on each reply and called all three
          clean. Then each answer was compared with an answer key, where one existed. Reading this page needs no install,
          account or key.
        </p>
        <p className="mt-8">
          <a href="#case-b" className={`inline-flex min-h-11 items-center rounded-lg bg-amber-500 px-5 text-sm font-semibold text-black hover:bg-amber-400 ${FOCUS}`}>
            Try the three cases
          </a>
        </p>
        <p className="mt-6 rounded-lg border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground">{FIXTURE_LABEL}</p>

        {VIDEO_URL && (
          <video className="mt-8 w-full rounded-lg border border-border" controls preload="none" src={VIDEO_URL} />
        )}

        <h2 className="mt-14 font-display text-2xl font-semibold text-foreground">The three cases</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">Case B comes first because it is the point. Then A, then C.</p>
        <dl className="mt-4 space-y-2 text-sm leading-relaxed text-muted">
          <div><dt className="inline font-semibold text-foreground">Fixture: </dt><dd className="inline">made-up test data typed into the demo script. Every question, answer and panel vote here is one.</dd></div>
          <div><dt className="inline font-semibold text-foreground">Panel: </dt><dd className="inline">in the engine, several AI models asked whether a reply reads as factually true. It is given the reply text only, so its opinion is about the reason the AI wrote, not about whether the decision was right.</dd></div>
          <div><dt className="inline font-semibold text-foreground">Answer key: </dt><dd className="inline">the known right answer to a question, held apart from the AI and the panel.</dd></div>
          <div><dt className="inline font-semibold text-foreground">RepID: </dt><dd className="inline">the engine&apos;s reputation score for an agent. The demo never changes one.</dd></div>
        </dl>
        <div className="mt-4">
          {ORDER.map((c, i) => (
            <Case key={c.id} id={c.id} ours={c.ours} next={ORDER[i + 1]?.id} />
          ))}
        </div>

        <section className="border-t border-border py-10" aria-labelledby="all-three">
          <h2 id="all-three" className="font-display text-2xl font-semibold text-foreground">All three, as the demo prints them</h2>
          <p className="mt-3 text-sm text-muted">The panel opinion was &ldquo;clean&rdquo; every time. Only the answer key told the cases apart.</p>
          <pre className="mt-4 overflow-x-auto whitespace-pre rounded-lg border border-border bg-[#0d1117] px-4 py-3.5 font-mono text-[13px] leading-relaxed text-[#c9d1d9]">{summaryTable().join('\n')}</pre>
        </section>

        <section className="border-t border-border py-10" aria-labelledby="where-from">
          <h2 id="where-from" className="font-display text-2xl font-semibold text-foreground">Where this output came from</h2>
          <p className="mt-3 text-sm font-semibold text-foreground">{FIXTURE_LABEL}</p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            The grey blocks above are the saved output of <code className="font-mono text-foreground">{SOURCE.script}</code> in the
            public repository <code className="font-mono text-foreground">{SOURCE.repository}</code>, at commit{' '}
            <code className="font-mono text-foreground">{SOURCE.commit.slice(0, 12)}</code>, saved {SOURCE.generated_at}. That
            script calls two pieces of the engine&apos;s own code: the function that turns panel members&apos; answers into one
            opinion (<code className="font-mono text-foreground">src/hal/fact-check.ts</code>) and the grader that compares a
            decision with an answer key (<code className="font-mono text-foreground">src/services/experimental-repid.ts</code>).
            The tasks, the AI&apos;s answers, the answer keys and what each of the three panel members said are made-up
            fixtures typed into that script. The panel code&apos;s extra steps (looking things up, asking a further model,
            reading settings from a database, falling back to a local model) are turned off in the demo, so the opinion comes
            from the three fixture answers alone. This page replays that saved output. It runs nothing and sends nothing.
          </p>
        </section>

        <section className="border-t border-border py-10" aria-labelledby="run-it">
          <h2 id="run-it" className="font-display text-2xl font-semibold text-foreground">Run it yourself</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            The same three cases, from a clone of <code className="font-mono text-foreground">{SOURCE.repository}</code> (the engine asks for Node.js 20.9 or newer, which is its own minimum, not TrustShell&apos;s):
          </p>
          <pre className={`mt-3 ${PRE}`}>{`${INSTALL}\n${RUN_DEMO}`}</pre>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            The first line installs the whole engine&apos;s dependencies, and the demo cannot run without it. The demo&apos;s
            write-up reports clean installs by other readers taking 24 to 40 minutes; yours may be faster. The demo itself then takes seconds.
          </p>
          <p className="mt-6 text-sm leading-relaxed text-muted">
            Two commands that exist today and skip that install. They are different checks, not the three cases, and this
            page gives no timing for them:
          </p>
          <p className="mt-4 text-sm text-foreground">A check of the engine&apos;s public API that needs no key or account, from the same clone (Node only, nothing else to install):</p>
          <pre className={`mt-2 ${PRE}`}>{CONFORMANCE}</pre>
          <p className="mt-2 text-sm text-muted">A recent run printed about 9 verified, 0 failed and 7 not checked. A step it could not run, for example because an option was not given, is reported as not checked with the reason, and not as a pass. It reads a live service, so yours may differ.</p>
          <p className="mt-4 text-sm text-foreground">TrustShell&apos;s own published command, Inspect, with no clone at all (Node 22.13 or newer; npx downloads the package):</p>
          <pre className={`mt-2 ${PRE}`}>{INSPECT}</pre>
          <p className="mt-2 text-sm text-muted">
            <code className="font-mono text-foreground">claims.txt</code> is a file you write: one sentence per paragraph about
            that GitHub Actions run, for example &ldquo;The check workflow succeeded, run 44544121933.&rdquo; npx downloads the
            package, then the command reads GitHub&apos;s record of the run and marks each sentence supported, contradicted or not checked.
          </p>
        </section>

        <section className="border-t border-border py-10" aria-labelledby="not-shown">
          <h2 id="not-shown" className="font-display text-2xl font-semibold text-foreground">What this does not show</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted">
            <li>No live model. Every answer on this page is a fixture.</li>
            <li>No reputation change. The demo prints a change of 0 and writes nothing.</li>
            <li>No public ledger, database or network. Nothing was recorded anywhere.</li>
            <li>Reputation here is a score, not a token.</li>
            <li>Three cases chosen to make a point. They do not measure how often the panel or the grader is right.</li>
          </ul>
        </section>

        <section className="border-t border-border py-10" aria-labelledby="links">
          <h2 id="links" className="font-display text-2xl font-semibold text-foreground">Read the source</h2>
          <ul className="mt-4 space-y-2 text-sm">
            <li><a className={LINK} href={`${AT}/${SOURCE.script}`}>The demo script</a></li>
            <li><a className={LINK} href={`${AT}/docs/CHECKED_ANSWER_DEMO.md`}>The demo&apos;s own write-up, with the full expected output</a></li>
            <li><a className={LINK} href={ENGINE}>The engine repository</a></li>
            <li><a className={LINK} href={TRUSTSHELL}>The TrustShell repository</a></li>
            <li><a className={LINK} href={`${TRUSTSHELL}#readme`}>TrustShell quickstart (README)</a></li>
          </ul>
        </section>
      </div>
    </main>
  );
}
