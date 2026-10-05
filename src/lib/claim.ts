/**
 * Sentence check — one label for one sentence, from the same public endpoint the
 * Chrome extension calls (`extension/select.js` → `POST /api/v1/classify`).
 * ------------------------------------------------------------------
 * ONE implementation. `trustshell check "<sentence>"` (src/cli/index.ts) and the
 * MCP `check_claim` tool (src/mcp/index.ts) both call {@link classifyClaim}; neither
 * has its own fetch. So the CLI, the MCP tool and the extension cannot disagree
 * about what a sentence is labelled — they all ask the same endpoint.
 *
 * Contract:
 *   request   POST <base>/api/v1/classify
 *             {"text": "<sentence>", "labels": ["pass","veto","not-checked"]}
 *   response  {"label": "pass"|"veto"|"not-checked", "latency_ms": n}
 *
 * Three outcomes, never two. A network failure, a timeout, a non-200, a body that
 * is not JSON, or a label outside the contract is `not-checked` — NEVER `pass`.
 * "We did not get an answer" must not be readable as "the claim passed".
 *
 * Base URL: `TRUSTSHELL_API_URL` when set (the same override every other CLI/MCP
 * command honours), else the live backend the SDK defaults to.
 */
import { redact } from '../memory/redact';

export const CLAIM_LABELS = ['pass', 'veto', 'not-checked'] as const;
export type ClaimLabel = (typeof CLAIM_LABELS)[number];

/** The SDK's default backend origin (`TrustShell` constructor). Kept identical on purpose. */
export const DEFAULT_API_URL = 'https://repid-engine-production.up.railway.app';
export const CLASSIFY_PATH = '/api/v1/classify';
/** Stop waiting after this. A later answer is not-checked, never a pass. */
export const CLAIM_TIMEOUT_MS = 6000;
/** A label is one short word. A body larger than this is not an answer. */
const MAX_BODY_CHARS = 64 * 1024;

export interface ClaimResult {
  label: ClaimLabel;
  latency_ms: number;
  /**
   * Present ONLY when the label was decided locally (the endpoint gave no usable
   * answer) — says why it is not-checked. Absent when the label is the endpoint's own.
   */
  reason?: string;
  /**
   * Present ONLY when the scrubber removed something (a key, an email, a card number…) before
   * sending. The label is then about the text that was sent, not every character that was typed,
   * and the person should be told so.
   */
  scrubbed?: true;
  /**
   * Which path the endpoint says produced the label (repid-engine POST /api/v1/classify, added
   * 2026-10-05). Present only when the endpoint sent a well-formed one; an older endpoint sends
   * none and nothing is invented. Never present on a not-checked this client decided itself.
   */
  by?: ClaimPath;
  /** Only with by === 'votes': the voters the claim was sent to, as the endpoint named them. */
  voters?: string[];
}

export const CLAIM_PATHS = ['arithmetic', 'votes', 'skipped', 'deadline'] as const;
export type ClaimPath = (typeof CLAIM_PATHS)[number];

/** Provider ids the endpoint may name, shown to people by these names. Unknown ids show as sent. */
const VOTER_NAMES: Record<string, string> = {
  groq: 'Groq',
  cerebras: 'Cerebras',
  'nvidia-nim': 'NVIDIA NIM',
  'workers-ai': 'Cloudflare Workers AI',
};
const VOTER_ID = /^[a-z0-9-]{1,32}$/;
const MAX_VOTERS = 8;

/**
 * The path fields of an endpoint answer, or {} when they are missing or out of contract. PURE.
 * All or nothing: a `votes` without a usable voter list, or a `skipped` / `deadline` that claims a
 * pass or veto, reports no path at all rather than half of one.
 */
