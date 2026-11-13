/**
 * What the guided walkthrough shows, in one place: the commands, the saved runs and what each verdict word means.
 *
 * THE COMMANDS ARE RUN, NOT WRITTEN FROM MEMORY. Each string here was executed against the published package in
 * an empty folder with no keys before it went on the page. If one stops working, fix the page.
 *
 * This file holds no logic the page's first load has to pay for. The checker itself is in lib/first-run-check.ts.
 */

export const RELEASE = '1.9.2';
const PACKAGE = `@hyperdag/trustshell@${RELEASE}`;
export const LAUNCHER = `npx -y ${PACKAGE}`;

export type RunId = 'failed' | 'passed';

export const RUNS: Record<RunId, { id: string; url: string; file: string; label: string }> = {
  failed: { id: '42502305639', url: 'https://github.com/DealAppSeo/trustshell/actions/runs/42502305639', file: '/examples/run-failed-record.json', label: 'The run that failed' },
  passed: { id: '39619591025', url: 'https://github.com/DealAppSeo/trustshell/actions/runs/39619591025', file: '/examples/run-passed-record.json', label: 'The run that passed' },
};

export const SENTENCES: { run: RunId; text: string }[] = [
  { run: 'failed', text: 'The check workflow succeeded, run 42502305639.' },
  { run: 'passed', text: 'The check workflow succeeded, run 39619591025.' },
  { run: 'passed', text: 'All tests pass.' },
];

export const COMMANDS = {
  tryCheck: `${LAUNCHER} check ${RUNS.failed.url} --claims "The check workflow succeeded, run ${RUNS.failed.id}." --out evidence`,
  makeReport: `${LAUNCHER} trust-report --out report --record evidence/record.json`,
  verifyReportNpx: `${LAUNCHER} trust-report verify report --root 0x<key>`,
  demo: `${LAUNCHER} demo`,
  verifyReport: 'trustshell trust-report verify report --root 0x<key>',
} as const;

const MCP_ARGS = ['-y', '-p', PACKAGE, 'trustshell-mcp'];
const mcpConfig = (command: string, args: string[]) => JSON.stringify({ mcpServers: { trustshell: { command, args } } }, null, 2);
export const MCP_CONFIG = mcpConfig('npx', MCP_ARGS);
/** A client that starts `npx` with no shell gets ENOENT on Windows: npx is npx.cmd there. Measured on 1.9.1. */
export const MCP_CONFIG_WINDOWS = mcpConfig('cmd', ['/c', 'npx', ...MCP_ARGS]);

/** Real output from 1.9.2, trimmed to the lines that decide. Re-record it rather than edit it. */
export const EXAMPLE_RECORDED = 'Example: real output from @hyperdag/trustshell 1.9.2, recorded 12 Nov 2026 UTC, trimmed.';

export const EXAMPLE_CHECK = `### Claims: 1 supported · 1 contradicted · 0 not checked

- **CONTRADICTED** \`The check workflow succeeded\`
  - **Why** run 42502305639 (attempt 1, commit f569e43ec807) finished with conclusion "failure", not "success".
- **SUPPORTED** \`run 42502305639\`
  - **Why** The cited run is the inspected run, 42502305639.

exit 1`;

export const EXAMPLE_DEMO = `trustshell demo — the offline receipt loop, start to finish:

  1. SEALED a sample receipt with this install's own key (provenance: owner-self-signed).
  2. VERIFIED it here, offline, under that key:

  There is no single verdict. Six separate claims, each with its own gaps:
  Integrity      VERIFIED       The record is whole: its hash matches its contents, and a trusted key sealed it.
  Authenticity   NOT_CHECKED    The action was authorized by the agent’s accountable owner.
  Observation    NOT_CHECKED    An outcome was observed (e.g. a payment settling on chain).
  Correctness    NOT_CHECKED    The content was verified against its source.
  Authorization  NOT_CHECKED    The kernel permitted this action under the policy it was given.
  Containment    NOT_CHECKED    The tool ran only under an ALLOW decision.

exit 0`;

export const STATUS_WORDS = ['SUPPORTED', 'CONTRADICTED', 'NOT_CHECKED', 'COMMAND_PASSED'] as const;

export const STATUS_MEANING: Record<(typeof STATUS_WORDS)[number], string> = {
  SUPPORTED: 'The record matches this exact statement, and nothing wider. A run that succeeded supports “this run succeeded”, and does not show the code is correct.',
  CONTRADICTED: 'The record says otherwise. The reason beside it names what was compared.',
  NOT_CHECKED: 'Nothing could be compared, so this is neither a pass nor a failure. It is never a pass.',
  COMMAND_PASSED: 'A command you paired with this claim exited 0. That is all it shows: a test run that selected nothing also exits 0.',
};

export const EXIT_MEANING: Record<number, string> = {
  0: 'Every claim was supported, on a finished run that passed.',
  1: 'A claim was contradicted, or the run itself failed.',
  3: 'Something was not checked, and that is never a pass.',
};
