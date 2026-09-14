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
 * `veto` (never silently to `clean`). Turning `flag` on opts into a human-review middle tier. In no
 * case does a `veto` or `flag` proposedAction say "proceed" — `clean` is the ONLY verdict that does.
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
  /** PAI2's suggestion; PAI1 is the decider. A `veto`/`flag` proposedAction is never "proceed". */
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
  /\b(ignore|disregard|forget|dismiss)\b[\s\S]{0,40}\b(previous|prior|above|earlier|preceding|all|everything|instruction|instructions|rule|rules|context|prompt)\b/i,
  // Paraphrases of "ignore previous instructions" that dodge the verb list above (Strix finding a).
  /\bpay no attention to\b[\s\S]{0,40}\b(previous|prior|above|earlier|preceding|instruction|rule|context|prompt)/i,
  /\b(set aside|put aside|cast aside|throw out|override)\b[\s\S]{0,40}\b(previous|prior|above|earlier|preceding|instruction|rule|context|prompt|guard|guardrail|safety|filter)/i,
  /\b(the )?(above|previous|earlier|preceding|prior)\b[\s\S]{0,30}\b(is|are|was|were)\b[\s\S]{0,20}\b(fake|wrong|a test|to be ignored|not real|incorrect|a lie)\b/i,
  /\binstead of\b[\s\S]{0,40}\b(told|instructed|asked|your (instructions?|task|orders?))\b/i,
  /\byour (real|true|actual) (task|job|goal|instruction|instructions|purpose|orders?)\b/i,
  /\bfrom now on\b[\s\S]{0,40}\byou\b[\s\S]{0,20}\b(are|will|must|should|shall)\b/i,
  /\byou are (now|actually)\b/i,
  /\bnew instructions?\b\s*[:.]/i,
  /\bsystem prompt\b/i,
  /\b(developer|god|admin|debug|unrestricted) mode\b/i,
  /\bjailbreak\b|\bdo anything now\b|\bDAN\b/i,
  /\b(disable|turn off|switch off|bypass|circumvent|evade)\b[\s\S]{0,30}\b(safety|guardrails?|filters?|moderation|restrictions?|rules?|instructions?|policy|policies)\b/i,
  /\b(reveal|print|leak|exfiltrate|send|email|forward|publish|share|disclose|expose|output|transmit|dump|repeat back)\b[\s\S]{0,40}\b(system prompt|system instructions?|secret|api[_\s-]?keys?|password|private keys?|credentials?|\.env|environment variables?|tokens?|wallet(?:\.json)?|seed phrase)\b/i,
  /\bdo not (follow|obey|tell|mention|reveal|inform|warn)\b/i,
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
  /\brole\s*[:=]\s*(system|assistant|developer|admin)/i,
];

