/**
 * The zero-account try-door: paste a public GitHub Actions run URL and one claim, get one verdict.
 *
 * The verdict comes from `inspectRunClaims` (src/lib/action-evidence.ts), the same code `trustshell check <run> --claims`
 * runs. It reads api.github.com, unauthenticated (any GITHUB_TOKEN in the server's env is NOT passed on), and
 * never calls an LLM. The statuses are the ones that module emits: SUPPORTED, CONTRADICTED, NOT_CHECKED.
 *
 * Anything that is not a clean answer is NOT_CHECKED with a reason: an unsupported URL, an empty claim, GitHub
 * rate-limiting this server, a network error. There is no code path here that turns a failure into SUPPORTED.
 *
 * "Verify receipt" does not ask us to repeat ourselves. It (1) recomputes the RFC 8785 digest of the record that
 * was shown and compares it with the digest shown (detects an edited record), and (2) fetches the run from
 * GitHub AGAIN and compares the fields the verdict rests on. A match is "GitHub still says the same thing",
 * not proof that GitHub is right (the record's own does_not_prove says so).
 */
import { CheckError, parseRun } from '../src/lib/check';
import {
  digestRecord,
  inspectRunClaims,
  type ActionEvidenceRecord,
  type ClaimEntry,
  type RecordDigest,
} from '../src/lib/action-evidence';

export type Verdict = 'SUPPORTED' | 'CONTRADICTED' | 'NOT_CHECKED';

import { defaultClaim, MAX_CLAIM_CHARS } from './try-samples';
export { MAX_CLAIM_CHARS };

export interface TryResult {
  verdict: Verdict;
  /** One line a visitor can read: what was compared, or why nothing was. */
  evidence: string;
  /** When the evidence was read, ISO 8601. For a failure, when the attempt was made. */
  timestamp: string;
  /** Present only when a record was built. */
  record?: ActionEvidenceRecord;
  digest?: RecordDigest;
}

export interface Deps {
  inspect?: typeof inspectRunClaims;
  now?: () => Date;
}

/** Never hand the server's own token to the check: the door promises "no account, no key", and a token changes what is readable. */
const NO_TOKEN_ENV: Record<string, string | undefined> = {};

function notChecked(reason: string, now: () => Date): TryResult {
  return { verdict: 'NOT_CHECKED', evidence: reason, timestamp: now().toISOString() };
}

/** One verdict for the claim line. Only an entry that is SUPPORTED on its own can make this SUPPORTED. */
export function verdictOf(claims: readonly ClaimEntry[]): Verdict {
  if (claims.length === 0) return 'NOT_CHECKED';
  if (claims.some((c) => c.status === 'CONTRADICTED')) return 'CONTRADICTED';
  if (claims.every((c) => c.status === 'SUPPORTED')) return 'SUPPORTED';
  return 'NOT_CHECKED';
}

function evidenceLine(record: ActionEvidenceRecord, verdict: Verdict): string {
  const claim = record.claims.find((c) => c.status === verdict) ?? record.claims[0];
  if (!claim) return 'No claim in the text was one this check can read.';
  return claim.reason;
}

/**
 * The reason shown to an anonymous caller. CheckError messages are written for a reader, with one exception:
 * "GitHub <status>: <message>" carries GitHub's own response text, and its rate-limit message names this
 * server's egress IP. Keep the status, drop what upstream supplied. Anything else is not shown at all.
 */
export function publicWhy(e: unknown, fallback: string): string {
  if (!(e instanceof CheckError)) return fallback;
  return e.message.replace(/^(GitHub \d{3}):[\s\S]*$/, '$1');
}

