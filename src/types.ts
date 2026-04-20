  export interface TrustShellConfig {
    agentId: string
    apiKey: string
    llmProvider: string
    llmModel?: string
    profile?: 'conservative'|'balanced'|'pro'
    byokProvider?: string
    engineUrl?: string
  }
  
  export interface Decision {
    text: string
    certainty: number
    taskDomain?: string
    alignmentCategory?: string
    economicImpactUSDC?: number
    hallucinationCaught?: boolean
  }
  
  export interface RepIDResult {
    approved: boolean
    hal_score: number
    repid_delta: number
    new_score: number
    vested_repid?: number
    vesting_active: boolean
    tier: string
    vdr_count: number
    veto_reason?: string
  }
  
  export interface AgentRepID {
    agent_name: string
    current_repid: number
    tier: string
    vdr_count: number
    wisdom_score: number
    domain_accuracy: Record<string, unknown>
    vesting_cliff_ends_at?: string
    is_human: boolean
    last_updated: string
  }
