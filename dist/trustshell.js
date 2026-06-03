"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrustShell = exports.TrustShellError = void 0;
const events_1 = require("events");
const ethers_1 = require("ethers");
const reputation_1 = require("./reputation");
const x402_client_1 = require("./x402-client");
class TrustShellError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'TrustShellError';
        this.status = status;
    }
}
exports.TrustShellError = TrustShellError;
class TrustShell extends events_1.EventEmitter {
    constructor(config = {}) {
        super();
        this.config = config;
        this.baseUrl = config.apiUrl ||
            config.engineUrl ||
            (typeof process !== 'undefined' ? process.env?.TRUSTSHELL_API_URL : undefined) ||
            'https://repid-engine-production.up.railway.app';
    }
    static init(config = {}) {
        return new TrustShell(config);
    }
    init(config) {
        this.config = { ...this.config, ...config };
        if (config.apiUrl) {
            this.baseUrl = config.apiUrl;
        }
        else if (config.engineUrl) {
            this.baseUrl = config.engineUrl;
        }
    }
    getHeaders() {
        const headers = {
            'Content-Type': 'application/json',
        };
        const key = this.config.apiKey || (typeof process !== 'undefined' ? process.env?.REPID_API_KEY : undefined);
        if (key) {
            headers['Authorization'] = `Bearer ${key}`;
        }
        return headers;
    }
    async score(response, options = {}) {
        const url = `${this.baseUrl}/api/v1/hal/evaluate`;
        const body = {
            text: response,
            context: {
                domain: 'finance',
                certainty: 0.85,
                prompt: options.prompt,
                product: 'trustshell-sdk'
            },
            strictness: 2
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
                halScore: data.hal_score || 0,
                signals: {
                    harmProbability: data.hal_signals?.harm_probability ?? data.signals?.harm_probability ?? 0,
                    epistemicUncertainty: data.hal_signals?.epistemic_uncertainty ?? data.signals?.epistemic_uncertainty ?? 0,
                    evidenceQuality: data.hal_signals?.evidence_quality ?? data.signals?.evidence_quality ?? 0,
                    scopeAppropriateness: data.hal_signals?.scope_appropriateness ?? data.signals?.scope_appropriateness ?? 0,
                    certaintyAtClaim: data.hal_signals?.certainty_at_claim ?? data.signals?.certainty_at_claim ?? 0,
                },
                verdict: data.hal_verdict || data.verdict || 'PASS',
                flaggedHallucination: !!(data.hal_flagged_hallucination || data.flaggedHallucination),
                provider: data.provider_used || options.provider || this.config.llmProvider || 'unknown',
                model: data.model_used || options.model || this.config.llmModel || 'unknown',
                proofHash: data.proof_hash || data.proofHash,
                sessionId: data.session_id || data.sessionId,
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
    async verifyOutput(response, options = {}) {
        return this.score(response, options);
    }
    async verify(agentId) {
        const url = `${this.baseUrl}/api/v1/repid/${agentId}`;
        const res = await fetch(url, { headers: this.getHeaders() });
        if (!res.ok) {
            throw new TrustShellError(`RepID lookup failed: ${res.status}`, res.status);
        }
        const data = await res.json();
        return {
            repid: data.repid || data.current_repid || data.repid_score,
            tier: data.tier || data.tier_level || 'PROBATIONARY',
            lastAnchorTx: data.last_anchor_tx || data.last_reputation_tx_hash || null,
            latestProofHash: data.latest_proof_hash || data.latestProofHash || null,
            provenanceChain: data.provenance || data.provenanceChain || [],
        };
    }
    async audit(tableOrSessionId = 'hal_classifications') {
        // Determine if it is a session ID or table name
        const isSessionId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tableOrSessionId);
        if (isSessionId) {
            const url = `${this.baseUrl}/api/v1/audit/chain/${tableOrSessionId}`;
            const res = await fetch(url, { headers: this.getHeaders() });
            if (!res.ok) {
                throw new TrustShellError(`Audit session failed: ${res.status}`, res.status);
            }
            const data = await res.json();
            return {
                chainStatus: data.status === 'VALID' ? 'VALID' : 'BROKEN',
                totalEntries: data.totalEntries || data.entries || 0,
                firstBreakId: data.firstBreakId || null,
                verifiedAt: new Date().toISOString(),
                entries: data.entries,
                hashes: data.hashes,
                brokenAt: data.brokenAt,
            };
        }
        else {
            const url = `${this.baseUrl}/api/v1/audit/verify?table=${encodeURIComponent(tableOrSessionId)}`;
            const res = await fetch(url, { headers: this.getHeaders() });
            if (!res.ok) {
                throw new TrustShellError(`Audit table failed: ${res.status}`, res.status);
            }
            const data = await res.json();
            return {
                chainStatus: data.status === 'VALID' ? 'VALID' : 'CHAIN_BREAK',
                totalEntries: data.total_entries || data.totalEntries || 0,
                firstBreakId: data.first_break_id || null,
                verifiedAt: new Date().toISOString(),
            };
        }
    }
    async executeA2A(options) {
        // 1. POST /api/v1/tip/request
        const requestUrl = `${this.baseUrl}/api/v1/tip/request`;
        const requestBody = {
            requestor_agent_id: options.requestor_agent_id,
            provider_agent_id: options.provider_agent_id,
            prediction_topic: options.prediction_topic,
        };
        const requestRes = await fetch(requestUrl, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(requestBody),
        });
        if (requestRes.status !== 402 && !requestRes.ok) {
            throw new TrustShellError(`Failed to create tip request: ${requestRes.status} ${requestRes.statusText}`, requestRes.status);
        }
        const challenge = await requestRes.json();
        const accepts = challenge.accepts || [];
        const offer = accepts.find((a) => a.scheme === 'exact');
        if (!offer) {
            throw new TrustShellError('No compatible x402 exact offer found in challenge', 402);
        }
        // 2. Sign EIP-3009 transfer authorization
        const wallet = new ethers_1.ethers.Wallet(options.privateKey);
        const nonce = ethers_1.ethers.hexlify(ethers_1.ethers.randomBytes(32));
        const validAfter = 0;
        const validBefore = Math.floor(Date.now() / 1000) + 3600; // 1 hour validity
        const value = BigInt(offer.amount);
        const providerUrl = this.config.rpcUrl || 'https://sepolia.base.org';
        const provider = new ethers_1.ethers.JsonRpcProvider(providerUrl);
        let name = 'USD Coin';
        try {
            const tokenContract = new ethers_1.ethers.Contract(offer.asset, ['function name() view returns (string)', 'function version() view returns (string)'], provider);
            name = await tokenContract.name();
        }
        catch (e) {
            // fallback
        }
        const domain = {
            name,
            version: '2',
            chainId: 84532,
            verifyingContract: offer.asset
        };
        const types = {
            TransferWithAuthorization: [
                { name: 'from', type: 'address' },
                { name: 'to', type: 'address' },
                { name: 'value', type: 'uint256' },
                { name: 'validAfter', type: 'uint256' },
                { name: 'validBefore', type: 'uint256' },
                { name: 'nonce', type: 'bytes32' }
            ]
        };
        const message = {
            from: wallet.address,
            to: offer.payTo,
            value: value,
            validAfter: validAfter,
            validBefore: validBefore,
            nonce: nonce
        };
        const signature = await wallet.signTypedData(domain, types, message);
        const sig = ethers_1.ethers.Signature.from(signature);
        const paymentPayload = {
            v: sig.v,
            r: sig.r,
            s: sig.s,
            from: wallet.address,
            to: offer.payTo,
            value: value.toString(),
            validAfter: validAfter.toString(),
            validBefore: validBefore.toString(),
            nonce: nonce
        };
        const paymentB64 = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');
        // 3. POST /api/v1/tip/deliver/:tipId
        const deliverUrl = `${this.baseUrl}/api/v1/tip/deliver/${challenge.tip_id}`;
        const deliverRes = await fetch(deliverUrl, {
            method: 'POST',
            headers: {
                ...this.getHeaders(),
                'X-PAYMENT': paymentB64,
            },
            body: JSON.stringify({
                payer_address: wallet.address
            }),
        });
        if (!deliverRes.ok) {
            throw new TrustShellError(`Tip delivery failed: ${deliverRes.status} ${deliverRes.statusText}`, deliverRes.status);
        }
        const result = await deliverRes.json();
        const xPaymentResponse = deliverRes.headers.get('X-PAYMENT-RESPONSE');
        let txHash;
        if (xPaymentResponse) {
            try {
                const settleInfo = JSON.parse(xPaymentResponse);
                txHash = settleInfo.txHash;
            }
            catch (e) { }
        }
        return {
            ok: result.ok,
            tip_id: result.tip_id,
            content: result.content,
            is_simulated: result.is_simulated,
            txHash: txHash || result.txHash,
        };
    }
    async getRepID(agentId) {
        const targetAgentId = agentId !== undefined ? String(agentId) : this.config.agentId;
        if (!targetAgentId) {
            throw new TrustShellError('agentId is required for getRepID', 400);
        }
        // If it's a numeric token ID or an address, check on-chain
        const isTokenIdOrAddress = /^\d+$/.test(targetAgentId) || targetAgentId.startsWith('0x');
        if (isTokenIdOrAddress) {
            const options = {
                rpcUrl: this.config.rpcUrl,
                engineUrl: this.baseUrl
            };
            const summary = await (0, reputation_1.getRepID)(targetAgentId, options);
            return {
                value: Number(summary.value),
                count: summary.count,
                decimals: summary.decimals
            };
        }
        // Otherwise query backend
        const url = `${this.baseUrl}/api/v1/repid/${targetAgentId}`;
        const res = await fetch(url, { headers: this.getHeaders() });
        if (!res.ok) {
            throw new TrustShellError(`RepID lookup failed: ${res.status}`, res.status);
        }
        const data = await res.json();
        return {
            value: data.repid_score !== undefined ? data.repid_score : data.repid,
            count: data.activity_30d || 0,
            decimals: 0,
        };
    }
    async presentProof(agentId) {
        const targetAgentId = agentId !== undefined ? String(agentId) : this.config.agentId;
        if (!targetAgentId) {
            throw new TrustShellError('agentId is required for presentProof', 400);
        }
        const url = `${this.baseUrl}/api/v1/repid/${targetAgentId}/zkp`;
        const res = await fetch(url, { headers: this.getHeaders() });
        if (!res.ok) {
            throw new TrustShellError(`Proof presentation failed: ${res.status}`, res.status);
        }
        const data = await res.json();
        return {
            id: data.id,
            agentId: data.agent_id,
            proofType: data.proof_type,
            tierProven: data.tier_proven,
            merkleRoot: data.merkle_root || null,
            zkCommitment: data.zk_commitment || null,
            easSchema: data.eas_schema || null,
            easAttestationUid: data.eas_attestation_uid || null,
            createdAt: data.created_at,
        };
    }
    async getReputationHistory(agentId, options = {}) {
        const targetAgentId = agentId !== undefined ? String(agentId) : this.config.agentId;
        if (!targetAgentId) {
            throw new TrustShellError('agentId is required for getReputationHistory', 400);
        }
        const isTokenIdOrAddress = /^\d+$/.test(targetAgentId) || targetAgentId.startsWith('0x');
        if (isTokenIdOrAddress) {
            const readOptions = {
                rpcUrl: this.config.rpcUrl,
                engineUrl: this.baseUrl,
                ...options
            };
            return (0, reputation_1.getReputationHistory)(targetAgentId, readOptions);
        }
        const url = `${this.baseUrl}/api/v1/repid/${targetAgentId}/history${options.since ? `?since=${encodeURIComponent(options.since)}` : ''}`;
        const res = await fetch(url, { headers: this.getHeaders() });
        if (!res.ok) {
            throw new TrustShellError(`Reputation history failed: ${res.status}`, res.status);
        }
        const data = await res.json();
        return data.events || [];
    }
    async getAttestation(txHash, options = {}) {
        const readOptions = {
            rpcUrl: this.config.rpcUrl,
            engineUrl: this.baseUrl,
            ...options
        };
        return (0, reputation_1.getAttestation)(txHash, readOptions);
    }
    async payAndEscrow(contractId, privateKey) {
        const engineUrl = this.baseUrl;
        const challengeRes = await fetch(`${engineUrl}/api/v1/contracts/${contractId}/escrow`, {
            method: 'POST',
            headers: this.getHeaders()
        });
        if (challengeRes.status !== 402) {
            if (challengeRes.ok)
                return challengeRes.json();
            const text = await challengeRes.text();
            throw new Error(`Unexpected status ${challengeRes.status}: ${text}`);
        }
        const challenge = await challengeRes.json();
        return (0, x402_client_1.payAndEscrow)({
            contractId,
            privateKey,
            facilitatorChallenge: challenge,
            engineUrl,
            rpcUrl: this.config.rpcUrl
        });
    }
    async getLLMTrustScore(provider) {
        const url = `${this.baseUrl}/api/v1/llm-trust`;
        const res = await fetch(url, { headers: this.getHeaders() });
        if (!res.ok)
            return null;
        const list = await res.json();
        const match = list.find(item => item.llm_provider?.toLowerCase() === provider.toLowerCase());
        return match ? Number(match.trust_score_pct) : null;
    }
    async evaluate(text, certainty, options = {}) {
        const provider = this.config.llmProvider;
        if (provider) {
            try {
                const score = await this.getLLMTrustScore(provider);
                if (score !== null && score < 70) {
                    this.emit('byok-warning', { provider, trust_score: score });
                }
            }
            catch (err) { }
        }
        return this.score(text, { prompt: options.prompt, provider, model: this.config.llmModel });
    }
    async report(decision) {
        return this.score(decision.text, { prompt: decision.prompt, provider: decision.provider || this.config.llmProvider, model: decision.model || this.config.llmModel });
    }
}
exports.TrustShell = TrustShell;
exports.default = TrustShell;
