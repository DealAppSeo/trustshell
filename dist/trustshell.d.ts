/**
 * @hyperdag/trustshell
 * Trust scoring SDK for AI — add HAL evaluation to any LLM app in 3 lines.
 *
 * From S-SDK1 spec + S-BUILD implementation.
 */
import { type HalProvider } from './hal-local';
export type HalMode = 'remote' | 'local-first' | 'local-only';
export interface TrustShellConfig {
    apiKey?: string;
    apiUrl?: string;
    timeout?: number;
    /**
     * Scoring mode (D-017). Default 'remote' preserves the existing SDK behavior.
     * - 'remote'      : hosted repid-engine quorum HAL only (original behavior).
     * - 'local-first' : score locally (PRIMARY); fall back to repid-engine only if
     *                   the local provider is unavailable/throws.
     * - 'local-only'  : never touch the network.
     */
    mode?: HalMode;
    /** Override the local HAL provider (defaults to the built-in heuristic). */
    localProvider?: HalProvider;
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
export declare class TrustShellError extends Error {
    status: number;
    constructor(message: string, status: number);
}
export declare class TrustShell {
    private config;
    private baseUrl;
    private mode;
    private local;
    constructor(config?: TrustShellConfig);
    private getHeaders;
    /**
     * Score a response. Dispatches by `mode` (D-017):
     * - 'remote'      → hosted repid-engine quorum HAL (default; original behavior).
     * - 'local-only'  → local heuristic, never touches the network.
     * - 'local-first' → local PRIMARY; falls back to repid-engine only if the
     *                   local provider is unavailable/throws.
     */
    score(response: string, options?: ScoreOptions): Promise<ScoreResult>;
    /** Score locally, in-process, with no network call (D-017 local PRIMARY). */
    scoreLocal(response: string, options?: ScoreOptions): Promise<ScoreResult>;
    /** Score via the hosted repid-engine quorum HAL. */
    scoreRemote(response: string, options?: ScoreOptions): Promise<ScoreResult>;
    verify(agentId: string): Promise<VerifyResult>;
    audit(table?: string): Promise<AuditResult>;
}
/**
 * createHDP — the D-017 HAL Decision Provider slot: a TrustShell wired
 * **local-PRIMARY, repid-engine-FALLBACK**. Use this when you want fast,
 * offline-capable scoring that only reaches the network if the local scorer
 * is unavailable.
 *
 * ```ts
 * const hdp = createHDP();                 // local primary, remote fallback
 * const r = await hdp.score('...');        // no network unless local fails
 * ```
 */
export declare function createHDP(config?: TrustShellConfig): TrustShell;
export { LocalHalProvider, localHeuristicScore } from './hal-local';
export type { HalProvider } from './hal-local';
export default TrustShell;
