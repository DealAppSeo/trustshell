'use client';

import { useState } from 'react';
import { AGENT_TABS, INSTALL, TERMINAL_COMMAND, mcpPaste } from '@/components/home-agent';

/**
 * /gateway, "install it": the three ways to run TrustShell on your own machine. Every command comes
 * from the constants the home page already uses (components/home-agent.tsx), so a version bump there
 * moves this page too, and the two cannot disagree. The Inspect line is the README's own first
 * command. The SDK lines are the README's usage (`new TrustShell()`, `verifyOutput`).
 */
export const INSPECT_COMMAND =
  'npx @hyperdag/trustshell@latest check https://github.com/OWNER/REPO/actions/runs/1234567890 --claims-file claims.txt';

export const SDK_INSTALL = 'npm install @hyperdag/trustshell';

export const SDK_SNIPPET = `import { TrustShell } from '@hyperdag/trustshell';

const shell = new TrustShell(); // no key needed for a check
const result = await shell.verifyOutput('The Eiffel Tower is located in Rome, Italy.');
console.log(result.verdict, result.evidence);`;

const CODE =
  'max-w-full min-w-0 overflow-x-auto whitespace-pre-wrap break-all rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs text-indigo-200';

function Copyable({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  // A person's click only; the text goes to their own clipboard and nowhere else.
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="space-y-2 min-w-0">
      <pre className={CODE}>
        <code>{text}</code>
      </pre>
      <p className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void copy()}
          className="min-h-11 rounded-lg border border-amber-600 px-4 py-2 text-sm font-bold text-amber-400 hover:bg-amber-600 hover:text-black"
        >
          Copy {label}
        </button>
        <span role="status" className="text-sm text-slate-400">
          {copied ? 'Copied.' : ''}
        </span>
      </p>
    </div>
  );
}

export function GatewayInstall() {
  return (
    <div className="grid gap-6 min-w-0">
      <article data-testid="install-cli" className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 min-w-0">
        <h3 className="text-lg font-semibold text-white">1. The command line</h3>
        <p className="text-sm text-slate-300">
          Check what your AI agent said about a public GitHub Actions run against GitHub&apos;s own record. Its only network
          call is to api.github.com: no account, no key, nothing uploaded. Put your agent&apos;s words in{' '}
          <code className="font-mono text-indigo-200">claims.txt</code>, one plain sentence per paragraph, and cite the run id.
        </p>
        <Copyable text={INSPECT_COMMAND} label="the Inspect command" />
        <p className="text-sm text-slate-300">
          Or check one sentence an AI told you. This one leaves your machine: secrets are scrubbed on your device first, then
          the sentence goes to our hosted checkers.
        </p>
        <Copyable text={TERMINAL_COMMAND} label="the sentence check" />
        <p className="text-sm text-slate-300">To keep the commands installed:</p>
        <Copyable text={INSTALL} label="the install command" />
        <p className="text-sm text-slate-400">
          Needs Node 22.13 or newer. New to it? <a href="/inspect" className="underline underline-offset-4 hover:text-white">The five-minute Inspect challenge</a>{' '}
          walks you through one true and one false claim.
        </p>
      </article>

      <article data-testid="install-sdk" className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 min-w-0">
        <h3 className="text-lg font-semibold text-white">2. The npm package, in your own code</h3>
        <p className="text-sm text-slate-300">
          The same checks from JavaScript or TypeScript. The verdict is <span className="font-mono">PASS</span>,{' '}
          <span className="font-mono">FLAG</span>, <span className="font-mono">VETO</span> or{' '}
          <span className="font-mono">NOT_CHECKED</span>, and <span className="font-mono">NOT_CHECKED</span> is never a pass.
        </p>
        <Copyable text={SDK_INSTALL} label="npm install" />
        <Copyable text={SDK_SNIPPET} label="the example" />
        <p className="text-sm text-slate-400">
          Reference: <a href="/docs/api-reference" className="underline underline-offset-4 hover:text-white">API reference</a> and the{' '}
          <a href="https://www.npmjs.com/package/@hyperdag/trustshell" className="underline underline-offset-4 hover:text-white">package on npm</a>.
        </p>
      </article>

      <article data-testid="install-mcp" className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 min-w-0">
        <h3 className="text-lg font-semibold text-white">3. The MCP server, inside the AI app you already use</h3>
        <p className="text-sm text-slate-300">Paste this block into your app&apos;s MCP settings file and restart the app.</p>
        <ul className="space-y-1 text-sm text-slate-400">
          {AGENT_TABS.map((tab) => (
            <li key={tab.id} className="break-words">
              <span className="font-semibold text-slate-300">{tab.label}:</span> {tab.where}
            </li>
          ))}
        </ul>
        <Copyable text={mcpPaste()} label="the MCP setup" />
      </article>
    </div>
  );
}
