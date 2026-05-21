  import { EventEmitter } from 'events';
  // evaluateLocally removed in v0.2.0
  import {
    TrustShellConfig, Decision, RepIDResult, AgentRepID, ProofResult, LocalVerifyResult,
    LifecycleConfig, RegisterResult, VerifyResult, AgentStatusView, AgentTier
  } from './types';
  import { verifyProofLocal } from './local-verify';

  const DEFAULT_ENGINE =
    'https://repid-engine-production.up.railway.app';

  // --- v0.4.0 CLAUDE-RULE-8 resilience primitives (lifecycle API only) ---
  // The legacy evaluate/report/getProof/getRepID/getLLMTrustScore methods
  // predate RULE-8 and use bare fetch; they are flagged for a follow-up
  // migration (see CC_TRUSTSHELL_PUBLISH_READINESS.md). The lifecycle API
  // below is RULE-8 compliant from the start: AbortSignal timeout +
  // exponential backoff + circuit breaker.
  const HTTP_TIMEOUT_MS = 10_000;
  const RETRY_DELAYS_MS = [1000, 4000, 16000, 64000, 256000];
  const CIRCUIT_OPEN_THRESHOLD = 5;
  const CIRCUIT_OPEN_SLEEP_MS = 5 * 60 * 1000;

  let _consecutiveFailures = 0;
  let _circuitOpenUntil = 0;

  async function resilientFetch(url: string, init: RequestInit, label: string): Promise<Response> {
    if (_circuitOpenUntil > Date.now()) {
      throw new Error(`circuit open: ${label} (cool-down until ${new Date(_circuitOpenUntil).toISOString()})`);
    }
    let lastErr: unknown;
    for (let attempt = 1; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
      try {
        const res = await fetch(url, { ...init, signal: ctrl.signal });
        clearTimeout(timer);
        // 4xx are semantic (auth, validation, conflict) — return to caller, not a transport retry
        if (res.status >= 400 && res.status < 500) {
          _consecutiveFailures = 0;
          return res;
        }
        if (!res.ok) throw new Error(`${label} HTTP ${res.status}`);
        _consecutiveFailures = 0;
        return res;
      } catch (err) {
        clearTimeout(timer);
        lastErr = err;
        if (attempt < RETRY_DELAYS_MS.length) {
          await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]));
        }
      }
    }
    _consecutiveFailures += 1;
    if (_consecutiveFailures >= CIRCUIT_OPEN_THRESHOLD) {
      _circuitOpenUntil = Date.now() + CIRCUIT_OPEN_SLEEP_MS;
    }
    throw lastErr instanceof Error ? lastErr : new Error(`${label} failed`);
  }

  function isLifecycleConfig(c: TrustShellConfig | LifecycleConfig): c is LifecycleConfig {
    return (c as LifecycleConfig).agentName !== undefined && (c as LifecycleConfig).wallet !== undefined;
  }

  export class TrustShell extends EventEmitter {
    private config: TrustShellConfig | LifecycleConfig;
    private engineUrl: string;

    // v0.4.0 lifecycle state (resolved in-band by register(); cached for agentStatus)
    private _agentId: string | null;
    private _apiKey: string | null;
    private _testMode: boolean;
    private _status: AgentStatusView;

    constructor(config: TrustShellConfig | LifecycleConfig) {
      super();
      this.config = config;
      this.engineUrl =
        (config as TrustShellConfig).engineUrl ||
        (config as LifecycleConfig).apiUrl ||
        DEFAULT_ENGINE;
      this._testMode = (config as LifecycleConfig).testMode === true;
      // Legacy mode: agentId/apiKey present immediately. Lifecycle mode: null until register().
      this._agentId = (config as TrustShellConfig).agentId ?? null;
      this._apiKey = (config as TrustShellConfig).apiKey ?? null;
      this._status = { tier: 'PROBATIONARY', repid: 0, onChain: false, tokenId: null, state: 1 };
    }
    
    async evaluate(
      text: string, 
      certainty: number,
      options?: Partial<Decision>
    ): Promise<RepIDResult> {
      // Removed local HAL pre-check: trustshell v0.2 relies on repid-engine's 5-signal extractor.
      // BYOK trust score warning
      const byokProvider = (this.config as TrustShellConfig).byokProvider;
      if (byokProvider) {
        const trust = await this.getLLMTrustScore(byokProvider);
        if (trust !== null && trust < 70) {
          this.emit('byok-warning', {
            provider: byokProvider,
            trust_score: trust
          });
        }
      }
      // Report to repid-engine
      return this.report({ text, certainty, ...options });
    }
    
    private async handleAuthError(res: Response): Promise<void> {
      if (res.status === 401) {
        throw new Error('Score event failed: 401 Unauthorized. Get a free API key at https://repid.dev/start');
      }
    }

    /**
     * Submit a decision for HAL evaluation and RepID updates.
     * Handles 403 (Constitutional block) as a valid semantic path.
     */
    async report(decision: Decision): Promise<RepIDResult> {
      const cfg = this.config as TrustShellConfig;
      const res = await fetch(
        `${this.engineUrl}/api/v1/agents/`
        + `${cfg.agentId}/score-event`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cfg.apiKey}`
          },
          body: JSON.stringify({
            llm_provider: cfg.llmProvider,
            llm_model: cfg.llmModel,
            certainty: decision.certainty,
            decision_text: decision.text,
            prompt: decision.prompt, // Trigger Layer 1 cross-LLM agreement
            outcome: 'submitted',
            task_domain: decision.taskDomain || 'general',
            alignment_category: 
              decision.alignmentCategory || 'other',
            economic_impact_usdc: 
              decision.economicImpactUSDC || 0,
            hallucination_caught: 
              decision.hallucinationCaught || false
          })
        }
      );
      
      if (!res.ok) {
        await this.handleAuthError(res);
        if (res.status === 403) {
          const data = await res.json();
          return {
            approved: false,
            hal_score: data.hal_score || 0,
            repid_delta: 0,
            new_score: 0,
            vesting_active: false,
            tier: 'PROBATIONARY',
            vdr_count: 0,
            veto_reason: data.reason || 'Constitutional block',
            comma_veto: data.comma_veto,
            comma_gap: data.comma_gap,
            comma_severity: data.comma_severity
          };
        }
        throw new Error(`Score event failed: ${res.status}`);
      }
      
      const data = await res.json();
      const jobId = data.proof_job_id;

      const result: RepIDResult = {
        approved: data.hal_approved,
        hal_score: data.hal_score,
        repid_delta: data.delta,
        new_score: data.new_score,
        vested_repid: data.vested_repid,
        vesting_active: data.vesting_active,
        tier: data.tier,
        vdr_count: data.vdr_count,
        proof_job_id: jobId,
        veto_reason: data.hal_approved ? undefined : 'HAL veto: dissonance too high',
        // Arc A8: Surface cross-LLM agreement
        cross_llm_agreement_score: data.cross_llm_agreement_score,
        cross_llm_provider_count: data.cross_llm_provider_count,
        comma_veto: data.comma_veto,
        comma_gap: data.comma_gap,
        comma_severity: data.comma_severity,

        // P2.4 verifyLocally closure
        verifyLocally: async () => {
          if (!jobId) throw new Error('No proof_job_id available for this decision');
          const proof = await this.getProof(jobId);
          return verifyProofLocal(proof);
        }
      };

      // P2.5 autoVerify handling
      if (cfg.autoVerify && jobId) {
        try {
          result.local_verification = await result.verifyLocally!();
        } catch (e) {
          console.warn('[TrustShell] autoVerify failed:', e);
        }
      }
      
      return result;
    }
    
    async getRepID(): Promise<AgentRepID> {
      const res = await fetch(
        `${this.engineUrl}/api/v1/agents/`
        + `${(this.config as TrustShellConfig).agentId}/repid`
      );
      if (!res.ok) {
        await this.handleAuthError(res);
        throw new Error('Failed to fetch RepID');
      }
      return res.json();
    }
    
    /**
     * Retrieve global trust score for an LLM provider.
     * Case-insensitive.
     */
    async getLLMTrustScore(
      provider: string
    ): Promise<number | null> {
      const normalizedProvider = provider.toLowerCase();
      try {
        const res = await fetch(
          `${this.engineUrl}/api/v1/llm-trust`
        );
        if (!res.ok) {
          await this.handleAuthError(res);
          return null;
        }
        const data = await res.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const entry = data.find(
          (d: any) => d.llm_provider.toLowerCase() === normalizedProvider
        );
        return entry ? entry.trust_score_pct : null;
      } catch { return null; }
    }

    /**
     * Retrieve the Plonky3 STARK proof for a previously evaluated decision.
     * Returns the proof bytes (base64), commitment hash, and verification result.
     */
    async getProof(jobId: string): Promise<ProofResult> {
      // P1.1 endpoint update
      const res = await fetch(
        `${this.engineUrl}/api/v1/repid/proof/${jobId}`
      );
      if (!res.ok) {
        await this.handleAuthError(res);
        throw new Error(`Failed to fetch proof: ${res.status}`);
      }
      return res.json();
    }

    /**
     * Verify a proof locally. (Public API proxy to local-verify)
     */
    async verifyProofLocal(proof: ProofResult): Promise<LocalVerifyResult> {
      return verifyProofLocal(proof);
    }

    // ====================================================================
    // v0.4.0 LIFECYCLE API (additive) — register / verifyOutput / agentStatus
    //
    // The 4-line quickstart surface. Wallet-keyed, in-band. Orchestrates
    // three repid-engine endpoints: POST /api/v1/agents/register,
    // POST /api/v1/agents/:id/score-event, POST /api/v1/agents/:id/mint.
    // "Mint on first verified action" is SDK-side orchestration: register()
    // does NOT mint; the first approved verifyOutput() triggers the mint.
    // All HTTP calls here are CLAUDE-RULE-8 compliant via resilientFetch.
    // ====================================================================

    /**
     * Register the agent locally (off-chain). Returns the agent id and
     * state 1. Does NOT mint — the first approved verifyOutput() does that.
     * Requires lifecycle config ({ agentName, wallet }).
     *
     * @example
     * const trust = new TrustShell({ agentName: 'my-bot', wallet: '0xabc...' });
     * const { agentId, state } = await trust.register(); // state === 1
     */
    async register(): Promise<RegisterResult> {
      if (!isLifecycleConfig(this.config)) {
        throw new Error('register() requires lifecycle config: new TrustShell({ agentName, wallet })');
      }
      const cfg = this.config;
      const res = await resilientFetch(
        `${this.engineUrl}/api/v1/agents/register`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent_name: cfg.agentName,
            wallet_address: cfg.wallet,
            llm_provider: cfg.llmProvider || 'unknown',
          }),
        },
        'register'
      );
      if (!res.ok) {
        throw new Error(`Registration failed: ${res.status}`);
      }
      const data = await res.json();
      this._agentId = data.agent_id;
      this._apiKey = data.api_key;
      this._status = {
        tier: (data.tier as AgentTier) || 'PROBATIONARY',
        repid: typeof data.repid === 'number' ? data.repid : (data.starting_score ?? 0),
        onChain: false,
        tokenId: null,
        state: 1,
      };
      return { agentId: data.agent_id, state: 1 };
    }

    /**
     * Verify an agent output through the HAL pipeline. On the FIRST approved
     * verification (when not in testMode and not yet on-chain), the SDK
     * triggers the agent's ERC-8004 mint on Base Sepolia — that's the
     * "mint on first verified action" flow. Returns the verdict, RepID delta,
     * proof URI, and (if minted this call) the token id.
     *
     * @example
     * const r = await trust.verifyOutput({ task: 'What is 2+2?', output: 'It is 4.' });
     * if (r.mintedThisCall) console.log('minted token', r.tokenId);
     */
    async verifyOutput(input: { task: string; output: string }): Promise<VerifyResult> {
      if (!this._agentId || !this._apiKey) {
        throw new Error('Call register() before verifyOutput().');
      }
      const llmProvider = (this.config as LifecycleConfig).llmProvider
        || (this.config as TrustShellConfig).llmProvider
        || 'unknown';
      const llmModel = (this.config as LifecycleConfig).llmModel
        || (this.config as TrustShellConfig).llmModel;

      // 1. Score event (HAL eval + RepID + proof job). task → prompt triggers
      //    the Layer-1 cross-LLM agreement path; output → decision_text.
      const scoreRes = await resilientFetch(
        `${this.engineUrl}/api/v1/agents/${this._agentId}/score-event`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this._apiKey}`,
          },
          body: JSON.stringify({
            llm_provider: llmProvider,
            llm_model: llmModel,
            certainty: 0.9,
            decision_text: input.output,
            prompt: input.task,
            outcome: 'submitted',
            task_domain: 'general',
            alignment_category: 'task_completion',
          }),
        },
        'verifyOutput.score-event'
      );

      // 403 = constitutional block (valid semantic path, not an error)
      let scoreData: any;
      if (scoreRes.status === 403) {
        scoreData = await scoreRes.json();
        this._status = {
          ...this._status,
          tier: (scoreData.tier as AgentTier) || this._status.tier,
        };
        return {
          approved: false,
          zkpProofUri: null,
          repidDelta: 0,
          newTier: this._status.tier,
          mintedThisCall: false,
          tokenId: this._status.tokenId,
        };
      }
      if (!scoreRes.ok) {
        throw new Error(`verifyOutput score-event failed: ${scoreRes.status}`);
      }
      scoreData = await scoreRes.json();

      const approved: boolean = scoreData.hal_approved === true;
      const repidDelta: number = typeof scoreData.delta === 'number' ? scoreData.delta : 0;
      const newTier: string = scoreData.tier || this._status.tier;
      const proofJobId: string | undefined = scoreData.proof_job_id;
      const zkpProofUri: string | null = proofJobId
        ? `${this.engineUrl}/api/v1/repid/proof/${proofJobId}`
        : null;

      this._status = {
        ...this._status,
        tier: (newTier as AgentTier),
        repid: typeof scoreData.new_score === 'number' ? scoreData.new_score : this._status.repid,
      };

      // 2. Mint on first verified action: approved + not on-chain + not testMode.
      let mintedThisCall = false;
      let tokenId: number | null = this._status.tokenId;
      if (approved && !this._status.onChain && !this._testMode) {
        try {
          const mintRes = await resilientFetch(
            `${this.engineUrl}/api/v1/agents/${this._agentId}/mint`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this._apiKey}`,
              },
              body: JSON.stringify({}),
            },
            'verifyOutput.mint'
          );
          if (mintRes.ok) {
            const mintData = await mintRes.json();
            const rawTokenId = mintData.tokenId ?? mintData.token_id ?? mintData.erc8004_token_id ?? null;
            tokenId = rawTokenId !== null ? Number(rawTokenId) : null;
            mintedThisCall = tokenId !== null;
            this._status = {
              ...this._status,
              onChain: mintedThisCall,
              tokenId,
              state: mintedThisCall ? 2 : this._status.state,
            };
          } else if (mintRes.status === 409) {
            // already minted — reconcile state without erroring
            this._status = { ...this._status, onChain: true };
          }
          // other non-2xx: leave off-chain; verification still succeeded
        } catch (e) {
          // Mint is best-effort on this call; verification result stands.
          // Next approved verifyOutput() retries the mint.
          console.warn('[TrustShell] mint-on-first-action deferred:', e instanceof Error ? e.message : e);
        }
      }

      return {
        approved,
        zkpProofUri,
        repidDelta,
        newTier,
        mintedThisCall,
        tokenId,
      };
    }

    /**
     * Current cached lifecycle status. Reflects the last register()/
     * verifyOutput() response. Does not make a network call.
     */
    get agentStatus(): AgentStatusView {
      return { ...this._status };
    }
  }

  export * from './types';