export async function tryRun(urlIn: unknown, claimIn: unknown, deps: Deps = {}): Promise<TryResult> {
  const now = deps.now ?? (() => new Date());
  const url = typeof urlIn === 'string' ? urlIn.trim() : '';
  const parsed = parseRun(url);
  if (!parsed) {
    return notChecked('Not a GitHub Actions run URL. This door reads https://github.com/<owner>/<repo>/actions/runs/<number>, nothing else.', now);
  }
  const claim = typeof claimIn === 'string' && claimIn.trim() ? claimIn.trim() : defaultClaim(parsed.runId);
  if (claim.length > MAX_CLAIM_CHARS) {
    return notChecked(`The claim is longer than ${MAX_CLAIM_CHARS} characters. Nothing was checked.`, now);
  }
  try {
    const { record, digest } = await (deps.inspect ?? inspectRunClaims)(url, claim, { env: NO_TOKEN_ENV, now });
    const verdict = verdictOf(record.claims);
    return { verdict, evidence: evidenceLine(record, verdict), timestamp: record.observation.fetchedAt, record, digest };
  } catch (e) {
    const why = publicWhy(e, 'the check service could not complete the request');
    return notChecked(`Could not read the run: ${why}.`, now);
  }
}

export type VerifyOutcome = 'MATCH' | 'MISMATCH' | 'NOT_CHECKED';

export interface VerifyResult {
  outcome: VerifyOutcome;
  lines: string[];
  timestamp: string;
}

const RUN_FIELDS = ['run_id', 'run_attempt', 'head_sha', 'status', 'conclusion'] as const;

function isRecord(x: unknown): x is ActionEvidenceRecord {
  const r = x as ActionEvidenceRecord | null;
  return !!r && typeof r === 'object' && !!r.observation && typeof r.observation === 'object' && Array.isArray(r.claims);
}

/** Independent check of a receipt: its digest, then GitHub again. Never throws; never returns MATCH on a failure. */
export async function verifyReceipt(recordIn: unknown, digestIn: unknown, deps: Deps = {}): Promise<VerifyResult> {
  const now = deps.now ?? (() => new Date());
  const stamp = () => now().toISOString();
  if (!isRecord(recordIn) || typeof (digestIn as RecordDigest | null)?.value !== 'string') {
    return { outcome: 'NOT_CHECKED', lines: ['Not checked: this is not a receipt from this page.'], timestamp: stamp() };
  }
  const lines: string[] = [];
  try {
    const recomputed = digestRecord(recordIn).value;
    const digestOk = recomputed === (digestIn as RecordDigest).value;
    lines.push(digestOk ? 'The receipt digest matches the record shown (not edited since it was made).' : 'The receipt digest does NOT match the record shown: it was changed after it was made.');
    if (!digestOk) return { outcome: 'MISMATCH', lines, timestamp: stamp() };

    const first = recordIn.observation;
    const claimText = [...new Set(recordIn.claims.map((c) => c.sentence))].join(' ');
    const again = await (deps.inspect ?? inspectRunClaims)(first.url, claimText, { env: NO_TOKEN_ENV, now });
    const second = again.record.observation;
    const diffs = RUN_FIELDS.filter((f) => first[f] !== second[f]);
    const sameVerdicts = JSON.stringify(recordIn.claims.map((c) => c.status)) === JSON.stringify(again.record.claims.map((c) => c.status));
    if (diffs.length > 0 || !sameVerdicts) {
      lines.push(`GitHub now reports something different (${diffs.length > 0 ? diffs.join(', ') : 'claim verdicts'}). The run may have changed since the receipt was made.`);
      return { outcome: 'MISMATCH', lines, timestamp: stamp() };
    }
    lines.push('GitHub, read again just now, reports the same run, commit, status and conclusion, and the claim gets the same verdict.');
    lines.push('This shows the answer is repeatable. It does not show GitHub is right.');
    return { outcome: 'MATCH', lines, timestamp: stamp() };
  } catch (e) {
    const why = publicWhy(e, 'the re-check could not complete');
    lines.push(`Could not re-check: ${why}. This is not a pass.`);
    return { outcome: 'NOT_CHECKED', lines, timestamp: stamp() };
  }
}
