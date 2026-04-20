  import { EventEmitter } from 'events';
  import { evaluateLocally } from './evaluator';
  import { TrustShellConfig, Decision, RepIDResult, AgentRepID } from './types';
  
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
      // Local HAL pre-check (no network, instant)
      const local = evaluateLocally(
        certainty, 
        this.config.profile
      );
      if (!local.approved) {
        return {
          approved: false,
          hal_score: local.dissonance,
          repid_delta: 0, new_score: 0,
          vesting_active: false,
          tier: 'CUSTODIED_DBT', vdr_count: 0,
          veto_reason: 'HAL veto: dissonance too high'
        };
      }
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
        throw new Error(`Score event failed: ${res.status}`);
      }
      return res.json();
    }
    
    async getRepID(): Promise<AgentRepID> {
      const res = await fetch(
        `${this.engineUrl}/api/v1/agents/`
        + `${this.config.agentId}/repid`
      );
      if (!res.ok) throw new Error('Failed to fetch RepID');
      return res.json();
    }
    
    async getLLMTrustScore(
      provider: string
    ): Promise<number | null> {
      try {
        const res = await fetch(
          `${this.engineUrl}/api/v1/llm-trust`
        );
        const data = await res.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const entry = data.find(
          (d: any) => d.llm_provider === provider
        );
        return entry ? entry.trust_score_pct : null;
      } catch { return null; }
    }
  }
  
  export * from './types';
  export { evaluateLocally } from './evaluator';
