/**
 * @hyperdag/trustshell
 * Trust scoring SDK for AI — add HAL evaluation to any LLM app in 3 lines.
 * 
 * From S-SDK1 spec + S-BUILD implementation.
 */

export interface TrustShellConfig {
  apiKey?: string;
  apiUrl?: string;
  timeout?: number;
}

export interface ScoreOptions {
  prompt?: string;
  provider?: string;
  model?: string;
}

export interface ScoreResult {
  trustScore: number; // 0-100 (inverted from risk)
  halScore: number; // 0-1 raw
  signals: {
    harmProbability: number;
    epistemicUncertainty: number;
    evidenceQuality: number;
    scopeAppropriateness: number;
    certaintyAtClaim: number;
  };
  verdict: 'PASS' | 'FLAG' | 'VETO';
  flaggedHallucination: boolean;
  provider: string;
  model: string;
  proofHash?: string;
  sessionId?: string;
  // Quorum (strictness-2) metadata, present on the real fact-check path.
  mode?: string;
  providersUsed?: number;
  familiesUsed?: number;
  agreement?: number;
  /** Human-readable reason for the verdict (quorum + threshold summary). */
  decisionReason: string;
  /** Per-provider evidence — "provider:VERDICT (note)" — the WHY behind the verdict. */
  evidence: string[];
  // SBFA v0.2 Glass Box (fact-check path; see VerifyOutputResult for field docs). Forwarded to verifyOutput.
  belief?: number;
  ignoranceMass?: number;
  confidence?: number;
  tierDistribution?: Record<string, number>;
  glassBox?: VerifyOutputResult['glassBox'];
}

export interface VerifyResult {
  repid: number;
  tier: string;
  lastAnchorTx: string | null;
  latestProofHash: string | null;
  provenanceChain: any[];
}

export interface AuditResult {
  chainStatus: 'VALID' | 'CHAIN_BREAK';
  totalEntries: number;
  firstBreakId: string | null;
  verifiedAt: string;
}

export interface VerifyOutputResult {
  /** true when HAL did not hard-veto the output (PASS or soft FLAG). */
  ok: boolean;
  verdict: 'PASS' | 'FLAG' | 'VETO';
  trustScore: number; // 0-100
  halScore: number; // 0-1
  /** present when HAL soft-flagged rather than vetoed (e.g. opinion/time-sensitive). */
  soft: boolean;
  signals: ScoreResult['signals'];
  /** Human-readable reason for the verdict. */
  decisionReason: string;
  /** Per-provider evidence behind the verdict (e.g. "mistral:FALSE (Eiffel Tower is in Paris)"). */
  evidence: string[];
  /**
   * SBFA consensus fields. Populated from the backend `sbfa` object (SBFA v0.2 shadow) when present;
   * left undefined when the backend doesn't supply them. Never fabricated (except `confidence`, which
   * falls back to a clearly-labeled DERIVED proxy).
   */
  /** Dempster–Shafer belief mass on the 'action warranted / hallucinated' class. undefined if no SBFA. */
  belief?: number;
  /** Dempster–Shafer ignorance mass (Yager — mass on {uncertain}). undefined if no SBFA; never derived. */
  ignoranceMass?: number;
  /**
   * Aggregate confidence (1 − ignorance) from SBFA when present. When the backend has no SBFA field,
   * falls back to a DERIVED heuristic `quorum/(quorum+1) * (1 − halScore)` — an approximation, not a DST value.
   */
  confidence?: number;
  /** Per-tier validator distribution. undefined until the backend emits `tier_distribution`. */
  tierDistribution?: Record<string, number>;
  /**
   * GLASS BOX — the structured, human-readable SBFA decision trace: who voted, their reliability
   * weights, the quorum math, and why it vetoed/deferred/passed. Present only when the backend's
   * fact-check path returns `sbfa.trace`. This is the differentiator surfaced to the integrator.
   */
  glassBox?: {
    decision: 'act' | 'hold' | 'abstain' | 'escalate';
    weightedAgreement: number;
    correlatedWarning: boolean;
    commaConservative: boolean;
    reliabilitySource: string;
    /** One human-readable line per step (header, per-vote evidence, fusion, decision). */
    lines: string[];
    /** Per-validator evidence breakdown (validator, model, reliability, DST contribution). */
    votes: Array<{
      validator: string;
      modelVersion: string;
      family?: string;
      belief: number;
      confidence: number;
      reliabilityMean: number;
      contributesAct: number;
      contributesIgnorance: number;
    }>;
  };
}

