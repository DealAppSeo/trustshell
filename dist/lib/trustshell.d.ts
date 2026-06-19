/**
 * @hyperdag/trustshell
 * Trust scoring SDK for AI — add HAL evaluation to any LLM app in 3 lines.
 *
 * From S-SDK1 spec + S-BUILD implementation.
 */
export interface TrustShellConfig {
    apiKey?: string;
    apiUrl?: string;
    timeout?: number;
}
export interface ScoreOptions {
    prompt?: string;
    provider?: string;
    model?: string;
}
export interface ScoreResult {
    trustScore: number;
    halScore: number;
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
    mode?: string;
    providersUsed?: number;
    familiesUsed?: number;
    agreement?: number;
    /** Human-readable reason for the verdict (quorum + threshold summary). */
    decisionReason: string;
    /** Per-provider evidence — "provider:VERDICT (note)" — the WHY behind the verdict. */
    evidence: string[];
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
export interface VerifyOutputResult {
    /** true when HAL did not hard-veto the output (PASS or soft FLAG). */
    ok: boolean;
    verdict: 'PASS' | 'FLAG' | 'VETO';
    trustScore: number;
    halScore: number;
    /** present when HAL soft-flagged rather than vetoed (e.g. opinion/time-sensitive). */
    soft: boolean;
    signals: ScoreResult['signals'];
    /** Human-readable reason for the verdict. */
    decisionReason: string;
    /** Per-provider evidence behind the verdict (e.g. "mistral:FALSE (Eiffel Tower is in Paris)"). */
    evidence: string[];
}
export interface RepIDResult {
    agentId: string;
    repid: number;
    tier: string;
    lastAnchorTx: string | null;
    latestProofHash: string | null;
}
/** Reveal tiers (ZKP_REVEAL_TIERS). `postcard` is production-real; others are capability-gated. */
export type ProofTier = 'postcard' | 'envelope' | 'letter' | 'package';
/** A RepID range proof + its public statement, ready for client-side WASM verification. */
export interface ProofPresentation {
    agentId: string;
    /** Which reveal tier produced this proof. */
    tier: ProofTier;
    /** base64-encoded Plonky3 proof bytes (empty for legacy sha256 stubs). */
    proofBytes: string;
    scheme: string | null;
    statement: {
        agent_id: string;
        repid_score: number;
        threshold: number;
        tier: string;
    } | null;
    createdAt: string | null;
    /** populated by presentProof({ verify: true }) — client-side WASM verification result. */
    verification?: {
        verified: boolean;
        error: string | null;
        verifierVersion: string;
    };
}
/** Onboarding (custodian + agent). Web3 is DEFERRED: the human custodian is identified by a
 *  custodial address; a real wallet attaches later via BYOK (wallet_address + byok_provider). */
export interface OnboardOptions {
    agentName: string;
    /** the human custodian's address (custodial/embedded by default; a real EVM wallet via BYOK later). */
    conservatorAddress: string;
    /** the AGENT row's is_human (default false — the custodian is the human, the agent is not). */
    isHuman?: boolean;
    /** the agent's embedded/custodial wallet address; null until BYOK attaches a real one. */
    walletAddress?: string | null;
    /** default = free OSS via the LiteLLM gateway (no key needed). */
    llmProvider?: string;
    llmModel?: string;
    /** BYOK — set when the custodian brings their own provider key. */
    byokProvider?: string;
}
export interface OnboardResult {
    agentId: string;
    /** shown ONCE — save it; the SDK uses it for submitOutcome. */
    apiKey: string;
    conservatorAddress: string;
    repid: number;
    tier: string;
    repidUrl?: string;
}
export interface SubmitOutcomeOptions {
    llmProvider: string;
    /** the agent's certainty at decision time, in [0,1]. */
    certainty: number;
    decisionText: string;
    /** e.g. 'success' | 'failure' | 'fulfilled'. */
    outcome: string;
    taskDomain: string;
    llmModel?: string;
    prompt?: string;
    hallucinationCaught?: boolean;
}
export declare class TrustShellError extends Error {
    status: number;
    constructor(message: string, status: number);
}
export declare class TrustShell {
    private config;
    private baseUrl;
    private listeners;
    constructor(config?: TrustShellConfig);
    /**
     * Construct a TrustShell and confirm the backend is reachable (real connectivity check, not a
     * stub). Returns the client; `health` reflects the live `/health` probe so callers can fail fast.
     */
    static init(config?: TrustShellConfig): Promise<{
        client: TrustShell;
        health: {
            ok: boolean;
            status?: string;
            error?: string;
        };
    }>;
    /**
     * Subscribe to client-side lifecycle events emitted when SDK calls complete. Real (not faked):
     * the SDK has no server push channel, so these fire locally on `verdict` (after verifyOutput) and
     * `proof` (after presentProof). Returns an unsubscribe fn. Server-streamed events are a roadmap item.
     */
    subscribe(event: 'verdict' | 'proof', handler: (payload: any) => void): () => void;
    private emit;
    private getHeaders;
    score(response: string, options?: ScoreOptions): Promise<ScoreResult>;
    verify(agentId: string): Promise<VerifyResult>;
    /**
     * Verify an agent output through HAL and return a simple ok/verdict.
     * `ok` is true unless HAL hard-vetoed (so a category-aware soft FLAG still passes).
     */
    verifyOutput(output: string, options?: ScoreOptions): Promise<VerifyOutputResult>;
    /** Fetch an agent's current RepID + tier (public read; no API key required). */
    getRepID(agentId: string): Promise<RepIDResult>;
    /**
     * Fetch an agent's latest RepID range proof and (optionally) verify it client-side
     * with the bundled WASM verifier — "trust math, not the server."
     *
     * Client-side verification requires @hyperdag/proof-verifier (peer dependency); the
     * proof statement is the agent-bound tuple {agent_id, threshold, repid_score}.
     */
    presentProof(agentId: string, opts?: {
        verify?: boolean;
        tier?: ProofTier;
        allowExperimentalTiers?: boolean;
    }): Promise<ProofPresentation>;
    /** Client-side WASM verification of a proof against its statement. */
    private verifyProofLocally;
    audit(table?: string): Promise<AuditResult>;
    /**
     * HAL-check any text through the cross-provider quorum (the real fact-check path).
     * Clean product name for `verifyOutput`; returns ok/verdict/trustScore + per-provider evidence.
     * No API key required (public read). Default providers are free OSS via the LiteLLM gateway.
     */
    halCheck(text: string, options?: ScoreOptions): Promise<VerifyOutputResult>;
    /**
     * Onboard a custodian + agent in one call — a thin client over repid-engine `POST /api/v1/agents/register`.
     * No API key required to call. Web3 is DEFERRED: pass the custodian's custodial `conservatorAddress`
     * now and attach a real wallet later via BYOK (`byokProvider` / `walletAddress`). Default model =
     * free OSS via the LiteLLM gateway. Returns the new `agentId` + a ONE-TIME `apiKey` (save it —
     * the SDK uses it for `submitOutcome`).
     */
    onboard(opts: OnboardOptions): Promise<OnboardResult>;
    /**
     * Submit a task outcome → emits a `repid_score_events` row (the DB trigger applies the RepID
     * delta server-side). Requires the agent's API key — set `config.apiKey` from `onboard`.
     */
    submitOutcome(agentId: string, opts: SubmitOutcomeOptions): Promise<any>;
    /**
     * x402 micropayment hook. Payments are owned by the x402 / ERC-8004 lane — this is a THIN
     * pass-through to repid-engine's `/api/v1/x402` path so the SDK surface is complete. The exact
     * `action` + body shape are defined by the x402 service; this method does not implement payment logic.
     */
    x402Pay(opts: {
        action?: string;
        [k: string]: unknown;
    }): Promise<any>;
}
export default TrustShell;
