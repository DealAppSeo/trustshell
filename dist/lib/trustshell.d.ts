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
/**
 * Params for `register()` — public agent onboarding.
 * Maps to the live backend `POST /api/v1/agents/register`.
 */
export interface RegisterParams {
    /** Human-readable agent name (the only required field). */
    agentName: string;
    /** Optional short description (max 200 chars, sanitized server-side). */
    description?: string;
    /** LLM provider the agent uses (e.g. 'anthropic', 'openai', 'groq'). Optional. */
    llmProvider?: string;
    /** LLM model id (e.g. 'claude-sonnet-4-6'). Optional. */
    llmModel?: string;
    /** On-chain wallet address to bind (defaults to a generated `external:<uuid>` id). */
    walletAddress?: string;
    /** true → register as an anonymous HUMAN rather than an EXTERNAL_AGENT. */
    isHuman?: boolean;
}
/**
 * Result of `register()`.
 *
 * ⚠ `apiKey` is returned exactly ONCE by the backend — it is NOT recoverable later.
 * Persist it immediately (env var / secret store); a lost key means re-registering the agent.
 */
export interface RegisterResult {
    /** UUID of the newly-created agent (use as buyerAgentId / for getRepID). */
    agentId: string;
    /** The scoped API key — SHOWN ONCE. Save it now; it cannot be retrieved again. */
    apiKey: string;
    /** Starting RepID (200 for new external agents). */
    repid: number;
    /** Derived tier (PROBATIONARY for new agents). */
    tier: string;
    /** ERC-8004 token id if minted, else null. */
    erc8004TokenId?: string | number | null;
}
/**
 * Result of `registerHuman()` — anonymous ZKP human DBT registration.
 *
 * ⚠ `privateId` is the human's ONLY credential and is NOT stored server-side — save it now.
 */
