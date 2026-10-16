/**
 * Which backend origin TrustShell talks to, and whether it may (SEC F10, security run 2026-10-16).
 *
 * `TRUSTSHELL_API_URL` (or an SDK `apiUrl`) used to take any URL. Pointed at `http://` on another
 * machine, every claim, agent id and the `REPID_API_KEY` bearer token crossed the network in clear
 * text, with no sign anything was unusual. Now:
 * - an override must be https; plain http is allowed only for this machine (localhost, 127.0.0.1, [::1]);
 * - REPID_API_KEY is sent only to an https origin, never to plain http, not even on this machine;
 * - any origin other than the default prints one loud line on stderr, once per origin per process.
 */
export const DEFAULT_API_URL = 'https://repid-engine-production.up.railway.app';

const THIS_MACHINE = new Set(['localhost', '127.0.0.1', '[::1]']);

export class ApiUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiUrlError';
  }
}

/** Why this backend origin is refused, or null when it is allowed. PURE. */
export function apiUrlRefusal(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return `TRUSTSHELL_API_URL is not a valid URL: ${raw}`;
  }
  if (u.protocol === 'https:') return null;
  if (u.protocol === 'http:' && THIS_MACHINE.has(u.hostname)) return null;
  return `TRUSTSHELL_API_URL must be https (plain http only for localhost), so nothing was sent to ${u.protocol}//${u.host}`;
}

/** True only for an https URL: the one kind of origin REPID_API_KEY may be sent to. PURE. */
export function isHttps(raw: string): boolean {
  try {
    return new URL(raw).protocol === 'https:';
  } catch {
    return false;
  }
}

const warned = new Set<string>();

/** One loud stderr line per non-default origin per process: whatever is sent goes to that host. */
function warnIfNotDefault(base: string): void {
  const origin = new URL(base).origin;
  if (origin === DEFAULT_API_URL || warned.has(origin)) return;
  warned.add(origin);
  if (typeof process !== 'undefined' && process.stderr && typeof process.stderr.write === 'function') {
    process.stderr.write(
      `WARNING: TrustShell is using the backend ${origin}, not the default ${DEFAULT_API_URL}. ` +
        'Everything TrustShell sends goes to that host.\n',
    );
  }
}

/**
 * The backend base URL: `explicit`, else TRUSTSHELL_API_URL, else the default. Trailing slashes are
 * dropped with a linear scan (a `/\/+$/` regex is polynomial on caller input: CodeQL js/polynomial-redos).
 * Throws {@link ApiUrlError} for an origin {@link apiUrlRefusal} refuses, BEFORE anything is sent.
 */
export function resolveApiBase(
  explicit?: string,
  env: Record<string, string | undefined> = typeof process !== 'undefined' ? process.env : {},
): string {
  let base = explicit?.trim() || env.TRUSTSHELL_API_URL?.trim() || DEFAULT_API_URL;
  let end = base.length;
  while (end > 0 && base.charCodeAt(end - 1) === 47 /* '/' */) end -= 1;
  base = base.slice(0, end);
  const refused = apiUrlRefusal(base);
  if (refused) throw new ApiUrlError(refused);
  warnIfNotDefault(base);
  return base;
}

/**
 * {@link resolveApiBase} for callers that answer NOT_CHECKED instead of throwing: null for a refused
 * origin, and the refusal said once on stderr so a NOT_CHECKED is never left unexplained.
 */
export function apiBaseOrNull(
  explicit?: string,
  env: Record<string, string | undefined> = typeof process !== 'undefined' ? process.env : {},
): string | null {
  try {
    return resolveApiBase(explicit, env);
  } catch (e) {
    if (!(e instanceof ApiUrlError)) throw e;
    if (!warned.has(e.message) && typeof process !== 'undefined' && process.stderr && typeof process.stderr.write === 'function') {
      warned.add(e.message);
      process.stderr.write(`REFUSED: ${e.message}\n`);
    }
    return null;
  }
}
