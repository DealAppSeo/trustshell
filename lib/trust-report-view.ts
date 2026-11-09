/**
 * What the guided page needs from a Trust Report (`trustshell trust-report`, report.json). PURE and browser-safe:
 * the page reads a file the visitor picks, in the browser, and nothing here sends it anywhere. Reading a report
 * here does NOT verify it: `trustshell trust-report verify` does that, and the page says so.
 */
export const TRUST_REPORT_SCHEMA = 'dev.trustshell.trust-report/0.1-draft';
export const MAX_REPORT_BYTES = 8 * 1024 * 1024;

export interface ClaimView {
  status: string;
  claim: string;
  scope: string;
}
export interface InspectView {
  run_url: string;
  repo: string;
  run_id: number;
  verdict: string;
  conclusion: string | null;
  fetched_at: string;
  claims: ClaimView[];
}
export interface CommandView {
  seq: number;
  action: string;
  decision: string;
  reasons: string[];
  result: string;
}
export interface BoundView {
  claim: string;
  decided_by: string;
  status: string;
  why: string;
}
export interface ReportView {
  schema: string;
  title: string;
  generated_at: string;
  generator: string;
  inspect: InspectView[];
  bound_claims: BoundView[];
  guard: { ledger: { verdict: string; count: number }; commands: CommandView[]; mediated: string[]; not_mediated: string[] };
  next_actions: string[];
}

export type ParsedReport = { ok: true; report: ReportView } | { ok: false; why: string };

const isList = (v: unknown): v is unknown[] => Array.isArray(v);

/** Accepts only the shape this page can show in full, so a partial file is an error rather than a thin report. */
export function parseTrustReport(text: string): ParsedReport {
  let value: unknown;
  try {
    value = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch {
    return { ok: false, why: 'That file is not JSON. Choose the report.json from your report folder.' };
  }
  const r = value as Partial<ReportView> | null;
  if (!r || typeof r !== 'object' || r.schema !== TRUST_REPORT_SCHEMA) {
    return { ok: false, why: 'That JSON is not a Trust Report. Choose the report.json that trustshell trust-report wrote.' };
  }
  const guard = r.guard;
  if (typeof r.title !== 'string' || !isList(r.inspect) || !isList(r.bound_claims) || !isList(r.next_actions) || !guard || !isList(guard.commands) || !isList(guard.not_mediated) || !isList(guard.mediated) || !guard.ledger) {
    return { ok: false, why: 'That Trust Report is incomplete, so it cannot be shown. Make it again with trustshell trust-report.' };
  }
  return { ok: true, report: r as ReportView };
}

const RUN_URL = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/[0-9]+(?:\/attempts\/[0-9]+)?\/?$/;

export const isRunUrl = (s: string): boolean => RUN_URL.test(s.trim());

/**
 * Text that means the same inside double quotes in bash, zsh and PowerShell. Anything else belongs in a file.
 * `!` is history expansion in an interactive bash or zsh; PowerShell closes a double-quoted string on a curly double quote.
 */
export const isShellSafe = (s: string): boolean => s.length > 0 && !/["“”„!`$\\\r\n]/.test(s);

export function inspectCommand(url: string, claim: string): string {
  return `npx @hyperdag/trustshell@latest check ${url.trim()} --claims "${claim.trim()}" --out evidence`;
}

/** The same commands as examples/own-agent/README.md, which an automated test holds this list to. */
export const PATH_TWO_COMMANDS = [
  'trustshell guard init',
  'trustshell guard allow tool:node --script test.js',
  "trustshell run --tool node '--' node test.js",
  'trustshell trust-report --out report --bind "test.js=All tests pass"',
] as const;
