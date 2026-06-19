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

/** Onboarding (custodian + agent). Web3 is DEFERRED: the human custodian is identified by a
 *  custodial address; a real wallet attaches later via BYOK (wallet_address + byok_provider). */
export interface OnboardOptions {
  agentName: string;
  /** the human custodian's address (custodial/embedded by default; a real EVM wallet via BYOK later). */
  conservatorAddress: string;
  /** the AGENT row's is_human (default false — the custodian is the human, the agent is not). */
  isHuman?: boolean;
  /** the agent's embedded/custodial wallet address; null until BYOK attaches a real one. */
  walletAddress?: string | null;
  /** default = free OSS via the LiteLLM gateway (no key needed). */
  llmProvider?: string;
  llmModel?: string;
  /** BYOK — set when the custodian brings their own provider key. */
  byokProvider?: string;
}
export interface OnboardResult {
  agentId: string;
  /** shown ONCE — save it; the SDK uses it for submitOutcome. */
  apiKey: string;
  conservatorAddress: string;
  repid: number;
  tier: string;
  repidUrl?: string;
}
export interface SubmitOutcomeOptions {
  llmProvider: string;
  /** the agent's certainty at decision time, in [0,1]. */
  certainty: number;
  decisionText: string;
  /** e.g. 'success' | 'failure' | 'fulfilled'. */
  outcome: string;
  taskDomain: string;
  llmModel?: string;
  prompt?: string;
  hallucinationCaught?: boolean;
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
   */
  async verifyOutput(output: string, options: ScoreOptions = {}): Promise<VerifyOutputResult> {
    const r = await this.score(output, options);
    const result: VerifyOutputResult = {
      ok: r.verdict !== 'VETO',
      verdict: r.verdict,
      trustScore: r.trustScore,
      halScore: r.halScore,
      soft: r.verdict === 'FLAG',
      signals: r.signals,
      decisionReason: r.decisionReason,
      evidence: r.evidence,
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
   * HAL-check any text through the cross-provider quorum (the real fact-check path).
   * Clean product name for `verifyOutput`; returns ok/verdict/trustScore + per-provider evidence.
   * No API key required (public read). Default providers are free OSS via the LiteLLM gateway.
   */
  async halCheck(text: string, options: ScoreOptions = {}): Promise<VerifyOutputResult> {
    return this.verifyOutput(text, options);
  }

  /**
   * Onboard a custodian + agent in one call — a thin client over repid-engine `POST /api/v1/agents/register`.
   * No API key required to call. Web3 is DEFERRED: pass the custodian's custodial `conservatorAddress`
   * now and attach a real wallet later via BYOK (`byokProvider` / `walletAddress`). Default model =
   * free OSS via the LiteLLM gateway. Returns the new `agentId` + a ONE-TIME `apiKey` (save it —
   * the SDK uses it for `submitOutcome`).
   */
  async onboard(opts: OnboardOptions): Promise<OnboardResult> {
    if (!opts.agentName) throw new TrustShellError('agentName is required', 400);
    if (!opts.conservatorAddress) throw new TrustShellError('conservatorAddress (the human custodian) is required', 400);
    const url = `${this.baseUrl}/api/v1/agents/register`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        agent_name: opts.agentName,
        conservator_address: opts.conservatorAddress,
        is_human: opts.isHuman ?? false,
        wallet_address: opts.walletAddress ?? null,
        llm_provider: opts.llmProvider ?? 'litellm-free',
        llm_model: opts.llmModel ?? null,
        byok_provider: opts.byokProvider ?? null,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new TrustShellError(`onboard failed: ${res.status} ${detail}`.trim(), res.status);
    }
    const data: any = await res.json();
    return {
      agentId: data.agent_id,
      apiKey: data.api_key ?? data.key,
      conservatorAddress: opts.conservatorAddress,
      repid: data.repid ?? data.starting_score ?? 200,
      tier: data.tier ?? 'PROBATIONARY',
      repidUrl: data.repid_url,
    };
  }

  /**
   * Submit a task outcome → emits a `repid_score_events` row (the DB trigger applies the RepID
   * delta server-side). Requires the agent's API key — set `config.apiKey` from `onboard`.
   */
  async submitOutcome(agentId: string, opts: SubmitOutcomeOptions): Promise<any> {
    if (!this.config.apiKey) {
      throw new TrustShellError('submitOutcome requires the agent API key (set config.apiKey from onboard)', 401);
    }
    if (typeof opts.certainty !== 'number' || opts.certainty < 0 || opts.certainty > 1) {
      throw new TrustShellError('certainty must be a number in [0,1]', 400);
    }
    const url = `${this.baseUrl}/api/v1/agents/${encodeURIComponent(agentId)}/score-event`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        llm_provider: opts.llmProvider,
        llm_model: opts.llmModel ?? null,
        certainty: opts.certainty,
        decision_text: opts.decisionText,
        outcome: opts.outcome,
        task_domain: opts.taskDomain,
        prompt: opts.prompt ?? null,
        hallucination_caught: opts.hallucinationCaught ?? null,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new TrustShellError(`submitOutcome failed: ${res.status} ${detail}`.trim(), res.status);
    }
    return res.json();
  }

  /**
   * x402 micropayment hook. Payments are owned by the x402 / ERC-8004 lane — this is a THIN
   * pass-through to repid-engine's `/api/v1/x402` path so the SDK surface is complete. The exact
   * `action` + body shape are defined by the x402 service; this method does not implement payment logic.
   */
  async x402Pay(opts: { action?: string; [k: string]: unknown }): Promise<any> {
    const action = (opts.action as string) ?? 'settle';
    const url = `${this.baseUrl}/api/v1/x402/${encodeURIComponent(action)}`;
    const res = await fetch(url, { method: 'POST', headers: this.getHeaders(), body: JSON.stringify(opts) });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new TrustShellError(`x402Pay (${action}) failed: ${res.status} ${detail}`.trim(), res.status);
    }
    return res.json();
  }
}

export default TrustShell;
