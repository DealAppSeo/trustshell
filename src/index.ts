export interface TrustShellConfig {
  apiKey?: string;
  agentId?: string;
  baseUrl?: string;
}

export interface CompleteOptions {
  tier_preference?: string;
  task_hint?: string;
  max_tokens?: number;
  temperature?: number;
}

export interface CompleteResult {
  answer: string;
  provider: string;
  tier: number;
  tier_used: string;
  tokens_in: number;
  tokens_out: number;
  latency_ms: number;
  cost_estimate_usd: number;
  router_decision: any;
}

export interface RegisterAgentOptions {
  description?: string;
  constitution_text?: string;
  llm_provider?: string;
  llm_model?: string;
  wallet_address?: string;
  is_human?: boolean;
}

export interface AgentRegistration {
  agent_id: string;
  api_key: string;
  starting_score: number;
  tier: string;
  vesting_cliff_ends_at: string;
  vesting_info: string;
  repid_url: string;
  name: string;
  description: string | null;
  repid: number;
  erc8004_token_id: string | null;
  created_at: string;
}

export interface AgentCard {
  agent_id: string;
  name: string;
  description: string | null;
  repid: number;
  erc8004_token_id: string | null;
  total_decisions: number;
  base_sepolia_explorer_url: string | null;
  created_at: string | null;
  last_active_at: string | null;
}

export interface ScoreEventOptions {
  challenge_mode?: 'immediate' | 'time_locked';
  resolution_at?: string;
}

export interface ScoreEventResult {
  new_score: number;
  vested_repid: number;
  vesting_active: boolean;
  delta: number;
  tier: string;
  hal_approved: boolean;
  hal_score: number;
  challenger_courage_bonus: number;
  reward_breakdown: any;
  vdr_count: number;
  hallucination_training_case_id: number | null;
  proof_job_id: string;
}

export interface ProviderStatus {
  name: string;
  healthy: boolean;
  requires_user_key?: boolean;
  default_model: string;
  last_success: string | null;
}

export interface RouteDebugInfo {
  chosen_provider: string;
  chosen_tier: string;
  reason: string;
  candidates_tried: string[];
  current_health: any;
}

export class TrustShellError extends Error {
  constructor(message: string, public status: number, public data?: any) {
    super(message);
    this.name = 'TrustShellError';
  }
}

export class AuthError extends TrustShellError {
  constructor(message: string, data?: any) {
    super(message, 401, data);
    this.name = 'AuthError';
  }
}

export class RateLimitError extends TrustShellError {
  public retryAfter: number;
  constructor(message: string, data?: any, retryAfterMs?: number) {
    super(message, 429, data);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfterMs || 10000;
  }
}

export class ProviderExhaustedError extends TrustShellError {
  constructor(message: string, data?: any) {
    super(message, 503, data);
    this.name = 'ProviderExhaustedError';
  }
}

export class ServerError extends TrustShellError {
  constructor(message: string, status: number, data?: any) {
    super(message, status, data);
    this.name = 'ServerError';
  }
}

export class TrustShell {
  private apiKey?: string;
  private agentId?: string;
  private baseUrl: string;

  constructor(config: TrustShellConfig) {
    this.apiKey = config.apiKey;
    this.agentId = config.agentId;
    this.baseUrl = (config.baseUrl || 'https://repid-engine-production.up.railway.app').replace(/\/$/, '');
  }

  private async request<T>(method: string, path: string, body?: any, retries = 3): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : '/' + path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      let data: any = null;
      if (res.status !== 204) {
        data = await res.json().catch(() => null);
      }

      if (!res.ok) {
        if (res.status === 401) throw new AuthError(data?.error || 'Unauthorized', data);
        if (res.status === 429) {
          const retryAfter = parseInt(res.headers.get('Retry-After') || '10', 10) * 1000;
          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, retryAfter));
            return this.request<T>(method, path, body, retries - 1);
          }
          throw new RateLimitError(data?.error || 'Rate limited', data, retryAfter);
        }
        if (res.status === 503) throw new ProviderExhaustedError(data?.error || 'Service Unavailable', data);
        throw new ServerError(data?.error || 'Server error', res.status, data);
      }

      return data as T;
    } catch (e: any) {
      if (e instanceof TrustShellError) throw e;
      throw new ServerError(e.message, 500);
    }
  }

  async complete(prompt: string, options?: CompleteOptions): Promise<CompleteResult> {
    const body: any = { prompt, ...options };
    if (this.agentId) {
      body.agent_id = this.agentId;
    }
    return this.request<CompleteResult>('POST', '/api/v1/llm/complete', body);
  }

  static async registerAgent(name: string, options?: RegisterAgentOptions, baseUrl?: string): Promise<AgentRegistration> {
    const url = (baseUrl || 'https://repid-engine-production.up.railway.app').replace(/\/$/, '');
    const body = { name, ...options };
    const res = await fetch(`${url}/api/v1/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Registration failed');
    return data as AgentRegistration;
  }

  async getAgentCard(agentId?: string): Promise<AgentCard> {
    const id = agentId || this.agentId;
    if (!id) throw new Error('agentId is required');
    return this.request<AgentCard>('GET', `/api/v1/agents/${id}/card`);
  }

  async scoreEvent(
    decision_text: string,
    outcome: string,
    task_domain: string,
    certainty: number,
    llm_provider: string,
    extra?: Record<string, any>
  ): Promise<ScoreEventResult> {
    const id = this.agentId;
    if (!id) throw new Error('agentId is required for scoreEvent');
    
    const body = {
      decision_text,
      outcome,
      task_domain,
      certainty,
      llm_provider,
      ...extra
    };
    
    return this.request<ScoreEventResult>('POST', `/api/v1/agents-external/${id}/score-event`, body);
  }

  async getProviders(): Promise<{ tier0a: ProviderStatus[], tier1: ProviderStatus[] }> {
    return this.request<{ tier0a: ProviderStatus[], tier1: ProviderStatus[] }>('GET', '/api/v1/llm/providers');
  }

  async getRouteDebug(prompt: string): Promise<RouteDebugInfo> {
    return this.request<RouteDebugInfo>('POST', '/api/v1/llm/route-debug', { prompt });
  }
}