export function pathOf(body: unknown, label: ClaimLabel): { by?: ClaimPath; voters?: string[] } {
  if (!body || typeof body !== 'object') return {};
  const { by, voters } = body as { by?: unknown; voters?: unknown };
  if (typeof by !== 'string' || !(CLAIM_PATHS as readonly string[]).includes(by)) return {};
  if ((by === 'skipped' || by === 'deadline') && label !== 'not-checked') return {};
  if (by !== 'votes') return { by: by as ClaimPath };
  if (!Array.isArray(voters) || voters.length === 0 || voters.length > MAX_VOTERS) return {};
  if (!voters.every((v) => typeof v === 'string' && VOTER_ID.test(v))) return {};
  return { by: 'votes', voters: [...(voters as string[])] };
}

function voterPhrase(voters: string[]): { names: string; many: boolean } {
  const names = [...new Set(voters.map((v) => VOTER_NAMES[v] ?? v))];
  if (names.length === 1) {
    return voters.length > 1 ? { names: `Two ${names[0]} models`, many: true } : { names: names[0]!, many: false };
  }
  const last = names[names.length - 1];
  return { names: `${names.slice(0, -1).join(', ')} and ${last}`, many: true };
}

/**
 * One line saying what produced the label, or '' when the endpoint did not say. PURE.
 * The same words as extension/classify.js pathLine (tests/claim-path-parity.test.ts).
 */
export function pathLine(r: Pick<ClaimResult, 'label' | 'by' | 'voters'>): string {
  switch (r.by) {
    case 'arithmetic':
      return 'Decided by exact calculation. No model was asked.';
    case 'skipped':
      return 'No checker was asked.';
    case 'deadline':
      return 'No answer in time.';
    case 'votes': {
      if (!r.voters || r.voters.length === 0) return '';
      const { names, many } = voterPhrase(r.voters);
      const all = !many ? '' : r.voters.length === 2 ? ' both' : ' all';
      if (r.label === 'pass') return `${names}${all} said true.`;
      if (r.label === 'veto') return `${names}${all} said false.`;
      return `Asked ${names}. No agreed answer.`;
    }
    default:
      return '';
  }
}

/** Shown wherever {@link ClaimResult.scrubbed} is set. One sentence, the same on every door. */
export const SCRUBBED_LINE =
  'Removed before sending: text that looked like a key or personal data. The result is about what was sent.';

/** A local fault: the request could not be formed, so nothing was sent. CLI exit 3. */
export class ClaimError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClaimError';
  }
}

export interface ClaimOptions {
  /** Backend origin. Defaults to TRUSTSHELL_API_URL, then {@link DEFAULT_API_URL}. */
  apiUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
  env?: Record<string, string | undefined>;
}

/** Resolve the full classify URL. PURE. Throws {@link ClaimError} on a non-http(s) base. */
export function resolveClassifyUrl(
  apiUrl?: string,
  env: Record<string, string | undefined> = typeof process !== 'undefined' ? process.env : {},
): string {
  const base = (apiUrl?.trim() || env.TRUSTSHELL_API_URL?.trim() || DEFAULT_API_URL).replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(base + CLASSIFY_PATH);
  } catch {
    throw new ClaimError(`backend URL is not a valid URL: ${base}`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new ClaimError(`backend URL must be http or https: ${base}`);
  }
  return parsed.href;
}

/** Only the endpoint's own label decides. Anything outside the contract is not-checked. PURE. */
export function labelOf(body: unknown): ClaimLabel | null {
  if (!body || typeof body !== 'object') return null;
  const raw = (body as { label?: unknown }).label;
  return typeof raw === 'string' && (CLAIM_LABELS as readonly string[]).includes(raw)
    ? (raw as ClaimLabel)
    : null;
}

/**
 * Ask the classify endpoint for one sentence's label. Never resolves to `pass`
 * unless the endpoint itself said `pass`. Throws only {@link ClaimError}, and only
 * before anything is sent (blank sentence, bad base URL).
 */
