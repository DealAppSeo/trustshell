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
  /**
   * Only with by === 'votes': the two voters whose answers made the label (repid-engine, added with
   * its checker pool on 2026-10-05). When a checker gives no answer and another stands in, `voters`
   * names both and this names the one that answered, so "X and Y both said false" stays true.
   */
  deciders?: string[];
  /**
   * One clarifying question, present ONLY when the endpoint asked one (repid-engine
   * CLASSIFY_QUESTIONS): a not-checked from the votes, where both voters were unsure and one fact
   * would let them decide. It comes from the API or it does not appear; nothing here invents one.
   */
  question?: string;
  /**
   * Only with `deciders`: what each of the two said, in the same order (repid-engine `votes`, added
   * 2026-10-06). Before this, a disagreement read "No agreed answer" and never said who said what.
   * An endpoint that does not send it gets none; nothing here works it out from the label.
   */
  votes?: ClaimVote[];
}

/** One decider's own word, as the endpoint sent it. `family` is the model family, e.g. "qwen". */
export interface ClaimVote {
  voter: string;
  family: string;
  verdict: ClaimVerdict;
}
export const CLAIM_VERDICTS = ['TRUE', 'FALSE', 'UNSURE', 'NONE'] as const;
export type ClaimVerdict = (typeof CLAIM_VERDICTS)[number];

