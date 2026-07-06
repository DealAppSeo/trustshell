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
    belief?: number;
    ignoranceMass?: number;
    confidence?: number;
    tierDistribution?: Record<string, number>;
    glassBox?: VerifyOutputResult['glassBox'];
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
    /**
     * SBFA consensus fields. Populated from the backend `sbfa` object (SBFA v0.2 shadow) when present;
     * left undefined when the backend doesn't supply them. Never fabricated (except `confidence`, which
     * falls back to a clearly-labeled DERIVED proxy).
     */
    /** Dempster–Shafer belief mass on the 'action warranted / hallucinated' class. undefined if no SBFA. */
    belief?: number;
    /** Dempster–Shafer ignorance mass (Yager — mass on {uncertain}). undefined if no SBFA; never derived. */
    ignoranceMass?: number;
    /**
     * Aggregate confidence (1 − ignorance) from SBFA when present. When the backend has no SBFA field,
     * falls back to a DERIVED heuristic `quorum/(quorum+1) * (1 − halScore)` — an approximation, not a DST value.
     */
    confidence?: number;
    /** Per-tier validator distribution. undefined until the backend emits `tier_distribution`. */
    tierDistribution?: Record<string, number>;
    /**
     * GLASS BOX — the structured, human-readable SBFA decision trace: who voted, their reliability
     * weights, the quorum math, and why it vetoed/deferred/passed. Present only when the backend's
     * fact-check path returns `sbfa.trace`. This is the differentiator surfaced to the integrator.
     */
    glassBox?: {
        decision: 'act' | 'hold' | 'abstain' | 'escalate';
        weightedAgreement: number;
        correlatedWarning: boolean;
        commaConservative: boolean;
        reliabilitySource: string;
        /** One human-readable line per step (header, per-vote evidence, fusion, decision). */
        lines: string[];
        /** Per-validator evidence breakdown (validator, model, reliability, DST contribution). */
        votes: Array<{
            validator: string;
            modelVersion: string;
            family?: string;
            belief: number;
            confidence: number;
            reliabilityMean: number;
            contributesAct: number;
            contributesIgnorance: number;
        }>;
    };
}
/**
 * Parameters for an A2A micro-transaction (service contract + x402 payment).
 * Maps to the live backend sequence: POST /api/v1/contracts → POST /api/v1/contracts/:id/escrow.
 */
export interface A2AParams {
    /** Repid-engine agent ID of the service BUYER (the calling agent). */
    buyerAgentId: string;
    /** UUID of the `agent_services` row to purchase. */
    serviceId: string;
    /** Task payload to pass to the provider (free-form, no SQL keywords). */
    payload: Record<string, unknown>;
    /**
     * Agreed price in micro-USDC raw units (e.g. 100000 = 0.1 USDC).
     * If omitted, the service's `base_price_usdc_raw` is used.
     */
    agreedPriceUsdcRaw?: number;
    /**
     * x-payment header for x402 escrow (EIP-3009 signed transfer encoded by the x402 client).
     * Required when the service requires payment. If omitted, the backend will return a 402 with
     * payment requirements; the caller should construct the payment and retry.
     */
    xPaymentHeader?: string;
}
/**
 * Result of an executeA2A call. Reflects the backend service-contract lifecycle state at the
 * moment the call completed. The contract is typically in `pending` or `escrowed` status —
 * fulfillment is asynchronous (picked up by a provider agent).
 */
export interface A2AResult {
    /** UUID of the created/escrowed service contract. */
    contractId: string;
    /** Status as returned by the backend: pending | escrowed | fulfilled | disputed | cancelled */
    status: string;
    /** Provider agent ID assigned to fulfill the contract. */
    providerAgentId: string;
    /** Agreed price in micro-USDC raw units. */
    agreedPriceUsdcRaw: number;
    /** x402 settlement ID, present when escrow succeeded. */
    settlementId?: string;
    /**
     * When payment is required but no xPaymentHeader was supplied, the backend returns a 402
     * with payment requirements. These are echoed here so the caller can construct the payment.
     */
    paymentRequired?: {
        x402Version: number;
        accepts: unknown[];
        error: string;
    };
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
     *
     * Task C — SBFA honesty fields: `belief`, `ignoranceMass`, `confidence`, `tierDistribution`
     * are populated from the backend response when present. When the backend does not supply them
     * (pre-SBFA-Phase-2), `confidence` is DERIVED as a heuristic proxy; all others remain undefined.
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
     * Execute an A2A micro-transaction: create a service contract and (optionally) escrow payment
     * via x402. This is an honest client against the live backend.
     *
     * **Backend sequence (two calls):**
     * 1. `POST /api/v1/contracts` — creates a `service_contracts` row in `pending` status.
     * 2. `POST /api/v1/contracts/:id/escrow` — submits x402 payment; advances status to `escrowed`.
     *    Step 2 is only executed when `params.xPaymentHeader` is supplied. If the service requires
     *    payment and no header is provided, the backend returns a 402 with payment requirements that
     *    are echoed back in `result.paymentRequired` — the caller should construct the x402 payment
     *    using those requirements and call `executeA2A` again with the header.
     *
     * **What is NOT wired yet:**
     * - Fulfillment (`POST /api/v1/contracts/:id/fulfill`) is picked up asynchronously by a provider
     *   agent — there is no synchronous fulfillment path. Poll `GET /api/v1/contracts/:id` for status.
     * - The `ESCALATION_CONTRACT` gate is currently OFF in prod for most Trinity agents (P-032).
     *   Contracts created here will sit in `escrowed` until the gate is enabled or the cascade
     *   settlement worker picks them up.
     *
     * **A2A is real but the end-to-end loop is partially wired** (contracts created and escrowed;
     * fulfillment and settlement are asynchronous). This is an honest 501 for the fully-synchronous
     * "request → response → settled" flow that is not yet available.
     */
    executeA2A(params: A2AParams): Promise<A2AResult>;
}
export default TrustShell;
