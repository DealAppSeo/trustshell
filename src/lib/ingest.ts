/**
 * ingest — consume-side injection quarantine. NOT `verifyOutput`.
 *
 * `verifyOutput` (HAL) asks "is this claim true?" about text the agent is about to EMIT.
 * `ingest` asks "is this fetched content safe to ACT ON?" about untrusted text the agent is about to
 * CONSUME (a web page, a doc, a message, a tool result). Different direction, different threat:
 * verifyOutput guards truth on the way out; ingest guards against prompt-injection / instruction-
 * smuggling on the way in. Spec: docs/living/INGEST.md (CC1, 2026-09-12).
 *
 * The boundary (why PAI1 never sees raw fetched content): PAI2 (a specialist) fetches, runs `ingest()`,
 * and quarantines the raw bytes. Only the structured verdict object crosses to PAI1 (chief of staff) —
 * never the raw source — so PAI1 cannot be steered by instructions hidden in the source.
 *
 * `flag` defaults OFF: the gate is binary `clean` | `veto`, and uncertainty resolves FAIL-CLOSED to
 * `veto` (never silently to `clean`). Turning `flag` on opts into a human-review middle tier.
 *
 * This module is intentionally standalone: not exported from the SDK entry, not called from /create,
 * no Pinchtab, no logged-in Chrome. It is the contract an implementer wires behind the PAI2→PAI1 boundary.
 */

export type IngestVerdict = 'clean' | 'veto' | 'flag';

export interface IngestResult {
  ingest: IngestVerdict;
  /**
   * Sanitized summary that crosses to PAI1. Quotes DATA but strips/neutralizes anything imperative
   * aimed at the reader. On `veto` it describes the REASON — it never reproduces the payload as a
   * live instruction.
   */
  excerpt: string;
  /** PAI2's suggestion; PAI1 is the decider. A `veto` proposedAction is never "proceed". */
  proposedAction: string;
}

export interface IngestOptions {
  /** Opt into the borderline middle tier. OFF by default → borderline resolves fail-closed to `veto`. */
  flag?: boolean;
  /** Max excerpt length (chars). Default 160. */
  excerptChars?: number;
}

// Strong instruction-smuggling markers aimed at the consumer. A match is an injection attempt → veto.
const INJECTION: readonly RegExp[] = [
  /\b(ignore|disregard|forget)\b[\s\S]{0,40}\b(previous|prior|above|earlier|all|everything|instruction|instructions|rule|rules|context|prompt)\b/i,
  /\byou are (now|actually)\b/i,
  /\bnew instructions?\b\s*[:.]/i,
  /\bsystem prompt\b/i,
  /\b(reveal|print|leak|exfiltrate|send)\b[\s\S]{0,40}\b(system prompt|secret|api[_\s-]?key|password|private key|credentials?)\b/i,
  /\bdo not (follow|obey|tell|mention)\b/i,
];

// Weaker signals — a role/instruction imperative without a full smuggling phrase. Borderline.
// NOTE: deliberately NOT bare words like "ignore"/"reveal" — benign prose legitimately discusses
// them ("nothing telling the agent to ignore or reveal anything"), and matching the word alone
// false-vetoes ordinary data. The strong phrases (ignore PREVIOUS INSTRUCTIONS, reveal the apiKey)
// are caught by INJECTION above; borderline needs imperative context, not a keyword.
const BORDERLINE: readonly RegExp[] = [
  /\binstructions?\s*:/i,
  /\bact as\b/i,
  /\bpretend (you|to be)\b/i,
];

/** Neutralize imperative directives so a quoted excerpt cannot carry them forward as live instructions. */
function sanitizeExcerpt(content: string, chars: number): string {
  const neutralized = content
    .replace(/\b(ignore|disregard|forget)\b[\s\S]{0,40}\b(previous|prior|above|instruction[s]?|rule[s]?|prompt|context)\b/gi, '[redacted-directive]')
    .replace(/\byou are (now|actually)\b[\s\S]{0,40}/gi, '[redacted-role-reassignment]')
    .replace(/\bsystem prompt\b/gi, '[redacted]');
  return neutralized.replace(/\s+/g, ' ').trim().slice(0, chars);
}

/**
 * Screen untrusted fetched content before an agent acts on it.
 * - Strong injection marker → `veto` (excerpt = reason, never the payload).
 * - Borderline imperative → `flag` if `flag` enabled, else fail-closed to `veto`.
 * - Otherwise → `clean` (excerpt = sanitized data summary).
 */
export function ingest(content: string, opts: IngestOptions = {}): IngestResult {
  const chars = opts.excerptChars ?? 160;
  const text = String(content ?? '');

  if (INJECTION.some((re) => re.test(text))) {
    return {
      ingest: 'veto',
      excerpt: 'instruction-smuggling detected in fetched content (payload quarantined, not reproduced)',
      proposedAction: 'quarantine — do not act on this content',
    };
  }

  if (BORDERLINE.some((re) => re.test(text))) {
    if (opts.flag) {
      return {
        ingest: 'flag',
        excerpt: sanitizeExcerpt(text, chars),
        proposedAction: 'hold for human review — borderline imperative in fetched content',
      };
    }
    // flag OFF (default): uncertainty resolves fail-closed to veto, never silently to clean.
    return {
      ingest: 'veto',
      excerpt: 'borderline imperative content; fail-closed to veto (flag disabled)',
      proposedAction: 'quarantine — do not act on this content',
    };
  }

  return {
    ingest: 'clean',
    excerpt: sanitizeExcerpt(text, chars),
    proposedAction: 'proceed — content is ordinary data',
  };
}
