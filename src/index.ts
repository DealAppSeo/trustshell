import { EventEmitter } from 'events';
import { 
  TrustShellConfig, 
  Decision, 
  RepIDResult, 
  AgentRepID, 
  ProofResult 
} from './types';

const DEFAULT_ENGINE = 'https://repid-engine-production.up.railway.app';

export class TrustShellError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrustShellError';
  }
}

export class TrustShellNetworkError extends TrustShellError {
  constructor(message: string, public cause?: any) {
    super(message);
    this.name = 'TrustShellNetworkError';
  }
}

export class TrustShellAuthError extends TrustShellError {
  constructor(message: string) {
    super(message);
    this.name = 'TrustShellAuthError';
  }
}

export class TrustShellRateLimitError extends TrustShellError {
  constructor(message: string, public retryAfter?: number) {
    super(message);
    this.name = 'TrustShellRateLimitError';
  }
}

export class TrustShellInvalidInputError extends TrustShellError {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'TrustShellInvalidInputError';
  }
}

export class TrustShellTimeoutError extends TrustShellError {
  constructor(message: string, public jobId: string) {
    super(message);
    this.name = 'TrustShellTimeoutError';
  }
}

export class TrustShell extends EventEmitter {
  private config: TrustShellConfig;
  private engineUrl: string;

  constructor(config: TrustShellConfig) {
    super();
    if (!config.agentId) throw new TrustShellInvalidInputError('agentId is required', 'agentId');
    if (!config.apiKey) throw new TrustShellInvalidInputError('apiKey is required', 'apiKey');
    
    this.config = config;
    this.engineUrl = config.engineUrl || DEFAULT_ENGINE;
  }

  async evaluate(
    text: string,
    certainty: number,
    options?: Partial<Decision>
  ): Promise<RepIDResult> {
    if (this.config.byokProvider) {
      const trust = await this.getLLMTrustScore(this.config.byokProvider);
      if (trust !== null && trust < 70) {
        this.emit('byok-warning', {
          provider: this.config.byokProvider,
          trust_score: trust
        });
      }
    }
    return this.report({ text, certainty, ...options });
  }

  async report(decision: Decision): Promise<RepIDResult> {
    let res: Response;
    try {
      res = await fetch(
        `${this.engineUrl}/api/v1/agents/${this.config.agentId}/score-event`,
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
            alignment_category: decision.alignmentCategory || 'other',
            economic_impact_usdc: decision.economicImpactUSDC || 0,
            hallucination_caught: decision.hallucinationCaught || false
          })
        }
      );
    } catch (e: any) {
      throw new TrustShellNetworkError(`Network request failed: ${e.message}`, e);
    }

    if (!res.ok) {
      if (res.status === 401) throw new TrustShellAuthError('Invalid API Key or unauthorized access');
      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After');
        throw new TrustShellRateLimitError('Rate limit exceeded', retryAfter ? parseInt(retryAfter, 10) : undefined);
      }
      if (res.status >= 400 && res.status < 500) {
        throw new TrustShellInvalidInputError(`Invalid request: ${res.status}`);
      }
      throw new TrustShellNetworkError(`Engine returned error: ${res.status}`);
    }

    const data = await res.json();
    return {
      approved: data.hal_approved,
      hal_score: data.hal_score,
      repid_delta: data.delta,
      new_score: data.new_score,
      vested_repid: data.vested_repid,
      vesting_active: data.vesting_active,
      tier: data.tier,
      vdr_count: data.vdr_count,
      proof_job_id: data.proof_job_id,
      veto_reason: data.hal_approved ? undefined : 'HAL veto: dissonance too high'
    };
  }

  async waitForProof(
    jobId: string,
    options?: {
      timeoutMs?: number;
      intervalMs?: number;
      signal?: AbortSignal;
    }
  ): Promise<ProofResult> {
    const timeout = options?.timeoutMs || 30000;
    const interval = options?.intervalMs || 1000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (options?.signal?.aborted) {
        throw new Error('Operation aborted');
      }

      try {
        const res = await fetch(`${this.engineUrl}/api/v1/proof/${jobId}/status`, {
          headers: { Authorization: `Bearer ${this.config.apiKey}` }
        });

        if (res.ok) {
          const data = await res.json();
          if (data.status === 'verified' || data.status === 'failed') {
            return {
              jobId,
              status: data.status,
              proof: data.proof,
              proofChain: data.proof_chain,
              error: data.error
            };
          }
        }
      } catch (e: any) {
        // Continue polling on transient network errors
      }

      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new TrustShellTimeoutError(`Proof polling timed out after ${timeout}ms`, jobId);
  }

  async getRepID(): Promise<AgentRepID> {
    const res = await fetch(
      `${this.engineUrl}/api/v1/agents/${this.config.agentId}/repid`
    );
    if (!res.ok) throw new TrustShellNetworkError(`Failed to fetch RepID: ${res.status}`);
    return res.json();
  }

  async getLLMTrustScore(provider: string): Promise<number | null> {
    try {
      const res = await fetch(`${this.engineUrl}/api/v1/llm-trust`);
      if (!res.ok) return null;
      const data = await res.json();
      const entry = data.find((d: any) => d.llm_provider === provider);
      return entry ? entry.trust_score_pct : null;
    } catch {
      return null;
    }
  }
}

export * from './types';
