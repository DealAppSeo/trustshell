import type { Metadata } from 'next';
import { CopyCommand, InstallTabs, McpConfig } from '@/components/home-install';

// The home page has one job (Sean, 2026-10-24): get a developer to run TrustShell and install it.
// Everything else (the hosted sentence check, the game, the agent path, the vision) has its own page
// and stays off this one. The demo below is real output from @hyperdag/trustshell 1.8.0, recorded
// 2026-10-24T16:56:30Z against a pinned public run; re-record it rather than edit it.
const DESCRIPTION =
  "Check what your AI agent did, not what it says it did. TrustShell reads GitHub's own record of a CI run and marks each claim your agent made supported, contradicted or not checked. Free, open source, runs on your machine.";

export const metadata: Metadata = {
  title: 'TrustShell: check what your AI agent did, not what it says it did',
  description: DESCRIPTION,
  openGraph: { title: 'TrustShell', description: DESCRIPTION, type: 'website', url: 'https://trustshell.dev' },
  twitter: { card: 'summary_large_image', title: 'TrustShell', description: DESCRIPTION },
};

const RUN_ID = '39619591025';
const RUN_URL = `https://github.com/DealAppSeo/trustshell/actions/runs/${RUN_ID}`;
const TRY = `npx @hyperdag/trustshell@latest check ${RUN_URL} --claims "The check workflow succeeded on commit 5d1c5e3f57e1, run ${RUN_ID}."`;
const GITHUB = 'https://github.com/DealAppSeo/trustshell';

const CLAIMS = `The check workflow succeeded, run ${RUN_ID}.

The check workflow succeeded on commit 5d1c5e3f57e1, run ${RUN_ID}.`;

const AGENT_RULE = `Before you tell me a GitHub Actions run passed:
1. Write it as one sentence that names the run, like
   "The check workflow succeeded, run <run-id>."
2. Run: npx @hyperdag/trustshell@latest check <run-url> --claims "<that sentence>"
3. Say it only if the command exits 0. If it exits 1, tell me what
   was contradicted. If it exits 3, say the claim was not checked.`;

