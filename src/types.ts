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

  // --- v0.4.0 lifecycle API (additive; coexists with the decision-scoring API above) ---

  export type AgentTier =
    | 'PROBATIONARY'
    | 'EARNING'
    | 'ESTABLISHED'
    | 'AUTONOMOUS'
    | 'VETERAN'

  /**
   * Agent lifecycle state (1-7). 1 = locally registered (off-chain).
   * Higher states track on-chain identity + earned standing. V0.4.0 ships
   * the PROBATIONARY baseline: register → first verified action → mint.
   */
  export type AgentLifecycleState = 1 | 2 | 3 | 4 | 5 | 6 | 7

  /**
   * Config for the lifecycle API (register / verifyOutput / agentStatus).
   * Wallet-keyed, in-band registration — no prior repid.dev/start step needed.
   */
  export interface LifecycleConfig {
    /** Human-readable agent name. */
    agentName: string
    /** 0x... Base Sepolia wallet that will own the ERC-8004 token. */
    wallet: string
    /** Override the engine URL. Defaults to repid-engine production. */
    apiUrl?: string
    /** Skip the ERC-8004 mint (dev/CI). mintedThisCall stays false; no gas spent. */
    testMode?: boolean
    /** LLM provider attribution for score events. Defaults to 'unknown'. */
    llmProvider?: string
    /** LLM model attribution. */
    llmModel?: string
  }

  export interface RegisterResult {
    agentId: string
    /** 1 = locally registered, not on-chain yet. */
    state: 1
  }

  export interface VerifyResult {
    approved: boolean
    /** R2/HTTP URI of the Plonky3 ZKP proof for this verification, if generated. */
    zkpProofUri: string | null
    repidDelta: number
    newTier: string
    /** true if this call triggered the agent's first ERC-8004 mint. */
    mintedThisCall: boolean
    tokenId: number | null
  }

  export interface AgentStatusView {
    tier: AgentTier
    repid: number
    onChain: boolean
    tokenId: number | null
    state: AgentLifecycleState
  }