export interface RegisterHumanResult {
    /** UUID of the created human agent record. */
    agentId: string;
    /** The anonymous private credential — SHOWN ONCE, never stored server-side. Save it now. */
    privateId: string;
    /** Starting RepID (200). */
    repId: number;
    /** Derived tier (PROBATIONARY). */
    tier: string;
}
/** A marketplace service listing from the `agent_services` catalog. */
export interface ServiceListing {
    /** UUID of the service (pass as `serviceId` to executeA2A). */
    id: string;
    /** Provider agent UUID that fulfills this service. */
    providerAgentId: string;
    /** Category, e.g. 'verification', 'cross_validation', 'anfis_routing'. */
    serviceType: string;
    /** Display name of the service. */
    serviceName: string;
    /** Free-form description, or null. */
    description: string | null;
    /** List price in micro-USDC raw units (e.g. 100000 = 0.10 USDC). */
    basePriceUsdcRaw: number;
    /** Minimum buyer RepID required to purchase. */
    minRepidToPurchase: number;
    /** Whether the listing is active. */
    active: boolean;
}
/** Page of service listings from `listServices()`. */
export interface ServiceListPage {
    services: ServiceListing[];
    /** Total matching count (across pages). */
    count: number;
    limit: number;
    offset: number;
    /** min / max base price across the returned page (raw micro-USDC), for quick range display. */
    priceRangeUsdcRaw: {
        min: number;
        max: number;
    } | null;
}
/** Optional filters for `listServices()`. */
export interface ListServicesOptions {
    /** Filter by service_type (e.g. 'verification'). */
    type?: string;
    /** Filter by provider agent UUID. */
    provider?: string;
    /** Only services with base price >= this (raw micro-USDC). */
    minPriceUsdcRaw?: number;
    /** Only services with base price <= this (raw micro-USDC). */
    maxPriceUsdcRaw?: number;
    /** Include inactive services too (default: active only). */
    includeInactive?: boolean;
    limit?: number;
    offset?: number;
}
/** Params for `buildX402Payment()` — construct + sign an EIP-3009 x402 payment header. */
export interface BuildX402PaymentParams {
    /**
     * Payer's private key (0x-prefixed). Used only to sign locally with ethers; NEVER logged,
     * NEVER transmitted. The signed authorization — not the key — is what goes on the wire.
     */
    privateKey: string;
    /** Recipient wallet address (the provider's payTo, from the 402 payment requirements). */
    to: string;
    /** Amount in micro-USDC raw units (e.g. 100000 = 0.10 USDC). Accepts number | bigint | string. */
    amount: number | bigint | string;
    /**
     * USDC (or other EIP-3009 token) contract address = the EIP-712 `verifyingContract`.
     * Defaults to Base Sepolia USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`.
     */
    asset?: string;
    /** EIP-712 chainId. Defaults to 84532 (Base Sepolia). */
    chainId?: number;
    /** EIP-712 token domain name. Defaults to 'USDC'. */
    tokenName?: string;
    /** EIP-712 token domain version. Defaults to '2' (Circle USDC). */
    tokenVersion?: string;
    /** Seconds the authorization is valid for, from now. Defaults to 3600 (1h). */
    validForSeconds?: number;
    /** 32-byte hex nonce. Defaults to a random one. */
    nonce?: string;
}
/** Options for `pollUntilSettled()`. */
export interface PollOptions {
    /** Poll interval in ms (default 3000). */
    intervalMs?: number;
    /** Max total wait in ms before giving up (default 120000). */
    timeoutMs?: number;
    /**
     * Contract statuses that count as terminal (stop polling). Default: settled/fulfilled/
     * satisfied/resolved/disputed/cancelled — i.e. anything past `escrowed`.
     */
    terminalStatuses?: string[];
}
/** One model row on the two-lens model leaderboard. Shape mirrors the engine's view rows. */
export interface LeaderboardModel {
    /** Model id, e.g. 'anthropic/claude-sonnet-4-6'. */
    model_id?: string;
    /** Provider family, when the view supplies it. */
    provider?: string;
    /** Any additional view columns (accuracy, brier, cost, composite, …) are passed through. */
    [key: string]: unknown;
}
/** One agent row on the RepID agent leaderboard (`GET /api/v1/leaderboard/agents`). */
export interface LeaderboardAgent {
    agentId: string;
    model: string | null;
    /** Real 0–10,000 RepID total. */
    repidTotal: number;
    roundsScored: number;
    avgBrier: number | null;
    avgAccuracy: number | null;
    avgRaterReliability: number | null;
    errors: number;
    lastRound: string | null;
    /** On-chain attestation of the delta (not yet wired → false today). */
    verified: boolean;
}
/** Result of `getLeaderboard('agents')`. */
export interface AgentLeaderboard {
    kind: 'agents';
    agents: LeaderboardAgent[];
    totalAgents: number;
    lastUpdated: string;
}
/** Result of `getLeaderboard('models')` — the two-lens (performance / value) model board. */
export interface ModelLeaderboard {
    kind: 'models';
    /** Human-readable metric label, e.g. 'code-review discrimination (Brier-calibrated)'. */
    metric: string;
    /** Honesty disclaimer emitted by the engine (a narrow proxy, small N, public methodology). */
    disclaimer: string;
    lenses: {
        performance: {
            label: string;
            rankedBy: string;
            models: LeaderboardModel[];
        };
        value: {
            label: string;
            rankedBy: string;
            models: LeaderboardModel[];
        };
    };
    /** One-line current-story copy (single messaging source of truth). */
    narrative: string;
    lastUpdated: string;
}
/** Result of `getFactCheckCount()` — the public, source-tagged fact-check tally. */
export interface FactCheckCount {
    /** Total public fact-checks across all sources. */
    total: number;
    /** Per-source breakdown (the four allowed source tags). */
    bySource: Record<string, number>;
    lastUpdated: string;
}
/**
 * Result of `getRepIDStake()` — the Proof-of-Authority (POA) staking read.
 *
 * ⚠ STUB: the public keyless POA stake-read path is not yet exposed by the backend. This method
 * attempts the live `GET /api/v1/stake/authority/:agentId` endpoint; when it is unavailable
 * (auth-gated / not deployed), it returns a clearly-labeled stub (`stubbed: true`) with zeroed
 * figures rather than fabricating a stake. Never treat a `stubbed` result as a real balance.
 */
