/**
 * @hyperdag/trustshell
 * Trust scoring SDK for AI — add HAL evaluation to any LLM app in 3 lines.
 * 
 * From S-SDK1 spec + S-BUILD implementation.
 */

import { LocalHalProvider, type HalProvider } from './hal-local';

export type HalMode = 'remote' | 'local-first' | 'local-only';

export interface TrustShellConfig {
  apiKey?: string;
  apiUrl?: string;
  timeout?: number;
  /**
   * Scoring mode (D-017). Default 'remote' preserves the existing SDK behavior.
   * - 'remote'      : hosted repid-engine quorum HAL only (original behavior).
   * - 'local-first' : score locally (PRIMARY); fall back to repid-engine only if
   *                   the local provider is unavailable/throws.
   * - 'local-only'  : never touch the network.
   */
  mode?: HalMode;
  /** Override the local HAL provider (defaults to the built-in heuristic). */
  localProvider?: HalProvider;
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
  private mode: HalMode;
  private local: HalProvider;

  constructor(config: TrustShellConfig = {}) {
    this.config = config;
    this.baseUrl = config.apiUrl ||
      (typeof process !== 'undefined' ? process.env?.TRUSTSHELL_API_URL : undefined) ||
      'https://repid-engine-production.up.railway.app';
    this.mode = config.mode || 'remote';
    this.local = config.localProvider || new LocalHalProvider();
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

  /**
   * Score a response. Dispatches by `mode` (D-017):
   * - 'remote'      → hosted repid-engine quorum HAL (default; original behavior).
   * - 'local-only'  → local heuristic, never touches the network.
   * - 'local-first' → local PRIMARY; falls back to repid-engine only if the
   *                   local provider is unavailable/throws.
   */
  async score(response: string, options: ScoreOptions = {}): Promise<ScoreResult> {
    if (this.mode === 'local-only') {
      return this.local.score(response, options);
    }
    if (this.mode === 'local-first') {
      try {
        return await this.local.score(response, options);
      } catch {
        return this.scoreRemote(response, options); // fallback only if local unavailable
      }
    }
    return this.scoreRemote(response, options);
  }

  /** Score locally, in-process, with no network call (D-017 local PRIMARY). */
  async scoreLocal(response: string, options: ScoreOptions = {}): Promise<ScoreResult> {
    return this.local.score(response, options);
  }

  /** Score via the hosted repid-engine quorum HAL. */
  async scoreRemote(response: string, options: ScoreOptions = {}): Promise<ScoreResult> {
    const url = `${this.baseUrl}/api/v1/hal/evaluate`;

    const body = {
      response,
      prompt: options.prompt,
      provider: options.provider || 'unknown',
      model: options.model,
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

      const trustScore = Math.round((1 - (data.hal_score || 0)) * 100);

      return {
        trustScore,
        halScore: data.hal_score,
        signals: {
          harmProbability: data.hal_signals?.harm_probability ?? 0,
          epistemicUncertainty: data.hal_signals?.epistemic_uncertainty ?? 0,
          evidenceQuality: data.hal_signals?.evidence_quality ?? 0,
          scopeAppropriateness: data.hal_signals?.scope_appropriateness ?? 0,
          certaintyAtClaim: data.hal_signals?.certainty_at_claim ?? 0,
        },
        verdict: data.hal_verdict || 'PASS',
        flaggedHallucination: !!data.hal_flagged_hallucination,
        provider: data.provider_used || options.provider || 'unknown',
        model: data.model_used || options.model || 'unknown',
        proofHash: data.proof_hash,
        sessionId: data.session_id,
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

/**
 * createHDP — the D-017 HAL Decision Provider slot: a TrustShell wired
 * **local-PRIMARY, repid-engine-FALLBACK**. Use this when you want fast,
 * offline-capable scoring that only reaches the network if the local scorer
 * is unavailable.
 *
 * ```ts
 * const hdp = createHDP();                 // local primary, remote fallback
 * const r = await hdp.score('...');        // no network unless local fails
 * ```
 */
export function createHDP(config: TrustShellConfig = {}): TrustShell {
  return new TrustShell({ ...config, mode: config.mode || 'local-first' });
}

export { LocalHalProvider, localHeuristicScore } from './hal-local';
export type { HalProvider } from './hal-local';

export default TrustShell;
