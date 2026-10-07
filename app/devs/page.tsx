const LINES = [
  'Terminal is a text window that runs a command.',
  'GitHub is undo-history for a project you can share.',
];

/**
 * The commands, in the order a developer meets them. Until 2026-10-07 this page had two sentences
 * and no commands, and `init --pai` — the only way to make an agent from a terminal — was named
 * only in the API reference. Each line runs against the published @hyperdag/trustshell@1.6.0.
 */
const STEPS: { what: string; code: string }[] = [
  { what: 'Check one sentence. Exit 0 checks out, 1 caught, 2 not checked.', code: 'npx @hyperdag/trustshell@1.6.0 check "The capital of Australia is Sydney."' },
  { what: 'Make an agent. Writes .trustshell/credentials.json with its ID and key; keep that file private.', code: 'npx @hyperdag/trustshell@1.6.0 init --pai' },
  { what: 'Give Claude Desktop, Cursor or Claude Code the check tools (paste into its MCP config).', code: '{"mcpServers":{"trustshell":{"command":"npx","args":["-y","-p","@hyperdag/trustshell@1.6.0","trustshell-mcp"]}}}' },
  { what: 'Wrap your own agent: install the SDK, then register() and verifyOutput() as in Getting started.', code: 'npm i @hyperdag/trustshell@1.6.0' },
];

export const metadata = {
  title: 'Devs — TrustShell',
  description: 'Terminal is a text window that runs a command.',
};

export default function DevsPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-20 text-white">
      <div className="mx-auto max-w-xl space-y-4">
        {LINES.map((line) => (
          <p key={line} className="text-slate-300">
            {line}
          </p>
        ))}
        <p>
          <a
            href="https://github.com/DealAppSeo/trustshell"
            className="inline-block rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950"
          >
            See the code
          </a>
        </p>
        <p>
          <a href="/builders" className="text-slate-300 underline underline-offset-4">
            Builders
          </a>
        </p>
        <ol className="space-y-4 pt-4">
          {STEPS.map((s) => (
            <li key={s.code} className="space-y-2 min-w-0">
              <p className="text-sm text-slate-300">{s.what}</p>
              <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-slate-800 bg-slate-900 p-3 font-mono text-xs text-indigo-200">
                <code>{s.code}</code>
              </pre>
            </li>
          ))}
        </ol>
        <p className="text-sm text-slate-300">
          Then claim the agent with your wallet on{' '}
          <a href="/bind" className="underline underline-offset-4">/bind</a> (it asks for the agent&apos;s key from
          credentials.json), and read <a href="/docs/getting-started" className="underline underline-offset-4">Getting started</a>{' '}
          for the SDK.
        </p>
      </div>
    </main>
  );
}
