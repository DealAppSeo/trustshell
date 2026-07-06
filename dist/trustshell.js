"use strict";
/**
 * @hyperdag/trustshell
 * Trust scoring SDK for AI — add HAL evaluation to any LLM app in 3 lines.
 *
 * From S-SDK1 spec + S-BUILD implementation.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrustShell = exports.TrustShellError = void 0;
class TrustShellError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'TrustShellError';
        this.status = status;
    }
}
exports.TrustShellError = TrustShellError;
class TrustShell {
    constructor(config = {}) {
        this.listeners = {};
        this.config = config;
        this.baseUrl = config.apiUrl ||
            (typeof process !== 'undefined' ? process.env?.TRUSTSHELL_API_URL : undefined) ||
            'https://repid-engine-production.up.railway.app';
    }
    /**
     * Construct a TrustShell and confirm the backend is reachable (real connectivity check, not a
     * stub). Returns the client; `health` reflects the live `/health` probe so callers can fail fast.
     */
    static async init(config = {}) {
        const client = new TrustShell(config);
        let health;
        try {
            const res = await fetch(`${client.baseUrl}/health`, { headers: client.getHeaders() });
            const data = res.ok ? await res.json().catch(() => ({})) : {};
            health = { ok: res.ok, status: data.status };
        }
        catch (err) {
            health = { ok: false, error: err?.message ?? String(err) };
        }
        return { client, health };
    }
    /**
     * Subscribe to client-side lifecycle events emitted when SDK calls complete. Real (not faked):
     * the SDK has no server push channel, so these fire locally on `verdict` (after verifyOutput) and
     * `proof` (after presentProof). Returns an unsubscribe fn. Server-streamed events are a roadmap item.
     */
    subscribe(event, handler) {
        var _a;
        ((_a = this.listeners)[event] ?? (_a[event] = [])).push(handler);
        return () => {
            this.listeners[event] = (this.listeners[event] ?? []).filter((h) => h !== handler);
        };
    }
    emit(event, payload) {
        for (const h of this.listeners[event] ?? []) {
            try {
                h(payload);
            }
            catch { /* a listener throwing must not break the SDK call */ }
        }
    }
    getHeaders() {
        const headers = {
            'Content-Type': 'application/json',
        };
        if (this.config.apiKey) {
            headers['Authorization'] = `Bearer ${this.config.apiKey}`;
        }
        return headers;
    }
    async score(response, options = {}) {
        const url = `${this.baseUrl}/api/v1/hal/evaluate`;
        // The live /api/v1/hal/evaluate contract takes { text, context?, strictness? } — NOT
        // { response, ... }. strictness 2 selects the cross-provider fact-check quorum (the real
        // HAL), not the style-only extractor. (Fixes the prior 400 "text is required".)
        const body = {
            text: response,
            strictness: 2,
        };
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout || 30000);
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            if (!res.ok) {
                throw new TrustShellError(`HAL evaluation failed: ${res.status} ${res.statusText}`, res.status);
            }
            const data = await res.json();
            const halScore = typeof data.hal_score === 'number' ? data.hal_score : 0;
            const trustScore = Math.round((1 - halScore) * 100);
            // Real contract returns decision: 'vetoed' | 'flagged' | 'clean' (legacy: hal_verdict).
            const decision = data.decision ?? data.hal_verdict;
            const verdict = decision === 'vetoed' || decision === 'VETO' ? 'VETO'
                : decision === 'flagged' || decision === 'FLAG' ? 'FLAG'
                    : 'PASS';
            // Quorum (strictness-2) returns `signals` with provider/family info; the style-only
            // extractor returns harm/epistemic fields. Read both shapes defensively.
            const sig = data.signals ?? data.hal_signals ?? {};
            // Evidence = each non-errored provider's verdict + note. `provider_responses` is a
            // top-level field on the fact-check response (NOT nested under `signals`).
            const providerResponses = Array.isArray(data.provider_responses) ? data.provider_responses : [];
            const evidence = providerResponses
                .filter((p) => p && p.verdict && p.verdict !== 'ERROR')
                .map((p) => `${p.provider}:${p.verdict}${p.note ? ` (${p.note})` : ''}`);
            const quorum = sig.quorum ?? (typeof sig.providers_used === 'number' ? `${sig.providers_used} providers` : 'unknown');
            const decisionReason = data.quorum_note
                ?? `${verdict} — hal_score ${halScore} via ${data.mode || 'fact-check'} (${quorum} quorum)`;
            // SBFA v0.2 Glass Box — populated from the backend `sbfa` object (fact-check path). belief +
            // ignorance are never fabricated; confidence falls back to a labeled DERIVED proxy if absent.
            const sbfa = data.sbfa;
            const quorumN = typeof sig.families_used === 'number' ? sig.families_used
                : (typeof sig.providers_used === 'number' ? sig.providers_used : 0);
            const derivedConfidence = quorumN > 0 ? (quorumN / (quorumN + 1)) * (1 - halScore) : undefined;
            const glassBox = sbfa?.trace ? {
                decision: sbfa.decision,
                weightedAgreement: sbfa.weighted_agreement,
                correlatedWarning: !!sbfa.correlated_warning,
                commaConservative: !!sbfa.comma_conservative,
                reliabilitySource: sbfa.reliability_source,
                lines: Array.isArray(sbfa.trace.lines) ? sbfa.trace.lines : [],
                votes: Array.isArray(sbfa.trace.votes) ? sbfa.trace.votes.map((v) => ({
                    validator: v.validator, modelVersion: v.modelVersion, family: v.family,
                    belief: v.belief, confidence: v.confidence, reliabilityMean: v.reliability_mean,
                    contributesAct: v.contributes_act, contributesIgnorance: v.contributes_ignorance,
                })) : [],
            } : undefined;
            return {
                trustScore,
                halScore,
                signals: {
                    harmProbability: sig.harm_probability ?? 0,
                    epistemicUncertainty: sig.epistemic_uncertainty ?? 0,
                    evidenceQuality: sig.evidence_quality ?? 0,
                    scopeAppropriateness: sig.scope_appropriateness ?? 0,
                    certaintyAtClaim: sig.certainty_at_claim ?? 0,
                },
                verdict,
                flaggedHallucination: verdict === 'VETO',
                provider: Array.isArray(sig.families) ? sig.families.join('+') : (data.provider_used || options.provider || 'quorum'),
                model: data.mode || data.model_used || 'fact-check',
                proofHash: data.proof_hash,
                sessionId: data.session_id,
                mode: data.mode,
                providersUsed: sig.providers_used,
                familiesUsed: sig.families_used,
                agreement: sig.agreement,
                decisionReason,
                evidence,
                belief: typeof sbfa?.belief === 'number' ? sbfa.belief : undefined,
                ignoranceMass: typeof sbfa?.ignorance_mass === 'number' ? sbfa.ignorance_mass : undefined,
                confidence: typeof sbfa?.confidence === 'number' ? sbfa.confidence : derivedConfidence,
                tierDistribution: sbfa?.tier_distribution ?? data.tier_distribution ?? undefined,
                ...(glassBox ? { glassBox } : {}),
            };
        }
        catch (err) {
            if (err instanceof TrustShellError)
                throw err;
            if (err.name === 'AbortError') {
                throw new TrustShellError('HAL evaluation timed out', 408);
            }
            throw new TrustShellError(`Network error: ${err.message}`, 0);
        }
        finally {
            clearTimeout(timeoutId);
        }
    }
    async verify(agentId) {
        const url = `${this.baseUrl}/api/v1/repid/${agentId}`;
        const res = await fetch(url, { headers: this.getHeaders() });
        if (!res.ok) {
            throw new TrustShellError(`RepID lookup failed: ${res.status}`, res.status);
        }
        const data = await res.json();
        return {
            // The live /api/v1/repid/:id returns `repid_score` (cached read); keep the legacy fallbacks.
            repid: data.repid_score ?? data.repid ?? data.current_repid,
            tier: data.tier,
            lastAnchorTx: data.last_anchor_tx || null,
            latestProofHash: data.latest_proof_hash || null,
            provenanceChain: data.provenance || [],
        };
    }
    /**
     * Verify an agent output through HAL and return a simple ok/verdict.
     * `ok` is true unless HAL hard-vetoed (so a category-aware soft FLAG still passes).
     *
     * Task C — SBFA honesty fields: `belief`, `ignoranceMass`, `confidence`, `tierDistribution`
     * are populated from the backend response when present. When the backend does not supply them
     * (pre-SBFA-Phase-2), `confidence` is DERIVED as a heuristic proxy; all others remain undefined.
     */
    async verifyOutput(output, options = {}) {
        const r = await this.score(output, options);
        // --- SBFA v0.2 Glass Box — forwarded from score(), which parses the backend `sbfa` object. ---
        // belief / ignoranceMass: REAL DST values when the backend supplies them; never fabricated (undefined otherwise).
        // confidence: real SBFA confidence when present, else a DERIVED proxy (quorum/(quorum+1) * (1 - halScore)).
        const quorum = r.providersUsed ?? 0;
        const derivedConfidence = quorum > 0
            ? (quorum / (quorum + 1)) * (1 - r.halScore)
            : (1 - r.halScore) * 0.5; // single-provider fallback: half-weight
        const result = {
            ok: r.verdict !== 'VETO',
            verdict: r.verdict,
            trustScore: r.trustScore,
            halScore: r.halScore,
            soft: r.verdict === 'FLAG',
            signals: r.signals,
            decisionReason: r.decisionReason,
            evidence: r.evidence,
            belief: r.belief, // real DST belief mass, or undefined (never fabricated)
            ignoranceMass: r.ignoranceMass, // real DST ignorance, or undefined (never derived)
            confidence: r.confidence ?? derivedConfidence, // real SBFA confidence; else DERIVED proxy
            tierDistribution: r.tierDistribution,
            ...(r.glassBox ? { glassBox: r.glassBox } : {}),
        };
        this.emit('verdict', result);
        return result;
    }
    /** Fetch an agent's current RepID + tier (public read; no API key required). */
    async getRepID(agentId) {
        const v = await this.verify(agentId);
        return {
            agentId,
            repid: v.repid,
            tier: v.tier,
            lastAnchorTx: v.lastAnchorTx,
            latestProofHash: v.latestProofHash,
        };
    }
    /**
     * Fetch an agent's latest RepID range proof and (optionally) verify it client-side
     * with the bundled WASM verifier — "trust math, not the server."
     *
     * Client-side verification requires @hyperdag/proof-verifier (peer dependency); the
     * proof statement is the agent-bound tuple {agent_id, threshold, repid_score}.
     */
    async presentProof(agentId, opts = {}) {
        const tier = opts.tier ?? 'postcard';
        // Only `postcard` has a production-real proof endpoint today. Other tiers (envelope/letter/
        // package) are implemented in the prover but not yet exposed as a live API — expose them behind
        // a capability flag, default OFF, and FLAG rather than fake (no stub in a shipped path).
        if (tier !== 'postcard' && !opts.allowExperimentalTiers) {
            throw new TrustShellError(`Proof tier '${tier}' is not yet production-exposed. Pass { allowExperimentalTiers: true } ` +
                `to opt in once the live endpoint ships; today only 'postcard' returns a real proof.`, 501);
        }
        const url = `${this.baseUrl}/api/v1/repid/${encodeURIComponent(agentId)}/proof`;
        const res = await fetch(url, { headers: this.getHeaders() });
        if (!res.ok) {
            throw new TrustShellError(`Proof lookup failed: ${res.status}`, res.status);
        }
        const data = await res.json();
        const presentation = {
            agentId,
            tier,
            proofBytes: data.proof_bytes || '',
            scheme: data.scheme ?? null,
            statement: data.statement ?? null,
            createdAt: data.created_at ?? null,
        };
        if (opts.verify && presentation.proofBytes && presentation.statement) {
            presentation.verification = await this.verifyProofLocally(presentation.proofBytes, presentation.statement);
        }
        this.emit('proof', presentation);
        return presentation;
    }
    /** Client-side WASM verification of a proof against its statement. */
    async verifyProofLocally(proofBytes, statement) {
        try {
            // Dynamic import via a variable specifier so the SDK type-checks and loads even when
            // the optional verifier isn't installed (it ships as an optionalDependency).
            const verifierPkg = '@hyperdag/proof-verifier';
            const mod = await Promise.resolve(`${verifierPkg}`).then(s => __importStar(require(s)));
            const result = await mod.verify(proofBytes, statement);
            return {
                verified: !!result.verified,
                error: result.error ?? null,
                verifierVersion: result.verifier_version ?? 'unknown',
            };
        }
        catch (err) {
            return {
                verified: false,
                error: `verifier unavailable: ${err?.message ?? String(err)}`,
                verifierVersion: 'unavailable',
            };
        }
    }
    async audit(table = 'hal_classifications') {
        const url = `${this.baseUrl}/api/v1/audit/verify?table=${encodeURIComponent(table)}`;
        const res = await fetch(url, { headers: this.getHeaders() });
        if (!res.ok) {
            throw new TrustShellError(`Audit failed: ${res.status}`, res.status);
        }
        const data = await res.json();
        return {
            chainStatus: data.status,
            totalEntries: data.total_entries || data.totalEntries || 0,
            firstBreakId: data.first_break_id || null,
            verifiedAt: new Date().toISOString(),
        };
    }
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
    async executeA2A(params) {
        // Step 1: Create the service contract.
        const createRes = await fetch(`${this.baseUrl}/api/v1/contracts`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({
                service_id: params.serviceId,
                buyer_agent_id: params.buyerAgentId,
                payload: params.payload,
                ...(params.agreedPriceUsdcRaw !== undefined
                    ? { agreed_price_usdc_raw: params.agreedPriceUsdcRaw }
                    : {}),
            }),
        });
        if (!createRes.ok) {
            const errBody = await createRes.json().catch(() => ({}));
            throw new TrustShellError(`A2A contract creation failed: ${createRes.status} — ${errBody?.error ?? createRes.statusText}`, createRes.status);
        }
        const contract = await createRes.json();
        const contractId = contract.id;
        // Step 2: Escrow via x402 (only when a payment header was provided by the caller).
        if (!params.xPaymentHeader) {
            // No payment header: attempt escrow anyway so the backend can tell us its requirements.
            const escrowProbeRes = await fetch(`${this.baseUrl}/api/v1/contracts/${encodeURIComponent(contractId)}/escrow`, { method: 'POST', headers: this.getHeaders(), body: JSON.stringify({}) });
            const escrowBody = await escrowProbeRes.json().catch(() => ({}));
            if (escrowProbeRes.status === 402) {
                // Backend told us what payment it needs — echo back and let the caller handle it.
                return {
                    contractId,
                    status: contract.status ?? 'pending',
                    providerAgentId: contract.provider_agent_id,
                    agreedPriceUsdcRaw: contract.agreed_price_usdc_raw,
                    paymentRequired: {
                        x402Version: escrowBody.x402Version ?? 1,
                        accepts: escrowBody.accepts ?? [],
                        error: escrowBody.error ?? 'payment_required',
                    },
                };
            }
            // If escrow succeeded without a header (free service or dev mode), fall through.
            if (escrowProbeRes.ok) {
                const escrowed = await escrowProbeRes.json().catch(() => escrowBody);
                return {
                    contractId,
                    status: escrowed.status ?? 'escrowed',
                    providerAgentId: escrowed.provider_agent_id ?? contract.provider_agent_id,
                    agreedPriceUsdcRaw: escrowed.agreed_price_usdc_raw ?? contract.agreed_price_usdc_raw,
                    settlementId: escrowed.x402_payment_id ?? undefined,
                };
            }
            // Any other error: surface it.
            throw new TrustShellError(`A2A escrow failed: ${escrowProbeRes.status} — ${escrowBody?.error ?? escrowProbeRes.statusText}`, escrowProbeRes.status);
        }
        // xPaymentHeader was provided: submit it for escrow.
        const escrowRes = await fetch(`${this.baseUrl}/api/v1/contracts/${encodeURIComponent(contractId)}/escrow`, {
            method: 'POST',
            headers: {
                ...this.getHeaders(),
                'X-PAYMENT': params.xPaymentHeader,
            },
            body: JSON.stringify({}),
        });
        if (escrowRes.status === 402) {
            const body = await escrowRes.json().catch(() => ({}));
            return {
                contractId,
                status: 'pending',
                providerAgentId: contract.provider_agent_id,
                agreedPriceUsdcRaw: contract.agreed_price_usdc_raw,
                paymentRequired: {
                    x402Version: body.x402Version ?? 1,
                    accepts: body.accepts ?? [],
                    error: body.error ?? 'payment_required',
                },
            };
        }
        if (!escrowRes.ok) {
            const errBody = await escrowRes.json().catch(() => ({}));
            throw new TrustShellError(`A2A escrow failed: ${escrowRes.status} — ${errBody?.error ?? escrowRes.statusText}`, escrowRes.status);
        }
        const escrowed = await escrowRes.json();
        return {
            contractId,
            status: escrowed.status ?? 'escrowed',
            providerAgentId: escrowed.provider_agent_id ?? contract.provider_agent_id,
            agreedPriceUsdcRaw: escrowed.agreed_price_usdc_raw ?? contract.agreed_price_usdc_raw,
            settlementId: escrowed.x402_payment_id ?? undefined,
        };
    }
}
exports.TrustShell = TrustShell;
exports.default = TrustShell;
