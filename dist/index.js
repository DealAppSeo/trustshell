"use strict";
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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrustShell = void 0;
const events_1 = require("events");
const client_1 = require("./x402/client");
const reputation_1 = require("./reputation");
const DEFAULT_ENGINE = 'https://repid-engine-production.up.railway.app';
class TrustShell extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.engineUrl = config.engineUrl || DEFAULT_ENGINE;
    }
    async evaluate(text, certainty, options) {
        // Removed local HAL pre-check: trustshell v0.2 relies on repid-engine's 5-signal extractor.
        // BYOK trust score warning
        if (this.config.byokProvider) {
            const trust = await this.getLLMTrustScore(this.config.byokProvider);
            if (trust !== null && trust < 70) {
                this.emit('byok-warning', {
                    provider: this.config.byokProvider,
                    trust_score: trust
                });
            }
        }
        // Report to repid-engine
        return this.report({ text, certainty, ...options });
    }
    async report(decision) {
        const res = await fetch(`${this.engineUrl}/api/v1/agents/`
            + `${this.config.agentId}/score-event`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.config.apiKey}`
            },
            body: JSON.stringify({
                llm_provider: this.config.llmProvider,
                llm_model: this.config.llmModel,
                certainty: decision.certainty,
                decision_text: decision.text,
                outcome: 'submitted',
                task_domain: decision.taskDomain || 'general',
                alignment_category: decision.alignmentCategory || 'other',
                economic_impact_usdc: decision.economicImpactUSDC || 0,
                hallucination_caught: decision.hallucinationCaught || false
            })
        });
        if (!res.ok) {
            throw new Error(`Score event failed: ${res.status}`);
        }
        const data = await res.json();
        return {
            approved: data.hal_approved,
            hal_score: data.hal_score,
            repid_delta: data.delta,
            new_score: data.new_score,
            vested_repid: data.vested_repid,
            vesting_active: data.vesting_active,
            tier: data.tier,
            vdr_count: data.vdr_count,
            veto_reason: data.hal_approved ? undefined : 'HAL veto: dissonance too high'
        };
    }
    async getRepID(agentAddressOrId, options) {
        if (agentAddressOrId !== undefined || options !== undefined) {
            const target = agentAddressOrId !== undefined ? agentAddressOrId : this.config.agentId;
            return (0, reputation_1.getRepID)(target, { engineUrl: this.engineUrl, ...options });
        }
        const res = await fetch(`${this.engineUrl}/api/v1/agents/`
            + `${this.config.agentId}/repid`);
        if (!res.ok)
            throw new Error('Failed to fetch RepID');
        return res.json();
    }
    async getLLMTrustScore(provider) {
        try {
            const res = await fetch(`${this.engineUrl}/api/v1/llm-trust`);
            const data = await res.json();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const entry = data.find((d) => d.llm_provider === provider);
            return entry ? entry.trust_score_pct : null;
        }
        catch {
            return null;
        }
    }
    async payAndEscrow(contractId, privateKey) {
        return (0, client_1.escrowWithPaymentFlow)({ contractId, privateKey, engineUrl: this.engineUrl });
    }
    async getReputationHistory(agentAddressOrId, options) {
        const target = agentAddressOrId !== undefined ? agentAddressOrId : this.config.agentId;
        return (0, reputation_1.getReputationHistory)(target, { engineUrl: this.engineUrl, ...options });
    }
    async getAttestation(txHash, options) {
        return (0, reputation_1.getAttestation)(txHash, { engineUrl: this.engineUrl, ...options });
    }
}
exports.TrustShell = TrustShell;
__exportStar(require("./types"), exports);
__exportStar(require("./x402/client"), exports);
__exportStar(require("./x402/types"), exports);
__exportStar(require("./x402/errors"), exports);
__exportStar(require("./x402/payment"), exports);
__exportStar(require("./reputation"), exports);
//# sourceMappingURL=index.js.map