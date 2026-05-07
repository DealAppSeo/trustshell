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
export declare class TrustShellError extends Error {
    status: number;
    data?: any | undefined;
    constructor(message: string, status: number, data?: any | undefined);
}
export declare class AuthError extends TrustShellError {
    constructor(message: string, data?: any);
}
export declare class RateLimitError extends TrustShellError {
    retryAfter: number;
    constructor(message: string, data?: any, retryAfterMs?: number);
}
export declare class ProviderExhaustedError extends TrustShellError {
    constructor(message: string, data?: any);
}
export declare class ServerError extends TrustShellError {
    constructor(message: string, status: number, data?: any);
}
export declare class TrustShell {
    private apiKey?;
    private agentId?;
    private baseUrl;
    constructor(config: TrustShellConfig);
    private request;
    complete(prompt: string, options?: CompleteOptions): Promise<CompleteResult>;
    static registerAgent(name: string, options?: RegisterAgentOptions, baseUrl?: string): Promise<AgentRegistration>;
    getAgentCard(agentId?: string): Promise<AgentCard>;
    scoreEvent(decision_text: string, outcome: string, task_domain: string, certainty: number, llm_provider: string, extra?: Record<string, any>): Promise<ScoreEventResult>;
    getProviders(): Promise<{
        tier0a: ProviderStatus[];
        tier1: ProviderStatus[];
    }>;
    getRouteDebug(prompt: string): Promise<RouteDebugInfo>;
}