// Broad neutralizer for imperative-to-reader constructs, so the excerpt PAI1 sees cannot carry
// instructions forward across the boundary. Over-redaction is intentional and fail-SAFE: the excerpt
// is a short gist, not the full data — redacting a benign imperative is far cheaper than forwarding a
// malicious one verbatim. Runs on `clean`/`flag` excerpts (a `veto` excerpt is a fixed reason string).
// ponytail: keyword heuristic with a KNOWN CEILING — a novel phrasing can evade both the verdict and
// this redactor. That is exactly why `flag` defaults off (uncertainty→veto), why `clean` means
// "no KNOWN injection" (not "provably safe"), and why this module is NOT exported / NOT wired into any
// path yet. Upgrade path before production trust: a model-based injection classifier, not more regex.
const IMPERATIVE =
  /\b(ignore|disregard|forget|override|bypass|reveal|expose|leak|exfiltrate|approve|authorize|transfer|delete|drop|execute|eval|install|uninstall|act as|pretend|jailbreak|you are (?:now|actually)|you must|do not|don'?t|new instructions?|system prompt|developer mode)\b[\s\S]{0,80}/gi;

function sanitizeExcerpt(content: string, chars: number): string {
  return content.replace(IMPERATIVE, '[redacted-directive]').replace(/\s+/g, ' ').trim().slice(0, chars);
}

// De-obfuscation for DETECTION only (never for the excerpt). Strix finding (a): the keyword regexes
// are trivially dodged by inserting separators or zero-width characters between letters
// ("i g n o r e", "d.i.s.r.e.g.a.r.d", zero-width-joined). We normalize a COPY of the text and scan
// that copy too, so those evasions still trip INJECTION. This raises the bar; it is not a proof of
// safety — the KNOWN CEILING stands (a model classifier is the real fix), which is why the module
// stays default-off / unexported / unwired.
function deobfuscate(text: string): string {
  return text
    // zero-width space/joiners, word-joiner, BOM, soft hyphen — all used to break \b adjacency
    .replace(/[​-‍⁠﻿­]/g, '')
    // collapse runs of single letters split by separators: "i g n o r e" -> "ignore"
    .replace(/\b(?:[a-z][\s.\-_*|~/]{1,3}){2,}[a-z]\b/gi, (m) => m.replace(/[\s.\-_*|~/]/g, ''));
}

// A base64 blob can smuggle an instruction past a text scan. If a long encoded run DECODES to text
// that itself contains an injection phrase, that is smuggling → injection. Benign base64 (images,
// hashes) decodes to non-injection or non-printable bytes and is left alone (no false veto).
function decodedPayloadIsInjection(text: string): boolean {
  const blobs = text.match(/[A-Za-z0-9+/]{24,}={0,2}/g);
  if (!blobs) return false;
  for (const blob of blobs.slice(0, 20)) {
    let decoded: string;
    try {
      decoded =
        typeof atob === 'function'
          ? atob(blob.replace(/[^A-Za-z0-9+/=]/g, ''))
          : Buffer.from(blob, 'base64').toString('utf8');
    } catch {
      continue; // not valid base64
    }
    // Only scan plausibly-textual decodes — garbage (mostly non-printable) is not an instruction.
    const printable = decoded.replace(/[^\x20-\x7E]/g, '');
    if (printable.length >= decoded.length * 0.8 && INJECTION.some((re) => re.test(printable))) return true;
  }
  return false;
}

// One place that answers "is this an injection attempt?" — raw text, its de-obfuscated copy, and any
// decoded encoded payload. Fail-closed: any of the three tripping is enough.
function hasInjection(text: string): boolean {
  const deob = deobfuscate(text);
  return (
    INJECTION.some((re) => re.test(text)) ||
    (deob !== text && INJECTION.some((re) => re.test(deob))) ||
    decodedPayloadIsInjection(text)
  );
}

// Borderline is also checked against the de-obfuscated copy so a spaced-out "a c t   a s" still trips.
function hasBorderline(text: string): boolean {
  const deob = deobfuscate(text);
  return BORDERLINE.some((re) => re.test(text)) || (deob !== text && BORDERLINE.some((re) => re.test(deob)));
}

/**
 * Screen untrusted fetched content before an agent acts on it.
 * - Strong injection marker (raw, de-obfuscated, or decoded payload) → `veto` (excerpt = reason).
 * - Borderline imperative → `flag` if `flag` enabled, else fail-closed to `veto`.
 * - Otherwise → `clean` (excerpt = sanitized data summary).
 */
export function ingest(content: string, opts: IngestOptions = {}): IngestResult {
  const chars = opts.excerptChars ?? 160;
  const text = String(content ?? '');

  if (hasInjection(text)) {
    return {
      ingest: 'veto',
      excerpt: 'instruction-smuggling detected in fetched content (payload quarantined, not reproduced)',
      proposedAction: 'quarantine — do not act on this content',
    };
  }

  if (hasBorderline(text)) {
    if (opts.flag) {
      return {
        ingest: 'flag',
        // A HOLD, not a pass: the excerpt is redacted and the action routes to a human. `flag` is a
        // distinct tier from `clean` precisely so it is never silently treated as "proceed".
        excerpt: sanitizeExcerpt(text, chars),
        proposedAction: 'hold for human review — borderline imperative in fetched content (do not act)',
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