/**
 * Parameters for an A2A micro-transaction (service contract + x402 payment).
 * Maps to the live backend sequence: POST /api/v1/contracts → POST /api/v1/contracts/:id/escrow.
 */
export interface A2AParams {
  /** Repid-engine agent ID of the service BUYER (the calling agent). */
  buyerAgentId: string;
  /** UUID of the `agent_services` row to purchase. */
  serviceId: string;
  /** Task payload to pass to the provider (free-form, no SQL keywords). */
  payload: Record<string, unknown>;
  /**
   * Agreed price in micro-USDC raw units (e.g. 100000 = 0.1 USDC).
   * If omitted, the service's `base_price_usdc_raw` is used.
   */
  agreedPriceUsdcRaw?: number;
  /**
   * x-payment header for x402 escrow (EIP-3009 signed transfer encoded by the x402 client).
   * Required when the service requires payment. If omitted, the backend will return a 402 with
   * payment requirements; the caller should construct the payment and retry.
   */
  xPaymentHeader?: string;
}

/**
 * Result of an executeA2A call. Reflects the backend service-contract lifecycle state at the
 * moment the call completed. The contract is typically in `pending` or `escrowed` status —
 * fulfillment is asynchronous (picked up by a provider agent).
 */
export interface A2AResult {
  /** UUID of the created/escrowed service contract. */
  contractId: string;
  /** Status as returned by the backend: pending | escrowed | fulfilled | disputed | cancelled */
  status: string;
  /** Provider agent ID assigned to fulfill the contract. */
  providerAgentId: string;
  /** Agreed price in micro-USDC raw units. */
  agreedPriceUsdcRaw: number;
  /** x402 settlement ID, present when escrow succeeded. */
  settlementId?: string;
  /**
   * When payment is required but no xPaymentHeader was supplied, the backend returns a 402
   * with payment requirements. These are echoed here so the caller can construct the payment.
   */
  paymentRequired?: {
    x402Version: number;
    accepts: unknown[];
    error: string;
  };
}

export interface RepIDResult {
  agentId: string;
  repid: number;
  tier: string;
  lastAnchorTx: string | null;
  latestProofHash: string | null;
}

/** Reveal tiers (ZKP_REVEAL_TIERS). `postcard` is production-real; others are capability-gated. */
export type ProofTier = 'postcard' | 'envelope' | 'letter' | 'package';

/** A RepID range proof + its public statement, ready for client-side WASM verification. */
export interface ProofPresentation {
  agentId: string;
  /** Which reveal tier produced this proof. */
  tier: ProofTier;
  /** base64-encoded Plonky3 proof bytes (empty for legacy sha256 stubs). */
  proofBytes: string;
  scheme: string | null; // 'plonky3_range_check' for real proofs
  statement: {
    agent_id: string;
    repid_score: number;
    threshold: number;
    tier: string;
  } | null;
  createdAt: string | null;
  /** populated by presentProof({ verify: true }) — client-side WASM verification result. */
  verification?: {
    verified: boolean;
    error: string | null;
    verifierVersion: string;
  };
}

export class TrustShellError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'TrustShellError';
    this.status = status;
  }
}

export class TrustShell {
  private config: TrustShellConfig;
  private baseUrl: string;
  private listeners: Record<string, Array<(payload: any) => void>> = {};