const QUESTION_MIN = 10;
const QUESTION_MAX = 160;
/** Defence in depth: the server already parses strictly; this client refuses the same shapes. */
const QUESTION_REFUSED = /[@<>[\]`*_#~|\\]|https?:|www\.|\b[a-z0-9-]+\.(com|org|net|io|dev|ai|app|co)\b/i;

/** The question, or undefined when absent, malformed, or attached to anything but a votes not-checked. PURE. */
export function questionOf(body: unknown, label: ClaimLabel, by: ClaimPath | undefined): string | undefined {
  if (label !== 'not-checked' || by !== 'votes') return undefined;
  if (!body || typeof body !== 'object') return undefined;
  const raw = (body as { question?: unknown }).question;
  if (typeof raw !== 'string') return undefined;
  const q = raw.normalize('NFKC').trim();
  if (q.length < QUESTION_MIN || q.length > QUESTION_MAX || !q.endsWith('?')) return undefined;
  if (/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(q) || QUESTION_REFUSED.test(q)) return undefined;
  // An HTML character reference (&lt;, &#60;, &#x3c;) is markup written past the character check.
  if (/&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i.test(q)) return undefined;
  return q;
}

/** The longest answer a person may give to the one question. */
export const ANSWER_MAX_CHARS = 200;

/**
 * The sentence to check again once the person answers: the claim, then their answer as the
 * assumption the checkers lacked. PURE. Throws ClaimError on an empty answer: nothing is sent.
 */
export function withAnswer(claim: string, answer: string): string {
  const a = String(answer ?? '').trim().slice(0, ANSWER_MAX_CHARS);
  if (!a) throw new ClaimError('nothing to add: the answer is empty');
  const c = String(claim ?? '').trim().replace(/[.!?]*$/, '');
  return `${c}. Assume: ${a.replace(/[.!?]*$/, '')}.`;
}

export const CLAIM_PATHS = ['arithmetic', 'votes', 'skipped', 'deadline'] as const;
export type ClaimPath = (typeof CLAIM_PATHS)[number];

/** Provider ids the endpoint may name, shown to people by these names. Unknown ids show as sent. */
const VOTER_NAMES: Record<string, string> = {
  groq: 'Groq',
  cerebras: 'Cerebras',
  'nvidia-nim': 'NVIDIA NIM',
  'workers-ai': 'Cloudflare Workers AI',
  openrouter: 'OpenRouter',
  zai: 'Z.ai',
  mistral: 'Mistral',
  together: 'Together',
  fireworks: 'Fireworks',
};
const VOTER_ID = /^[a-z0-9-]{1,32}$/;
const MAX_VOTERS = 8;

/**
 * The path fields of an endpoint answer, or {} when they are missing or out of contract. PURE.
 * All or nothing: a `votes` without a usable voter list, or a `skipped` / `deadline` that claims a
 * pass or veto, reports no path at all rather than half of one.
 */
export function pathOf(body: unknown, label: ClaimLabel): { by?: ClaimPath; voters?: string[]; deciders?: string[] } {
  if (!body || typeof body !== 'object') return {};
  const { by, voters, deciders } = body as { by?: unknown; voters?: unknown; deciders?: unknown };
  if (typeof by !== 'string' || !(CLAIM_PATHS as readonly string[]).includes(by)) return {};
  if ((by === 'skipped' || by === 'deadline') && label !== 'not-checked') return {};
  if (by !== 'votes') return { by: by as ClaimPath };
  if (!Array.isArray(voters) || voters.length === 0 || voters.length > MAX_VOTERS) return {};
  if (!voters.every((v) => typeof v === 'string' && VOTER_ID.test(v))) return {};
  const out: { by: 'votes'; voters: string[]; deciders?: string[] } = { by: 'votes', voters: [...(voters as string[])] };
  // Exactly two, each one the claim was sent to; anything else is ignored, never half-used.
  if (
    Array.isArray(deciders) &&
    deciders.length === 2 &&
    deciders.every((d) => typeof d === 'string' && (voters as string[]).includes(d))
  ) {
    out.deciders = [...(deciders as string[])];
  }
  return out;
}

function voterPhrase(voters: string[]): { names: string; many: boolean } {
  const names = [...new Set(voters.map((v) => VOTER_NAMES[v] ?? v))];
  if (names.length === 1) {
    return voters.length > 1 ? { names: `Two ${names[0]} models`, many: true } : { names: names[0]!, many: false };
  }
  const last = names[names.length - 1];
  return { names: `${names.slice(0, -1).join(', ')} and ${last}`, many: true };
}

/** The people-facing names of these voters, joined: "Groq and Cerebras". PURE. */
export function voterNames(voters: string[]): string {
  return voterPhrase(voters).names;
}

/**
 * One line saying what produced the label, or '' when the endpoint did not say. PURE.
 * The same words as extension/classify.js pathLine (tests/claim-path-parity.test.ts).
 */
export function pathLine(r: Pick<ClaimResult, 'label' | 'by' | 'voters' | 'deciders'>): string {
  switch (r.by) {
    case 'arithmetic':
      return 'Decided by exact calculation. No model was asked.';
    case 'skipped':
      return 'No checker was asked.';
    case 'deadline':
      return 'No answer in time.';
    case 'votes': {
      // Who answered, when the endpoint says; else everyone it was sent to (an older endpoint).
      const who = r.deciders ?? r.voters;
      if (!who || who.length === 0) return '';
      const { names, many } = voterPhrase(who);
      const all = !many ? '' : who.length === 2 ? ' both' : ' all';
      if (r.label === 'pass') return `${names}${all} said true.`;
      if (r.label === 'veto') return `${names}${all} said false.`;
      // Mid-sentence, so "Two Groq models" is lower-cased: "Asked two Groq models."
      return `Asked ${names.replace(/^Two /, 'two ')}. No agreed answer.`;
    }
    default:
      return '';
  }
}

const FAMILY_ID = /^[a-z0-9][a-z0-9.-]{0,31}$/;

/**
 * Each decider's own word, or undefined. PURE. All or nothing, like pathOf: exactly two, one per
 * decider and in the same order, each with a family id and a known verdict, and agreeing with the
 * label: a pass is TRUE and TRUE, a veto is FALSE and FALSE, and a not-checked is anything else.
 * Two of one model family can never pass or veto (repid-engine S47, 2026-10-06: two families or Not
 * checked), so their agreement fits only a not-checked.
 * Votes that contradict the label are the answer saying two things, so neither is shown and the
 * label keeps its old line. The label itself is never changed here.
 */
export function votesOf(body: unknown, label: ClaimLabel, deciders: string[] | undefined): ClaimVote[] | undefined {
  if (!body || typeof body !== 'object' || !deciders || deciders.length !== 2) return undefined;
  const raw = (body as { votes?: unknown }).votes;
  if (!Array.isArray(raw) || raw.length !== 2) return undefined;
  const out: ClaimVote[] = [];
  for (let i = 0; i < 2; i++) {
    const v = raw[i] as { voter?: unknown; family?: unknown; verdict?: unknown } | null;
    if (!v || typeof v !== 'object') return undefined;
    if (v.voter !== deciders[i]) return undefined;
    if (typeof v.family !== 'string' || !FAMILY_ID.test(v.family)) return undefined;
    if (typeof v.verdict !== 'string' || !(CLAIM_VERDICTS as readonly string[]).includes(v.verdict)) return undefined;
    out.push({ voter: v.voter as string, family: v.family, verdict: v.verdict as ClaimVerdict });
  }
  const both = (w: ClaimVerdict) => out[0]!.verdict === w && out[1]!.verdict === w;
  const oneFamily = out[0]!.family === out[1]!.family;
  const fits =
    label === 'pass' ? both('TRUE') && !oneFamily
    : label === 'veto' ? both('FALSE') && !oneFamily
    : oneFamily || (!both('TRUE') && !both('FALSE'));
  return fits ? out : undefined;
}

const VERDICT_WORDS: Record<ClaimVerdict, string> = {
  TRUE: 'said true',
  FALSE: 'said false',
  UNSURE: 'was not sure',
  NONE: 'gave no answer',
};

/**
 * Who said what: "Groq said false. Cerebras said false." PURE. '' when there are no votes, so a
 * caller falls back to {@link pathLine}. When one host ran both checkers, the model family tells
 * them apart. A flat true against a flat false is said out loud, because that is the one case where
 * the two answers cannot both stand. Two of one family that agree are said out loud too: that is one
 * opinion said twice, which is why the stamp is Not checked.
 */
export function votesLine(votes: readonly ClaimVote[] | undefined): string {
  if (!votes || votes.length !== 2) return '';
  const names = votes.map((v) => VOTER_NAMES[v.voter] ?? v.voter);
  const sameHost = names[0] === names[1];
  const said = votes.map((v, i) => `${names[i]}${sameHost ? ` (${v.family})` : ''} ${VERDICT_WORDS[v.verdict]}.`).join(' ');
  const [a, b] = [votes[0]!.verdict, votes[1]!.verdict];
  const split = (a === 'TRUE' && b === 'FALSE') || (a === 'FALSE' && b === 'TRUE');
  if (split) return `${said} They disagree, and both cannot be right.`;
  const echo = votes[0]!.family === votes[1]!.family && a === b && (a === 'TRUE' || a === 'FALSE');
  return echo ? `${said} Both are one model family (${votes[0]!.family}), so that is one opinion, not two.` : said;
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
      const path = pathOf(body, label);
      // A `by` this server never sends ({"label":"pass","by":"skipped"}) means the answer is not
      // the server's, so its label decides nothing (XC1, night bus #449). No `by` at all is an
      // older endpoint and keeps its label.
      if ((body as { by?: unknown }).by !== undefined && path.by === undefined) {
        return notChecked('endpoint said what produced the label, out of contract (by / voters)');
      }
      const question = questionOf(body, label, path.by);
      const votes = votesOf(body, label, path.deciders);
      return mark({ label, latency_ms, ...path, ...(question ? { question } : {}), ...(votes ? { votes } : {}) });
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
