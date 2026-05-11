  import { EventEmitter } from 'events';
  // evaluateLocally removed in v0.2.0
  import { TrustShellConfig, Decision, RepIDResult, AgentRepID, ProofResult, LocalVerifyResult } from './types';
  import { verifyProofLocal } from './local-verify';
  
  const DEFAULT_ENGINE = 
    'https://repid-engine-production.up.railway.app';
  
  export class TrustShell extends EventEmitter {
    private config: TrustShellConfig;
    private engineUrl: string;
    
    constructor(config: TrustShellConfig) {
      super();
      this.config = config;
      this.engineUrl = config.engineUrl || DEFAULT_ENGINE;
    }
    
    async evaluate(
      text: string, 
      certainty: number,
      options?: Partial<Decision>
    ): Promise<RepIDResult> {
      // Removed local HAL pre-check: trustshell v0.2 relies on repid-engine's 5-signal extractor.
      // BYOK trust score warning
      if (this.config.byokProvider) {
        const trust = await this.getLLMTrustScore(
          this.config.byokProvider
        );
        if (trust !== null && trust < 70) {
          this.emit('byok-warning', {
            provider: this.config.byokProvider,
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
      const res = await fetch(
        `${this.engineUrl}/api/v1/agents/`
        + `${this.config.agentId}/score-event`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`
          },
          body: JSON.stringify({
            llm_provider: this.config.llmProvider,
            llm_model: this.config.llmModel,
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
      if (this.config.autoVerify && jobId) {
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
        + `${this.config.agentId}/repid`
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
  }
  
  export * from './types';
