/**
 * ingest — consume-side prompt-injection quarantine (spec: docs/living/INGEST.md).
 *
 * NOT verifyOutput: this judges whether UNTRUSTED FETCHED CONTENT is safe to consume, not whether a
 * claim is true. PAI2 fetches + calls this; PAI1 only ever sees the returned {ingest, excerpt,
 * proposedAction} — never the raw content.
 *
 * Standalone by design: imports NOTHING from trustshell.ts, origin.ts, guarded-payment, or app/create.
 * Cheap + deterministic — no LLM, no HAL quorum, no network. `flag` tier is OFF by default; uncertainty
 * fails closed to `veto`.
 */

export type IngestVerdict = 'clean' | 'flag' | 'veto';

export interface IngestResult {
  ingest: IngestVerdict;
  /** Sanitized: on veto it names the reason, never reproduces the payload as a live instruction. */
  excerpt: string;
  /** Suggestion for PAI1 (which decides). A veto is never "proceed". */
  proposedAction: string;
}

export interface IngestOptions {
  /** Enable the borderline `flag` tier. Default OFF → verdicts are binary clean|veto. */
  flag?: boolean;
  /** Max chars scanned (INGEST.md: excerpt ≤ 2000). Longer input is truncated before scanning. */
  maxChars?: number;
}

const MAX_CHARS = 2000;

// Instruction-smuggling aimed at the CONSUMING agent — the injection signal (not the topic).
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts?|messages?)/i,
  /disregard\s+(your\s+|the\s+|all\s+)?(system\s+prompt|previous|prior|instructions?)/i,
  /\bdeveloper\s+mode\b/i,
  /\byou\s+are\s+now\b/i,
  /\b(system|developer)\s+prompt\b/i,
  /reveal\s+.{0,40}(api[\s_-]?key|secret|password|private[\s_-]?key|seed\s?phrase)/i,
  /(approve|authorize|send|transfer)\s+.{0,40}(payment|funds|money|transfer)/i,
  /override\s+.{0,20}(safety|guard|policy|rules?)/i,
  /new\s+instructions?\s*:/i,
];

/**
 * Assess an excerpt of fetched content. Returns the verdict object PAI1 receives.
 * @param excerpt content to judge (string; anything else fails closed to veto)
 */
export function ingest(excerpt: unknown, opts: IngestOptions = {}): IngestResult {
  const flagEnabled = opts.flag === true; // default OFF
  const max = typeof opts.maxChars === 'number' && opts.maxChars > 0 ? opts.maxChars : MAX_CHARS;

  // Uncertainty → veto (fail-closed): a non-string cannot be assessed as safe.
  if (typeof excerpt !== 'string') {
    return { ingest: 'veto', excerpt: 'non-string input — cannot assess (fail-closed)', proposedAction: 'quarantine — do not act on this content' };
  }

  const text = excerpt.length > max ? excerpt.slice(0, max) : excerpt;
  const hit = INJECTION_PATTERNS.find((re) => re.test(text));
  if (hit) {
    // Neutralized reason. Never echo the payload verbatim as a live instruction.
    return {
      ingest: 'veto',
      excerpt: `injection/instruction-smuggling detected (pattern ~"${hit.source.slice(0, 32)}…"); payload withheld`,
      proposedAction: 'quarantine — do not act on this content',
    };
  }

  // No injection signal. With flag OFF this is clean; the flag tier is reserved for a future
  // borderline detector (enabling it never auto-admits — it routes borderline to human review).
  void flagEnabled;
  const benign = text.replace(/\s+/g, ' ').trim().slice(0, 200);
  return { ingest: 'clean', excerpt: benign, proposedAction: 'proceed' };
}
