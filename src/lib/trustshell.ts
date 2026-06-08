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
}

export interface RepIDResult {
  agentId: string;
  repid: number;
  tier: string;
  lastAnchorTx: string | null;
  latestProofHash: string | null;
}

/** A RepID range proof + its public statement, ready for client-side WASM verification. */
export interface ProofPresentation {
  agentId: string;
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

  constructor(config: TrustShellConfig = {}) {
    this.config = config;
    this.baseUrl = config.apiUrl ||
      (typeof process !== 'undefined' ? process.env?.TRUSTSHELL_API_URL : undefined) ||
      'https://repid-engine-production.up.railway.app';
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
      repid: data.repid || data.current_repid,
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
    return {
      ok: r.verdict !== 'VETO',
      verdict: r.verdict,
      trustScore: r.trustScore,
      halScore: r.halScore,
      soft: r.verdict === 'FLAG',
      signals: r.signals,
    };
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
    opts: { verify?: boolean } = {},
  ): Promise<ProofPresentation> {
    const url = `${this.baseUrl}/api/v1/repid/${encodeURIComponent(agentId)}/proof`;
    const res = await fetch(url, { headers: this.getHeaders() });
    if (!res.ok) {
      throw new TrustShellError(`Proof lookup failed: ${res.status}`, res.status);
    }
    const data = await res.json();
    const presentation: ProofPresentation = {
      agentId,
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
}

export default TrustShell;