  constructor(config: TrustShellConfig = {}) {
    this.config = config;
    this.baseUrl = config.apiUrl ||
      (typeof process !== 'undefined' ? process.env?.TRUSTSHELL_API_URL : undefined) ||
      'https://repid-engine-production.up.railway.app';
  }

  /**
   * Construct a TrustShell and confirm the backend is reachable (real connectivity check, not a
   * stub). Returns the client; `health` reflects the live `/health` probe so callers can fail fast.
   */
  static async init(config: TrustShellConfig = {}): Promise<{ client: TrustShell; health: { ok: boolean; status?: string; error?: string } }> {
    const client = new TrustShell(config);
    let health: { ok: boolean; status?: string; error?: string };
    try {
      const res = await fetch(`${client.baseUrl}/health`, { headers: client.getHeaders() });
      const data: any = res.ok ? await res.json().catch(() => ({})) : {};
      health = { ok: res.ok, status: data.status };
    } catch (err: any) {
      health = { ok: false, error: err?.message ?? String(err) };
    }
    return { client, health };
  }

  /**
   * Subscribe to client-side lifecycle events emitted when SDK calls complete. Real (not faked):
   * the SDK has no server push channel, so these fire locally on `verdict` (after verifyOutput) and
   * `proof` (after presentProof). Returns an unsubscribe fn. Server-streamed events are a roadmap item.
   */
  subscribe(event: 'verdict' | 'proof', handler: (payload: any) => void): () => void {
    (this.listeners[event] ??= []).push(handler);
    return () => {
      this.listeners[event] = (this.listeners[event] ?? []).filter((h) => h !== handler);
    };
  }

  private emit(event: string, payload: any): void {
    for (const h of this.listeners[event] ?? []) {
      try { h(payload); } catch { /* a listener throwing must not break the SDK call */ }
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }
    return headers;
  }

  async score(response: string, options: ScoreOptions = {}): Promise<ScoreResult> {
    const url = `${this.baseUrl}/api/v1/hal/evaluate`;

    // The live /api/v1/hal/evaluate contract takes { text, context?, strictness? } — NOT
    // { response, ... }. strictness 2 selects the cross-provider fact-check quorum (the real
    // HAL), not the style-only extractor. (Fixes the prior 400 "text is required".)
    const body: Record<string, unknown> = {
      text: response,
      strictness: 2,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.timeout || 30000
    );

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new TrustShellError(
          `HAL evaluation failed: ${res.status} ${res.statusText}`,
          res.status
        );
      }

      const data = await res.json();

      const halScore = typeof data.hal_score === 'number' ? data.hal_score : 0;
      const trustScore = Math.round((1 - halScore) * 100);

      // Real contract returns decision: 'vetoed' | 'flagged' | 'clean' (legacy: hal_verdict).
      const decision: string | undefined = data.decision ?? data.hal_verdict;
      const verdict: 'PASS' | 'FLAG' | 'VETO' =
        decision === 'vetoed' || decision === 'VETO' ? 'VETO'
        : decision === 'flagged' || decision === 'FLAG' ? 'FLAG'
        : 'PASS';

      // Quorum (strictness-2) returns `signals` with provider/family info; the style-only
      // extractor returns harm/epistemic fields. Read both shapes defensively.
      const sig = data.signals ?? data.hal_signals ?? {};

      // Evidence = each non-errored provider's verdict + note. `provider_responses` is a
      // top-level field on the fact-check response (NOT nested under `signals`).
      const providerResponses: any[] = Array.isArray(data.provider_responses) ? data.provider_responses : [];
      const evidence: string[] = providerResponses
        .filter((p) => p && p.verdict && p.verdict !== 'ERROR')
        .map((p) => `${p.provider}:${p.verdict}${p.note ? ` (${p.note})` : ''}`);
      const quorum = sig.quorum ?? (typeof sig.providers_used === 'number' ? `${sig.providers_used} providers` : 'unknown');
      const decisionReason = data.quorum_note
        ?? `${verdict} — hal_score ${halScore} via ${data.mode || 'fact-check'} (${quorum} quorum)`;

