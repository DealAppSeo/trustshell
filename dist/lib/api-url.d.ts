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
export declare const DEFAULT_API_URL = "https://repid-engine-production.up.railway.app";
export declare class ApiUrlError extends Error {
    constructor(message: string);
}
/** Why this backend origin is refused, or null when it is allowed. PURE. */
export declare function apiUrlRefusal(raw: string): string | null;
/** True only for an https URL: the one kind of origin REPID_API_KEY may be sent to. PURE. */
export declare function isHttps(raw: string): boolean;
/**
 * The backend base URL: `explicit`, else TRUSTSHELL_API_URL, else the default. Trailing slashes are
 * dropped with a linear scan (a `/\/+$/` regex is polynomial on caller input: CodeQL js/polynomial-redos).
 * Throws {@link ApiUrlError} for an origin {@link apiUrlRefusal} refuses, BEFORE anything is sent.
 */
export declare function resolveApiBase(explicit?: string, env?: Record<string, string | undefined>): string;
/**
 * {@link resolveApiBase} for callers that answer NOT_CHECKED instead of throwing: null for a refused
 * origin, and the refusal said once on stderr so a NOT_CHECKED is never left unexplained.
 */
export declare function apiBaseOrNull(explicit?: string, env?: Record<string, string | undefined>): string | null;