function Verdict({ kind }: { kind: 'SUPPORTED' | 'CONTRADICTED' | 'NOT CHECKED' }) {
  const color = kind === 'SUPPORTED' ? 'var(--state-measured)' : kind === 'CONTRADICTED' ? 'var(--state-failed)' : 'var(--state-not-checked)';
  return (
    <span className="inline-block rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-wide" style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
      {kind}
    </span>
  );
}

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-border">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">{title}</h2>
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      {/* 1. One promise, one action. */}
      <section className="mx-auto grid max-w-6xl gap-12 px-4 pb-16 pt-14 sm:pb-20 sm:pt-24 lg:grid-cols-[3fr_2fr] lg:items-center">
        <div className="min-w-0">
        <p className="font-mono text-xs text-muted">Open source CLI · Apache-2.0 · free, no account</p>
        <h1 className="mt-5 max-w-3xl font-display text-4xl font-semibold leading-[1.1] text-foreground sm:text-6xl">
          Check what your AI agent did, not what it says it did.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
          Your agent reports that CI passed on its commit. TrustShell reads GitHub&apos;s own record of that run and marks every
          claim <span className="text-foreground">supported</span>, <span className="text-foreground">contradicted</span> or{' '}
          <span className="text-foreground">not checked</span>. It runs on your machine and talks only to api.github.com.
        </p>

        <div className="mt-10 max-w-3xl">
          <p className="mb-2 text-sm text-muted">Try it on a real run. This claim names the wrong commit (Node 22+):</p>
          <CopyCommand text={TRY} />
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <a href="#install" className="inline-flex min-h-11 items-center rounded-lg bg-amber-500 px-5 text-sm font-semibold text-black hover:bg-amber-400">
            Install TrustShell
          </a>
          <a href="#how" className="inline-flex min-h-11 items-center rounded-lg border border-border px-5 text-sm font-medium text-foreground hover:bg-card">
            See what it prints
          </a>
          <a href={GITHUB} className="inline-flex min-h-11 items-center px-2 text-sm text-muted underline-offset-4 hover:text-foreground hover:underline">
            GitHub
          </a>
        </div>
        </div>

        {/* What the command above prints: real 1.8.0 output, 2026-10-24T17:00:06Z, trimmed to the verdict that matters. */}
        <figure className="min-w-0">
          <div className="rounded-lg border border-border bg-[#0d1117] px-4 py-4 font-mono text-[13px] leading-relaxed text-[#c9d1d9] [overflow-wrap:anywhere]">
            <p className="text-muted">Run DealAppSeo/trustshell · run {RUN_ID}</p>
            <p className="mt-2 text-foreground">Claims: 1 supported · 1 contradicted · 1 not checked</p>
            <p className="mt-3"><Verdict kind="CONTRADICTED" /> commit 5d1c5e3f57e1</p>
            <p className="pl-4 text-muted">The claim cites commit 5d1c5e3f57e1; the inspected run is on 392797a69b6a.</p>
            <p className="mt-3 text-muted">exit 1</p>
          </div>
          <figcaption className="mt-2 text-xs text-muted">What that command prints (trimmed), recorded with 1.8.0 on 24 Oct 2026.</figcaption>
        </figure>
      </section>

      {/* 2. The real output: the visitor sees a lie caught before installing anything. */}
      <Section id="how" title="Your agent writes what it did. TrustShell checks it against the run.">
        <div className="grid min-w-0 gap-6 lg:grid-cols-[2fr_3fr]">
          <div className="min-w-0">
            <p className="mb-2 font-mono text-xs text-muted">claims.txt: what the agent said</p>
            <pre className="whitespace-pre-wrap rounded-lg border border-border bg-card px-4 py-3.5 font-mono text-[13px] leading-relaxed text-foreground [overflow-wrap:anywhere]">
              {CLAIMS}
            </pre>
            <ol className="mt-6 space-y-3 text-sm leading-relaxed text-muted">
              <li><span className="text-foreground">One claim per paragraph</span>, with a blank line between claims.</li>
              <li><span className="text-foreground">Name the run</span> (run {RUN_ID}) in any sentence about its outcome.</li>
              <li><span className="text-foreground">Supported is narrow:</span> a green run supports &ldquo;this run succeeded&rdquo;, not &ldquo;all tests pass&rdquo;.</li>
            </ol>
          </div>
          <div className="min-w-0">
            <p className="mb-2 font-mono text-xs text-muted">trustshell check … --claims-file claims.txt (trimmed)</p>
            <div className="rounded-lg border border-border bg-[#0d1117] px-4 py-3.5 font-mono text-[13px] leading-relaxed text-[#c9d1d9] [overflow-wrap:anywhere]">
              <p className="text-muted">Run DealAppSeo/trustshell · run {RUN_ID} · commit 392797a69b6a</p>
              <p className="text-muted">GitHub reports status completed · conclusion success</p>
              <p className="mt-3 text-foreground">Claims: 3 supported · 1 contradicted · 1 not checked</p>
              <p className="mt-3"><Verdict kind="CONTRADICTED" /> commit 5d1c5e3f57e1</p>
              <p className="pl-4 text-muted">The claim cites commit 5d1c5e3f57e1; the inspected run is on 392797a69b6a.</p>
              <p className="mt-2"><Verdict kind="SUPPORTED" /> The check workflow succeeded</p>
              <p className="pl-4 text-muted">GitHub reports conclusion &ldquo;success&rdquo; for run {RUN_ID} (attempt 1, commit 392797a69b6a); 1 of 1 job concluded success. The line cites this run.</p>
              <p className="mt-2"><Verdict kind="NOT CHECKED" /> The check workflow succeeded</p>
              <p className="pl-4 text-muted">This sentence cites a commit, run or attempt that is not, or could not be matched to, the inspected run, so its outcome claims are not compared.</p>
              <p className="mt-3 text-muted">exit 1</p>
            </div>
            <p className="mt-2 text-xs text-muted">
              Recorded with 1.8.0 on 24 Oct 2026, 16:56 UTC.{' '}
              <a href={RUN_URL} className="underline underline-offset-2 hover:text-foreground">Open the run</a> and compare.
              Exit codes: 0 every claim supported, 1 one contradicted, 3 something not checked.
            </p>
          </div>
        </div>
      </Section>

      {/* 3. Install where the visitor already works. */}
      <Section id="install" title="Install it where you work">
        <InstallTabs
          tabs={[
            {
              id: 'terminal',
              label: 'Terminal',
              body: (
                <div className="max-w-3xl space-y-4">
                  <CopyCommand text="npm install -g @hyperdag/trustshell" />
                  <CopyCommand text="trustshell check <run-url> --claims-file claims.txt" />
                  <p className="text-sm text-muted">
                    Or run it once without installing: <code className="font-mono text-foreground">npx @hyperdag/trustshell@latest check …</code>.
                    Public GitHub Actions runs only, for now. <code className="font-mono text-foreground">GITHUB_TOKEN</code> is optional; it only raises GitHub&apos;s rate limit.
                  </p>
                </div>
              ),
            },
            {
              id: 'agent',
              label: 'Coding agent',
              body: (
                <div className="max-w-3xl space-y-4">
                  <p className="text-sm text-muted">
                    Any agent that can run a shell command can check itself before it tells you it is done. Add this to its rules
                    file (<code className="font-mono text-foreground">AGENTS.md</code>, <code className="font-mono text-foreground">CLAUDE.md</code> or your
                    agent&apos;s equivalent):
                  </p>
                  <CopyCommand text={AGENT_RULE} />
                </div>
              ),
            },
            {
              id: 'mcp',
              label: 'MCP',
              body: (
                <div className="max-w-3xl space-y-4">
                  <p className="text-sm text-muted">
                    For Claude Desktop, Cursor or any MCP client. Paste this into its MCP settings file; npx fetches the package, so
                    there is nothing to install first:
                  </p>
                  <McpConfig />
                  <p className="text-sm text-muted">
                    In 1.8.0 the server gives your AI a second-opinion check on one sentence, quote checking and local memory. Inspect
                    over MCP is on main and ships in the next release; until then your agent can run the command above.
                  </p>
                </div>
              ),
            },
          ]}
        />
      </Section>

      {/* 4. Say the limits before a reviewer has to find them. */}
      <Section title="What it does not prove">
        <ul className="grid gap-4 text-sm leading-relaxed text-muted sm:grid-cols-3">
          <li className="rounded-lg border border-border p-5">It reports what GitHub can confirm about one run. It is not a judgement that the code is correct.</li>
          <li className="rounded-lg border border-border p-5">A successful run shows that run succeeded. It does not show which tests ran, or that the right tests exist.</li>
          <li className="rounded-lg border border-border p-5">The record is not signed yet. Its SHA-256 shows whether it changed after it was made, not who made it.</li>
        </ul>
        <p className="mt-8 text-sm text-muted">
          A claim marked supported that should not be is the worst bug this tool can have.{' '}
          <a href={`${GITHUB}/issues/new?template=wrong-verdict.yml`} className="text-foreground underline underline-offset-2">Report a wrong verdict</a>
          {' · '}
          <a href="/docs" className="text-foreground underline underline-offset-2">Docs</a>
        </p>
      </Section>
    </main>
  );
}
