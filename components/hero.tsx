import CheckForm from '@/app/check/CheckForm';
import { HOME_SAMPLES, SPEED_TRAP } from '@/lib/home-samples';

/**
 * The home page IS /check moved up: the same form, the same three answers, the same privacy line
 * above the button. Not a second form — CheckForm with a prefill and the samples.
 *
 * The samples (lib/home-samples.ts) are traps people actually fall into, each measured against
 * production before it went on this page. They are text for the box, nothing more: prefilling
 * sends nothing and neither does swapping. A request happens only when the visitor clicks Check,
 * so a crawler or a page load never spends the shared checker budget.
 */
// npm 1.6.0 ships `trustshell check "<sentence>"`: exit 0 checks out, 1 caught, 2 not checked.
const TERMINAL_COMMAND = `npx @hyperdag/trustshell check "${SPEED_TRAP}"`;

// A global install of 1.6.0 puts `trustshell-mcp` on PATH, which is what this config runs.
const INSTALL = 'npm i -g @hyperdag/trustshell@1.6.0';
const MCP_PASTE = `{ "mcpServers": { "trustshell": { "command": "trustshell-mcp" } } }`;

const CODE =
  'max-w-full overflow-x-auto rounded-xl border border-slate-800 bg-slate-900 p-4 font-mono text-xs sm:text-sm text-indigo-200 whitespace-pre-wrap break-words';

export function Hero() {
  return (
    <section className="relative px-4 sm:px-6 py-20 md:py-28 bg-slate-950 text-white overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.05)_0%,transparent_70%)] pointer-events-none" />

      <div className="absolute top-6 left-4 sm:left-6 flex items-center gap-2">
        <span className="text-xl font-bold tracking-tight text-white flex items-center gap-1.5">
          <span className="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center text-xs">⚡</span>
          TrustShell
        </span>
      </div>

      <div className="max-w-3xl w-full min-w-0 mx-auto space-y-10 relative z-10">
        <div className="text-center space-y-4">
          <h1 className="max-w-full text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-white text-wrap leading-tight">
            Every answer gets checks you can see.
          </h1>
          <p className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-indigo-300 text-wrap" data-testid="hero-act">
            Act when they pass.
          </p>
          <p className="max-w-xl mx-auto pt-2 text-base sm:text-lg text-slate-300 text-wrap">
            Paste something an AI told you. See if it checks out.
          </p>
          <p className="max-w-xl mx-auto text-sm sm:text-base text-slate-400 text-wrap">
            No signup. No wallet. Leave whenever you want.
          </p>
        </div>

        <div className="max-w-xl w-full min-w-0 mx-auto rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6 text-left">
          <CheckForm initialText={SPEED_TRAP} samples={HOME_SAMPLES} />
        </div>

        {/* Two quiet next steps. Headings and code, no buttons: nothing here competes with Check. */}
        <div className="max-w-xl w-full min-w-0 mx-auto text-left space-y-8 text-sm text-slate-300">
          <section aria-labelledby="next-terminal" data-step="terminal" className="space-y-2">
            <h2 id="next-terminal" className="text-base font-semibold text-white">
              Use it in your terminal
            </h2>
            <pre className={CODE}>
              <code>{TERMINAL_COMMAND}</code>
            </pre>
            <p className="text-slate-400">
              Exits 0 when it checks out, 1 when caught, 2 when not checked.{' '}
              <a href="/devs" className="underline underline-offset-4 hover:text-white">
                What is a terminal?
              </a>
            </p>
          </section>

          <section aria-labelledby="next-agent" data-step="agent" className="space-y-2">
            <h2 id="next-agent" className="text-base font-semibold text-white">
              Add it to your agent
            </h2>
            <p className="text-slate-400">For Claude Desktop and Cursor.</p>
            <ol className="list-decimal pl-5 space-y-3 marker:text-slate-500">
              <li className="space-y-2">
                <p>Install it. This gives you the <code className="font-mono text-indigo-200">trustshell-mcp</code> command.</p>
                <pre className={CODE}>
                  <code>{INSTALL}</code>
                </pre>
              </li>
              <li className="space-y-2">
                <p>Paste this into the app&apos;s MCP config.</p>
                <pre className={CODE}>
                  <code>{MCP_PASTE}</code>
                </pre>
              </li>
              <li>
                <p>Restart the app.</p>
              </li>
            </ol>
            <p className="text-slate-400" data-testid="not-yet">ChatGPT and Grok: not yet.</p>
          </section>
        </div>
      </div>
    </section>
  );
}
