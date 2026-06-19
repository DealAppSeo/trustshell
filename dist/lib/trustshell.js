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
     */
    async verifyOutput(output, options = {}) {
        const r = await this.score(output, options);
        const result = {
            ok: r.verdict !== 'VETO',
            verdict: r.verdict,
            trustScore: r.trustScore,
            halScore: r.halScore,
            soft: r.verdict === 'FLAG',
            signals: r.signals,
            decisionReason: r.decisionReason,
            evidence: r.evidence,
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
     * HAL-check any text through the cross-provider quorum (the real fact-check path).
     * Clean product name for `verifyOutput`; returns ok/verdict/trustScore + per-provider evidence.
     * No API key required (public read). Default providers are free OSS via the LiteLLM gateway.
     */
    async halCheck(text, options = {}) {
        return this.verifyOutput(text, options);
    }
    /**
     * Onboard a custodian + agent in one call — a thin client over repid-engine `POST /api/v1/agents/register`.
     * No API key required to call. Web3 is DEFERRED: pass the custodian's custodial `conservatorAddress`
     * now and attach a real wallet later via BYOK (`byokProvider` / `walletAddress`). Default model =
     * free OSS via the LiteLLM gateway. Returns the new `agentId` + a ONE-TIME `apiKey` (save it —
     * the SDK uses it for `submitOutcome`).
     */
    async onboard(opts) {
        if (!opts.agentName)
            throw new TrustShellError('agentName is required', 400);
        if (!opts.conservatorAddress)
            throw new TrustShellError('conservatorAddress (the human custodian) is required', 400);
        const url = `${this.baseUrl}/api/v1/agents/register`;
        const res = await fetch(url, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({
                agent_name: opts.agentName,
                conservator_address: opts.conservatorAddress,
                is_human: opts.isHuman ?? false,
                wallet_address: opts.walletAddress ?? null,
                llm_provider: opts.llmProvider ?? 'litellm-free',
                llm_model: opts.llmModel ?? null,
                byok_provider: opts.byokProvider ?? null,
            }),
        });
        if (!res.ok) {
            const detail = await res.text().catch(() => '');
            throw new TrustShellError(`onboard failed: ${res.status} ${detail}`.trim(), res.status);
        }
        const data = await res.json();
        return {
            agentId: data.agent_id,
            apiKey: data.api_key ?? data.key,
            conservatorAddress: opts.conservatorAddress,
            repid: data.repid ?? data.starting_score ?? 200,
            tier: data.tier ?? 'PROBATIONARY',
            repidUrl: data.repid_url,
        };
    }
    /**
     * Submit a task outcome → emits a `repid_score_events` row (the DB trigger applies the RepID
     * delta server-side). Requires the agent's API key — set `config.apiKey` from `onboard`.
     */
    async submitOutcome(agentId, opts) {
        if (!this.config.apiKey) {
            throw new TrustShellError('submitOutcome requires the agent API key (set config.apiKey from onboard)', 401);
        }
        if (typeof opts.certainty !== 'number' || opts.certainty < 0 || opts.certainty > 1) {
            throw new TrustShellError('certainty must be a number in [0,1]', 400);
        }
        const url = `${this.baseUrl}/api/v1/agents/${encodeURIComponent(agentId)}/score-event`;
        const res = await fetch(url, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({
                llm_provider: opts.llmProvider,
                llm_model: opts.llmModel ?? null,
                certainty: opts.certainty,
                decision_text: opts.decisionText,
                outcome: opts.outcome,
                task_domain: opts.taskDomain,
                prompt: opts.prompt ?? null,
                hallucination_caught: opts.hallucinationCaught ?? null,
            }),
        });
        if (!res.ok) {
            const detail = await res.text().catch(() => '');
            throw new TrustShellError(`submitOutcome failed: ${res.status} ${detail}`.trim(), res.status);
        }
        return res.json();
    }
    /**
     * Bind a claim handle (email | wallet | 2fa) to an anonymous holder DID so a guest can return and
     * claim their agent + accrued RepID. THIN client over repid-engine `POST /api/v1/identity/claim`
     * — identity writes are owned by the identity lane (GA); this never writes identity tables directly.
     * The endpoint may not be live yet: a 404 surfaces as TrustShellError(404) so the CLI can stage the
     * claim locally and flag GA. Privacy: the raw handle goes only to the endpoint (which hashes it);
     * the SDK never persists it.
     */
    async claimIdentity(opts) {
        if (!opts.holderDid)
            throw new TrustShellError('holderDid is required', 400);
        if (!opts.handle)
            throw new TrustShellError('handle is required', 400);
        const url = `${this.baseUrl}/api/v1/identity/claim`;
        const res = await fetch(url, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({ holder_did: opts.holderDid, handle_type: opts.handleType, handle: opts.handle }),
        });
        if (!res.ok) {
            const detail = await res.text().catch(() => '');
            throw new TrustShellError(`claim failed: ${res.status} ${detail}`.trim(), res.status);
        }
        return res.json();
    }
    /**
     * x402 micropayment hook. Payments are owned by the x402 / ERC-8004 lane — this is a THIN
     * pass-through to repid-engine's `/api/v1/x402` path so the SDK surface is complete. The exact
     * `action` + body shape are defined by the x402 service; this method does not implement payment logic.
     */
    async x402Pay(opts) {
        const action = opts.action ?? 'settle';
        const url = `${this.baseUrl}/api/v1/x402/${encodeURIComponent(action)}`;
        const res = await fetch(url, { method: 'POST', headers: this.getHeaders(), body: JSON.stringify(opts) });
        if (!res.ok) {
            const detail = await res.text().catch(() => '');
            throw new TrustShellError(`x402Pay (${action}) failed: ${res.status} ${detail}`.trim(), res.status);
        }
        return res.json();
    }
}
exports.TrustShell = TrustShell;
exports.default = TrustShell;
