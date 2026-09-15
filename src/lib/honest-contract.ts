/**
 * Honest return contract — pure derivations (LOOP T4, board #63).
 *
 * A return type that carries its own evidence cannot lie, and then the docs cannot drift from it.
 * These are pure functions over the RAW backend responses; the SDK methods wire them into the typed
 * returns. Every value comes from a real source. When a value is not available in the response, the
 * function returns `null` AND records a reason in `reasons` — it NEVER omits the field and NEVER
 * fills a plausible default. See docs/HONEST_RETURN_CONTRACT.md.
 */

/** How a `verifyOutput` verdict is grounded. */
export type Grounding = 'none' | 'hal' | 'payment';

/**
 * Grounding for a HAL verdict: `hal` only when a real quorum actually spoke (≥1 provider of
 * evidence). No evidence → `none` ("could not check"), never silently treated as grounded.
 * (`payment` is the x402-conditioned lane; verifyOutput never returns it.)
 */
export function verifyOutputGrounding(evidenceCount: number): Grounding {
  return evidenceCount > 0 ? 'hal' : 'none';
}

/**
 * The REAL provider quorum behind a verdict — the number of non-errored provider verdicts the
 * response actually carried. This is a MEASURED count from `evidence`/`provider_responses`, never a
 * constant. (Live 2026-09-14 this was 2 — groq + cerebras — not the "6" that copy had claimed.)
 */
export function countProviders(raw: {
  evidence?: unknown;
  provider_responses?: unknown;
  signals?: { providers_used?: unknown } | null;
}): number {
  if (Array.isArray(raw?.evidence)) return raw.evidence.length;
  if (Array.isArray(raw?.provider_responses)) {
    return raw.provider_responses.filter(
      (p: unknown) => !!p && typeof p === 'object' && (p as { verdict?: unknown }).verdict && (p as { verdict?: unknown }).verdict !== 'ERROR',
    ).length;
  }
  const su = raw?.signals?.providers_used;
  return typeof su === 'number' ? su : 0;
}

export interface RepIDHonesty {
  /** true = a real on-chain mint; false = keyless/never-minted; null = the endpoint didn't say (see reasons). */
  minted: boolean | null;
  /** The publishing signer address, when the endpoint exposes it; else null (see reasons). */
  signer: string | null;
  /** Which scoring lane produced the number, from a real response field; else null (see reasons). */
  scoreLane: string | null;
  /** For every field returned null: why. Never empty when a field is null. */
  reasons: Record<string, string>;
}

/**
 * Derive mint/signer/lane honesty from a raw `GET /api/v1/repid/:id` body. That endpoint today
 * returns only { agent_id, last_updated, repid_score, source, tier } — so `minted` and `signer` are
 * null-with-reason (the endpoint does not expose them), and `scoreLane` comes from the real `source`
 * field. This is the point: 43% of agents are keyless-never-minted (board #63 item 4) and this call
 * cannot tell you which — so it says so, rather than defaulting to `minted: true`.
 */
export function repidHonesty(raw: {
  erc8004_address?: unknown;
  erc8004_token_id?: unknown;
  minted?: unknown;
  signer?: unknown;
  score_lane?: unknown;
  source?: unknown;
}): RepIDHonesty {
  const reasons: Record<string, string> = {};

  let minted: boolean | null = null;
  const addr = typeof raw?.erc8004_address === 'string' ? (raw.erc8004_address as string) : '';
  if (addr) {
    // A real mint has a real 0x address; "external:…" and "pending-mint:…" are placeholders, not mints.
    const placeholder = /^external:/i.test(addr) || /^pending-mint/i.test(addr);
    minted = !placeholder && raw?.erc8004_token_id != null;
  } else if (typeof raw?.minted === 'boolean') {
    minted = raw.minted;
  } else {
    reasons.minted =
      'GET /api/v1/repid/:id does not return mint status (no erc8004_address/token_id); mint state is unknown from this endpoint.';
  }

  let signer: string | null = null;
  if (typeof raw?.signer === 'string' && (raw.signer as string).length) signer = raw.signer as string;
  else reasons.signer = 'GET /api/v1/repid/:id does not return the publishing signer address.';

  let scoreLane: string | null = null;
  if (typeof raw?.score_lane === 'string' && (raw.score_lane as string).length) scoreLane = raw.score_lane as string;
  else if (typeof raw?.source === 'string' && (raw.source as string).length) scoreLane = raw.source as string;
  else reasons.scoreLane = 'GET /api/v1/repid/:id does not return a score lane.';

  return { minted, signer, scoreLane, reasons };
}

export interface ProofHonesty {
  /** The engine's publishing signer, when the proof payload carries it; else null (see reasons). */
  signer: string | null;
  /** A fixed, honest label: a presented proof is an engine-signed postcard, not an aggregate of registry rows. */
  note: 'not a registry aggregate';
  reasons: Record<string, string>;
}

/** Derive signer honesty from a raw `GET /api/v1/repid/:id/proof` body. */
export function proofHonesty(raw: {
  signer?: unknown;
  signer_address?: unknown;
  eas?: { attester?: unknown } | null;
}): ProofHonesty {
  const reasons: Record<string, string> = {};
  const candidate = raw?.signer ?? raw?.signer_address ?? raw?.eas?.attester;
  let signer: string | null = null;
  if (typeof candidate === 'string' && candidate.length) signer = candidate;
  else
    reasons.signer =
      'The /proof response does not expose a signer address; the engine publishing key is configuration, not part of this payload.';
  return { signer, note: 'not a registry aggregate', reasons };
}
