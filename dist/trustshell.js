"use strict";
/**
 * @hyperdag/trustshell
 * Trust scoring SDK for AI — add HAL evaluation to any LLM app in 3 lines.
 *
 * From S-SDK1 spec + S-BUILD implementation.
 */
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
        this.config = config;
        this.baseUrl = config.apiUrl ||
            (typeof process !== 'undefined' ? process.env?.TRUSTSHELL_API_URL : undefined) ||
            'https://repid-engine-production.up.railway.app';
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
        const body = {
            response,
            prompt: options.prompt,
            provider: options.provider || 'unknown',
            model: options.model,
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
            const trustScore = Math.round((1 - (data.hal_score || 0)) * 100);
            return {
                trustScore,
                halScore: data.hal_score,
                signals: {
                    harmProbability: data.hal_signals?.harm_probability ?? 0,
                    epistemicUncertainty: data.hal_signals?.epistemic_uncertainty ?? 0,
                    evidenceQuality: data.hal_signals?.evidence_quality ?? 0,
                    scopeAppropriateness: data.hal_signals?.scope_appropriateness ?? 0,
                    certaintyAtClaim: data.hal_signals?.certainty_at_claim ?? 0,
                },
                verdict: data.hal_verdict || 'PASS',
                flaggedHallucination: !!data.hal_flagged_hallucination,
                provider: data.provider_used || options.provider || 'unknown',
                model: data.model_used || options.model || 'unknown',
                proofHash: data.proof_hash,
                sessionId: data.session_id,
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
            repid: data.repid || data.current_repid,
            tier: data.tier,
            lastAnchorTx: data.last_anchor_tx || null,
            latestProofHash: data.latest_proof_hash || null,
            provenanceChain: data.provenance || [],
        };
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
}
exports.TrustShell = TrustShell;
exports.default = TrustShell;