export async function classifyClaim(text: string, opts: ClaimOptions = {}): Promise<ClaimResult> {
  // Secrets never leave the host — same scrub the MCP verify tool applies.
  const typed = String(text ?? '').trim();
  const sentence = redact(typed).trim();
  const scrubbed = sentence !== typed;
  if (!sentence) {
    throw new ClaimError(
      scrubbed
        ? 'nothing to check: everything in it looked like a key or personal data, and that is never sent'
        : 'nothing to check: the sentence is empty',
    );
  }
  const mark = (r: ClaimResult): ClaimResult => (scrubbed ? { ...r, scrubbed: true } : r);
  const url = resolveClassifyUrl(opts.apiUrl, opts.env);

  const fetchImpl = opts.fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined);
  const now = opts.now ?? Date.now;
  const start = now();
  const elapsed = () => Math.max(0, Math.round(now() - start));
  const notChecked = (reason: string): ClaimResult =>
    mark({
      label: 'not-checked',
      latency_ms: elapsed(),
      reason,
    });
  if (typeof fetchImpl !== 'function') return notChecked('no fetch available in this runtime');

  const timeoutMs = Number.isFinite(opts.timeoutMs) ? (opts.timeoutMs as number) : CLAIM_TIMEOUT_MS;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve('timeout');
    }, timeoutMs);
  });

  try {
    const call = (async (): Promise<ClaimResult> => {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sentence, labels: [...CLAIM_LABELS] }),
        signal: controller.signal,
        redirect: 'error',
      });
      if (!res || res.status !== 200) return notChecked(`endpoint answered HTTP ${res ? res.status : 'nothing'}`);
      const raw = await res.text();
      if (typeof raw !== 'string' || raw.trim() === '') return notChecked('endpoint returned an empty body');
      if (raw.length > MAX_BODY_CHARS) return notChecked('endpoint body is too large to be a label');
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        return notChecked('endpoint body is not JSON');
      }
      const label = labelOf(body);
      if (!label) return notChecked('endpoint label is outside the contract (pass | veto | not-checked)');
      const reported = (body as { latency_ms?: unknown }).latency_ms;
      const latency_ms = typeof reported === 'number' && Number.isFinite(reported) ? reported : elapsed();
      return mark({ label, latency_ms, ...pathOf(body, label) });
    })();
    const out = await Promise.race([call, timedOut]);
    if (out === 'timeout') {
      call.catch(() => {}); // the aborted fetch rejects later; nobody is waiting for it
      return notChecked(`no answer within ${timeoutMs} ms`);
    }
    return out;
  } catch (e: any) {
    return notChecked(`network error: ${e?.message ?? String(e)}`);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Exit code for a label. PURE. NOT_CHECKED never shares a code with success. */
export const CLAIM_EXIT = { pass: 0, veto: 1, 'not-checked': 2, error: 3 } as const;

export function claimExitCode(label: ClaimLabel): number {
  return CLAIM_EXIT[label];
}

/** One-line human explanation printed under the label. PURE. */
export function explainClaim(r: ClaimResult): string {
  if (r.label === 'pass') return `The classifier labelled this sentence pass (${r.latency_ms} ms).`;
  if (r.label === 'veto') return `The classifier labelled this sentence veto — do not rely on it (${r.latency_ms} ms).`;
  return r.reason
    ? `Not checked: ${r.reason}. This is not a pass.`
    : `The classifier answered not-checked: it could not decide this sentence (${r.latency_ms} ms). This is not a pass.`;
}

/**
 * Is a `check` operand a URL (the GitHub run check) rather than a sentence? PURE.
 * Deliberately broad: anything with a scheme, or a bare github.com/www. prefix, goes to
 * the GitHub path — so a mistyped run URL gets the old usage error instead of being
 * sent to the classifier as a "sentence".
 */
export function isUrlOperand(operand: string): boolean {
  const s = String(operand ?? '').trim();
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /^(?:www\.)?github\.com\//i.test(s);
}
