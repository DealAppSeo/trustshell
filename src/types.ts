  export interface TrustShellConfig {
    agentId: string
    apiKey: string
    llmProvider: string
    llmModel?: string
    byokProvider?: string
    engineUrl?: string
    autoVerify?: boolean // If true, report() calls verifyLocally() automatically
  }
  
  export interface Decision {
    text: string
    certainty: number
    prompt?: string // Phase 1.5 ext: supply prompt to trigger Layer 1 agreement
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
    proof_job_id?: string
    // Arc A8: Surface cross-LLM agreement
    cross_llm_agreement_score?: number | null
    cross_llm_provider_count?: number | null
    comma_veto?: boolean
    comma_gap?: number | null
    comma_severity?: string | null
    
    /** Local mathematical verification result (if autoVerify or verifyLocally() called) */
    local_verification?: LocalVerifyResult
    /** Closure to verify the proof for this specific decision locally */
    verifyLocally?: () => Promise<LocalVerifyResult>
  }
  
  export interface LocalVerifyResult {
    verified: boolean
    error: string | null
    proof_size_bytes: number
    verifier_version: string
    elapsed_ms: number
  }

  export interface ProofResult {
    proof_bytes: string
    proof_hash: string
    proof_size_bytes: number
    verified_server_side?: boolean
    statement: Record<string, unknown>
    generated_at?: string
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