      // SBFA v0.2 Glass Box — populated from the backend `sbfa` object (fact-check path). belief +
      // ignorance are never fabricated; confidence falls back to a labeled DERIVED proxy if absent.
      const sbfa: any = data.sbfa;
      const quorumN = typeof sig.families_used === 'number' ? sig.families_used
        : (typeof sig.providers_used === 'number' ? sig.providers_used : 0);
      const derivedConfidence = quorumN > 0 ? (quorumN / (quorumN + 1)) * (1 - halScore) : undefined;
      const glassBox = sbfa?.trace ? {
        decision: sbfa.decision,
        weightedAgreement: sbfa.weighted_agreement,
        correlatedWarning: !!sbfa.correlated_warning,
        commaConservative: !!sbfa.comma_conservative,
        reliabilitySource: sbfa.reliability_source,
        lines: Array.isArray(sbfa.trace.lines) ? sbfa.trace.lines : [],
        votes: Array.isArray(sbfa.trace.votes) ? sbfa.trace.votes.map((v: any) => ({
          validator: v.validator, modelVersion: v.modelVersion, family: v.family,
          belief: v.belief, confidence: v.confidence, reliabilityMean: v.reliability_mean,
          contributesAct: v.contributes_act, contributesIgnorance: v.contributes_ignorance,
        })) : [],
      } : undefined;