export interface RepIDStake {
    agentId: string;
    /** Total escrowed stake in raw micro-USDC. 0 when stubbed. */
    stakeUsdcRaw: number;
    /** Derived staking authority (raw units), or null when not computed. */
    authority: number | null;
    /** true when the value came from the live backend; false when this is the honest stub. */
    stubbed: boolean;
    /** Human-readable note (why stubbed, or the live basis). */
    note: string;
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
     * Fetch a live leaderboard from the public repid-engine.
     *
     * - `getLeaderboard('agents')` → the RepID agent board (`GET /api/v1/leaderboard/agents`):
     *   agents ranked by real 0–10,000 RepID.
     * - `getLeaderboard('models')` → the two-lens model board (`GET /api/v1/leaderboard/models`):
     *   a PERFORMANCE lens (accuracy / Brier) and a VALUE lens (accuracy·speed·cost composite),
     *   plus the engine's honesty disclaimer + narrative. Labeled "code-review discrimination",
     *   a narrow proxy — NOT general trustworthiness.
     *
     * Public read; no API key required. Overloaded so the return type is narrowed by the argument.
     */
    getLeaderboard(board: 'agents'): Promise<AgentLeaderboard>;
    getLeaderboard(board: 'models'): Promise<ModelLeaderboard>;
    /**
     * Fetch the public, source-tagged fact-check tally (`GET /api/v1/hal/fact-check-count`).
     * This counts entries in `hal_public_fact_checks` (the public counter), which is SEPARATE from
     * the internal `hal_classifications` production classifier — the two are never merged. Keyless.
     */
    getFactCheckCount(): Promise<FactCheckCount>;
    /**
     * Read an agent's Proof-of-Authority (POA) stake.
     *
     * ⚠ STUB — the public keyless POA stake-read path is not yet exposed. This method attempts the
     * live `GET /api/v1/stake/authority/:agentId` endpoint; when it is unavailable (auth-gated or not
     * deployed) it returns an HONEST stub (`stubbed: true`, zeroed figures) rather than fabricating a
     * balance. Wire the public read on the backend, then this method upgrades to real values with no
     * SDK signature change. Never treat a `stubbed` result as a real stake.
     */
    getRepIDStake(agentId: string): Promise<RepIDStake>;
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
    /**
     * Register a new agent (public onboarding). Wraps `POST /api/v1/agents/register` so devs don't
     * have to hand-roll the HTTP call.
     *
     * ⚠ The returned `apiKey` is shown exactly ONCE by the backend and cannot be retrieved again —
     * persist it immediately (env var / secret store). A lost key means re-registering the agent.
     */
    register(params: RegisterParams): Promise<RegisterResult>;
    /**
     * Register an anonymous HUMAN (ZKP DBT) via `POST /api/v1/agents/human`. No name, no PII —
     * the backend stores only a ZKP commitment.
     *
     * ⚠ The returned `privateId` is the human's ONLY credential and is NOT stored server-side.
     * Save it now; it cannot be recovered.
     */
    registerHuman(opts?: {
        commitment?: string;
        role?: string;
    }): Promise<RegisterHumanResult>;
    /**
     * List marketplace services from the `agent_services` catalog (`GET /api/v1/services`).
     * Returns the page plus a quick base-price range so a dev can pick what to buy, then pass a
     * listing's `id` as `serviceId` to `executeA2A`.
     *
     * AUTH: on the currently deployed backend this route is API-key gated (returns 401 without a
     * key). Construct the client with `{ apiKey }` to call it. The keyless way to browse the same
     * live catalog is the web market at https://trustshell.dev/market (it server-reads
     * `agent_services` directly). Making `GET /api/v1/services` public keyless is a one-line backend
     * change staged for Sean (add the path to auth.ts publicPaths) — see TRUSTSHELL_SHIP_STEPS.md.
     */
    listServices(options?: ListServicesOptions): Promise<ServiceListPage>;
    /** Fetch a single marketplace service by UUID (`GET /api/v1/services/:id`). Public read. */
    getService(serviceId: string): Promise<ServiceListing>;
    /**
     * Read the current state of a service contract (`GET /api/v1/contracts/:id`). Use after
     * `executeA2A` to observe async fulfillment. Returns the same shape as `A2AResult` fields plus
     * the raw `result` payload once a provider fulfills it.
     */
    getContractStatus(contractId: string): Promise<{
        contractId: string;
        status: string;
        providerAgentId: string;
        buyerAgentId: string;
        agreedPriceUsdcRaw: number;
        settlementId?: string;
        result?: unknown;
    }>;
    /**
     * Poll `getContractStatus` until the contract reaches a terminal status (past `escrowed`) or the
     * timeout elapses. Async fulfillment is done by a provider agent / the cascade settlement worker,
     * so this is how a caller awaits the end of the A2A loop.
     *
     * Resolves with the final contract state. Throws `TrustShellError(408)` on timeout.
     */
    pollUntilSettled(contractId: string, opts?: PollOptions): Promise<Awaited<ReturnType<TrustShell['getContractStatus']>>>;
}
/**
 * Build a base64 X-PAYMENT header — a signed EIP-3009 `TransferWithAuthorization` — for the x402
 * escrow leg of `executeA2A`. Tree-shakeable standalone helper (imports `ethers` lazily so apps that
 * never pay don't pull it into their bundle at module-eval time).
 *
 * The private key is used ONLY to sign locally; it is never logged and never leaves the process —
 * only the resulting signed authorization travels on the wire.
 *
 * Returns the base64 header string to pass as `A2AParams.xPaymentHeader`.
 */
export declare function buildX402Payment(params: BuildX402PaymentParams): Promise<string>;
export default TrustShell;