      return {
        trustScore,
        halScore,
        signals: {
          harmProbability: sig.harm_probability ?? 0,
          epistemicUncertainty: sig.epistemic_uncertainty ?? 0,
          evidenceQuality: sig.evidence_quality ?? 0,
          scopeAppropriateness: sig.scope_appropriateness ?? 0,
          certaintyAtClaim: sig.certainty_at_claim ?? 0,
        },
        verdict,
        flaggedHallucination: verdict === 'VETO',
        provider: Array.isArray(sig.families) ? sig.families.join('+') : (data.provider_used || options.provider || 'quorum'),
        model: data.mode || data.model_used || 'fact-check',
        proofHash: data.proof_hash,
        sessionId: data.session_id,
        mode: data.mode,
        providersUsed: sig.providers_used,
        familiesUsed: sig.families_used,
        agreement: sig.agreement,
        decisionReason,
        evidence,
        belief: typeof sbfa?.belief === 'number' ? sbfa.belief : undefined,
        ignoranceMass: typeof sbfa?.ignorance_mass === 'number' ? sbfa.ignorance_mass : undefined,
        confidence: typeof sbfa?.confidence === 'number' ? sbfa.confidence : derivedConfidence,
        tierDistribution: sbfa?.tier_distribution ?? data.tier_distribution ?? undefined,
        ...(glassBox ? { glassBox } : {}),
      };
    } catch (err: any) {
      if (err instanceof TrustShellError) throw err;
      if (err.name === 'AbortError') {
        throw new TrustShellError('HAL evaluation timed out', 408);
      }
      throw new TrustShellError(`Network error: ${err.message}`, 0);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async verify(agentId: string): Promise<VerifyResult> {
    const url = `${this.baseUrl}/api/v1/repid/${agentId}`;
    const res = await fetch(url, { headers: this.getHeaders() });

    if (!res.ok) {
      throw new TrustShellError(`RepID lookup failed: ${res.status}`, res.status);
    }

    const data = await res.json();
    return {
      // The live /api/v1/repid/:id returns `repid_score` (cached read); keep the legacy fallbacks.
      repid: data.repid_score ?? data.repid ?? data.current_repid,
      tier: data.tier,
      lastAnchorTx: data.last_anchor_tx || null,
      latestProofHash: data.latest_proof_hash || null,
      provenanceChain: data.provenance || [],
    };
  }

  /**
   * Verify an agent output through HAL and return a simple ok/verdict.
   * `ok` is true unless HAL hard-vetoed (so a category-aware soft FLAG still passes).
   *
   * Task C — SBFA honesty fields: `belief`, `ignoranceMass`, `confidence`, `tierDistribution`
   * are populated from the backend response when present. When the backend does not supply them
   * (pre-SBFA-Phase-2), `confidence` is DERIVED as a heuristic proxy; all others remain undefined.
   */
  async verifyOutput(output: string, options: ScoreOptions = {}): Promise<VerifyOutputResult> {
    const r = await this.score(output, options);

    // --- SBFA v0.2 Glass Box — forwarded from score(), which parses the backend `sbfa` object. ---
    // belief / ignoranceMass: REAL DST values when the backend supplies them; never fabricated (undefined otherwise).
    // confidence: real SBFA confidence when present, else a DERIVED proxy (quorum/(quorum+1) * (1 - halScore)).
    const quorum = r.providersUsed ?? 0;
    const derivedConfidence: number =
      quorum > 0
        ? (quorum / (quorum + 1)) * (1 - r.halScore)
        : (1 - r.halScore) * 0.5; // single-provider fallback: half-weight

    const result: VerifyOutputResult = {
      ok: r.verdict !== 'VETO',
      verdict: r.verdict,
      trustScore: r.trustScore,
      halScore: r.halScore,
      soft: r.verdict === 'FLAG',
      signals: r.signals,
      decisionReason: r.decisionReason,
      evidence: r.evidence,
      belief: r.belief, // real DST belief mass, or undefined (never fabricated)
      ignoranceMass: r.ignoranceMass, // real DST ignorance, or undefined (never derived)
      confidence: r.confidence ?? derivedConfidence, // real SBFA confidence; else DERIVED proxy
      tierDistribution: r.tierDistribution,
      ...(r.glassBox ? { glassBox: r.glassBox } : {}),
    };
    this.emit('verdict', result);
    return result;
  }

  /** Fetch an agent's current RepID + tier (public read; no API key required). */
  async getRepID(agentId: string): Promise<RepIDResult> {
    const v = await this.verify(agentId);
    return {
      agentId,
      repid: v.repid,
      tier: v.tier,
      lastAnchorTx: v.lastAnchorTx,
      latestProofHash: v.latestProofHash,
    };
  }

  /**
   * Fetch an agent's latest RepID range proof and (optionally) verify it client-side
   * with the bundled WASM verifier — "trust math, not the server."
   *
   * Client-side verification requires @hyperdag/proof-verifier (peer dependency); the
   * proof statement is the agent-bound tuple {agent_id, threshold, repid_score}.
   */
  async presentProof(
    agentId: string,
    opts: { verify?: boolean; tier?: ProofTier; allowExperimentalTiers?: boolean } = {},
  ): Promise<ProofPresentation> {
    const tier: ProofTier = opts.tier ?? 'postcard';
    // Only `postcard` has a production-real proof endpoint today. Other tiers (envelope/letter/
    // package) are implemented in the prover but not yet exposed as a live API — expose them behind
    // a capability flag, default OFF, and FLAG rather than fake (no stub in a shipped path).
    if (tier !== 'postcard' && !opts.allowExperimentalTiers) {
      throw new TrustShellError(
        `Proof tier '${tier}' is not yet production-exposed. Pass { allowExperimentalTiers: true } ` +
        `to opt in once the live endpoint ships; today only 'postcard' returns a real proof.`,
        501,
      );
    }
    const url = `${this.baseUrl}/api/v1/repid/${encodeURIComponent(agentId)}/proof`;
    const res = await fetch(url, { headers: this.getHeaders() });
    if (!res.ok) {
      throw new TrustShellError(`Proof lookup failed: ${res.status}`, res.status);
    }
    const data = await res.json();
    const presentation: ProofPresentation = {
      agentId,
      tier,
      proofBytes: data.proof_bytes || '',
      scheme: data.scheme ?? null,
      statement: data.statement ?? null,
      createdAt: data.created_at ?? null,
    };

    if (opts.verify && presentation.proofBytes && presentation.statement) {
      presentation.verification = await this.verifyProofLocally(
        presentation.proofBytes,
        presentation.statement,
      );
    }
    this.emit('proof', presentation);
    return presentation;
  }

  /** Client-side WASM verification of a proof against its statement. */
  private async verifyProofLocally(
    proofBytes: string,
    statement: ProofPresentation['statement'],
  ): Promise<NonNullable<ProofPresentation['verification']>> {
    try {
      // Dynamic import via a variable specifier so the SDK type-checks and loads even when
      // the optional verifier isn't installed (it ships as an optionalDependency).
      const verifierPkg = '@hyperdag/proof-verifier';
      const mod: any = await import(/* @vite-ignore */ verifierPkg);
      const result = await mod.verify(proofBytes, statement);
      return {
        verified: !!result.verified,
        error: result.error ?? null,
        verifierVersion: result.verifier_version ?? 'unknown',
      };
    } catch (err: any) {
      return {
        verified: false,
        error: `verifier unavailable: ${err?.message ?? String(err)}`,
        verifierVersion: 'unavailable',
      };
    }
  }

  async audit(table: string = 'hal_classifications'): Promise<AuditResult> {
    const url = `${this.baseUrl}/api/v1/audit/verify?table=${encodeURIComponent(table)}`;
    const res = await fetch(url, { headers: this.getHeaders() });

    if (!res.ok) {
      throw new TrustShellError(`Audit failed: ${res.status}`, res.status);
    }

    const data = await res.json();
    return {
      chainStatus: data.status as 'VALID' | 'CHAIN_BREAK',
      totalEntries: data.total_entries || data.totalEntries || 0,
      firstBreakId: data.first_break_id || null,
      verifiedAt: new Date().toISOString(),
    };
  }

  /**
   * Execute an A2A micro-transaction: create a service contract and (optionally) escrow payment
   * via x402. This is an honest client against the live backend.
   *
   * **Backend sequence (two calls):**
   * 1. `POST /api/v1/contracts` — creates a `service_contracts` row in `pending` status.
   * 2. `POST /api/v1/contracts/:id/escrow` — submits x402 payment; advances status to `escrowed`.
   *    Step 2 is only executed when `params.xPaymentHeader` is supplied. If the service requires
   *    payment and no header is provided, the backend returns a 402 with payment requirements that
   *    are echoed back in `result.paymentRequired` — the caller should construct the x402 payment
   *    using those requirements and call `executeA2A` again with the header.
   *
   * **What is NOT wired yet:**
   * - Fulfillment (`POST /api/v1/contracts/:id/fulfill`) is picked up asynchronously by a provider
   *   agent — there is no synchronous fulfillment path. Poll `GET /api/v1/contracts/:id` for status.
   * - The `ESCALATION_CONTRACT` gate is currently OFF in prod for most Trinity agents (P-032).
   *   Contracts created here will sit in `escrowed` until the gate is enabled or the cascade
   *   settlement worker picks them up.
   *
   * **A2A is real but the end-to-end loop is partially wired** (contracts created and escrowed;
   * fulfillment and settlement are asynchronous). This is an honest 501 for the fully-synchronous
   * "request → response → settled" flow that is not yet available.
   */
  async executeA2A(params: A2AParams): Promise<A2AResult> {
    // Step 1: Create the service contract.
    const createRes = await fetch(`${this.baseUrl}/api/v1/contracts`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        service_id: params.serviceId,
        buyer_agent_id: params.buyerAgentId,
        payload: params.payload,
        ...(params.agreedPriceUsdcRaw !== undefined
          ? { agreed_price_usdc_raw: params.agreedPriceUsdcRaw }
          : {}),
      }),
    });

    if (!createRes.ok) {
      const errBody = await createRes.json().catch(() => ({})) as any;
      throw new TrustShellError(
        `A2A contract creation failed: ${createRes.status} — ${errBody?.error ?? createRes.statusText}`,
        createRes.status,
      );
    }

    const contract = await createRes.json() as any;
    const contractId: string = contract.id;

    // Step 2: Escrow via x402 (only when a payment header was provided by the caller).
    if (!params.xPaymentHeader) {
      // No payment header: attempt escrow anyway so the backend can tell us its requirements.
      const escrowProbeRes = await fetch(
        `${this.baseUrl}/api/v1/contracts/${encodeURIComponent(contractId)}/escrow`,
        { method: 'POST', headers: this.getHeaders(), body: JSON.stringify({}) },
      );
      const escrowBody = await escrowProbeRes.json().catch(() => ({})) as any;
      if (escrowProbeRes.status === 402) {
        // Backend told us what payment it needs — echo back and let the caller handle it.
        return {
          contractId,
          status: contract.status ?? 'pending',
          providerAgentId: contract.provider_agent_id,
          agreedPriceUsdcRaw: contract.agreed_price_usdc_raw,
          paymentRequired: {
            x402Version: escrowBody.x402Version ?? 1,
            accepts: escrowBody.accepts ?? [],
            error: escrowBody.error ?? 'payment_required',
          },
        };
      }
      // If escrow succeeded without a header (free service or dev mode), fall through.
      if (escrowProbeRes.ok) {
        const escrowed = await escrowProbeRes.json().catch(() => escrowBody) as any;
        return {
          contractId,
          status: escrowed.status ?? 'escrowed',
          providerAgentId: escrowed.provider_agent_id ?? contract.provider_agent_id,
          agreedPriceUsdcRaw: escrowed.agreed_price_usdc_raw ?? contract.agreed_price_usdc_raw,
          settlementId: escrowed.x402_payment_id ?? undefined,
        };
      }
      // Any other error: surface it.
      throw new TrustShellError(
        `A2A escrow failed: ${escrowProbeRes.status} — ${escrowBody?.error ?? escrowProbeRes.statusText}`,
        escrowProbeRes.status,
      );
    }

    // xPaymentHeader was provided: submit it for escrow.
    const escrowRes = await fetch(
      `${this.baseUrl}/api/v1/contracts/${encodeURIComponent(contractId)}/escrow`,
      {
        method: 'POST',
        headers: {
          ...this.getHeaders(),
          'X-PAYMENT': params.xPaymentHeader,
        },
        body: JSON.stringify({}),
      },
    );

    if (escrowRes.status === 402) {
      const body = await escrowRes.json().catch(() => ({})) as any;
      return {
        contractId,
        status: 'pending',
        providerAgentId: contract.provider_agent_id,
        agreedPriceUsdcRaw: contract.agreed_price_usdc_raw,
        paymentRequired: {
          x402Version: body.x402Version ?? 1,
          accepts: body.accepts ?? [],
          error: body.error ?? 'payment_required',
        },
      };
    }

    if (!escrowRes.ok) {
      const errBody = await escrowRes.json().catch(() => ({})) as any;
      throw new TrustShellError(
        `A2A escrow failed: ${escrowRes.status} — ${errBody?.error ?? escrowRes.statusText}`,
        escrowRes.status,
      );
    }

    const escrowed = await escrowRes.json() as any;
    return {
      contractId,
      status: escrowed.status ?? 'escrowed',
      providerAgentId: escrowed.provider_agent_id ?? contract.provider_agent_id,
      agreedPriceUsdcRaw: escrowed.agreed_price_usdc_raw ?? contract.agreed_price_usdc_raw,
      settlementId: escrowed.x402_payment_id ?? undefined,
    };
  }
}

export default TrustShell;
