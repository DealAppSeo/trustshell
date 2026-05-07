"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrustShell = exports.ServerError = exports.ProviderExhaustedError = exports.RateLimitError = exports.AuthError = exports.TrustShellError = void 0;
class TrustShellError extends Error {
    status;
    data;
    constructor(message, status, data) {
        super(message);
        this.status = status;
        this.data = data;
        this.name = 'TrustShellError';
    }
}
exports.TrustShellError = TrustShellError;
class AuthError extends TrustShellError {
    constructor(message, data) {
        super(message, 401, data);
        this.name = 'AuthError';
    }
}
exports.AuthError = AuthError;
class RateLimitError extends TrustShellError {
    retryAfter;
    constructor(message, data, retryAfterMs) {
        super(message, 429, data);
        this.name = 'RateLimitError';
        this.retryAfter = retryAfterMs || 10000;
    }
}
exports.RateLimitError = RateLimitError;
class ProviderExhaustedError extends TrustShellError {
    constructor(message, data) {
        super(message, 503, data);
        this.name = 'ProviderExhaustedError';
    }
}
exports.ProviderExhaustedError = ProviderExhaustedError;
class ServerError extends TrustShellError {
    constructor(message, status, data) {
        super(message, status, data);
        this.name = 'ServerError';
    }
}
exports.ServerError = ServerError;
class TrustShell {
    apiKey;
    agentId;
    baseUrl;
    constructor(config) {
        this.apiKey = config.apiKey;
        this.agentId = config.agentId;
        this.baseUrl = (config.baseUrl || 'https://repid-engine-production.up.railway.app').replace(/\/$/, '');
    }
    async request(method, path, body, retries = 3) {
        const url = `${this.baseUrl}${path.startsWith('/') ? path : '/' + path}`;
        const headers = {
            'Content-Type': 'application/json',
        };
        if (this.apiKey) {
            headers['Authorization'] = `Bearer ${this.apiKey}`;
        }
        try {
            const res = await fetch(url, {
                method,
                headers,
                body: body ? JSON.stringify(body) : undefined,
            });
            let data = null;
            if (res.status !== 204) {
                data = await res.json().catch(() => null);
            }
            if (!res.ok) {
                if (res.status === 401)
                    throw new AuthError(data?.error || 'Unauthorized', data);
                if (res.status === 429) {
                    const retryAfter = parseInt(res.headers.get('Retry-After') || '10', 10) * 1000;
                    if (retries > 0) {
                        await new Promise(resolve => setTimeout(resolve, retryAfter));
                        return this.request(method, path, body, retries - 1);
                    }
                    throw new RateLimitError(data?.error || 'Rate limited', data, retryAfter);
                }
                if (res.status === 503)
                    throw new ProviderExhaustedError(data?.error || 'Service Unavailable', data);
                throw new ServerError(data?.error || 'Server error', res.status, data);
            }
            return data;
        }
        catch (e) {
            if (e instanceof TrustShellError)
                throw e;
            throw new ServerError(e.message, 500);
        }
    }
    async complete(prompt, options) {
        const body = { prompt, ...options };
        if (this.agentId) {
            body.agent_id = this.agentId;
        }
        return this.request('POST', '/api/v1/llm/complete', body);
    }
    static async registerAgent(name, options, baseUrl) {
        const url = (baseUrl || 'https://repid-engine-production.up.railway.app').replace(/\/$/, '');
        const body = { name, ...options };
        const res = await fetch(`${url}/api/v1/agents/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok)
            throw new Error(data?.error || 'Registration failed');
        return data;
    }
    async getAgentCard(agentId) {
        const id = agentId || this.agentId;
        if (!id)
            throw new Error('agentId is required');
        return this.request('GET', `/api/v1/agents/${id}/card`);
    }
    async scoreEvent(decision_text, outcome, task_domain, certainty, llm_provider, extra) {
        const id = this.agentId;
        if (!id)
            throw new Error('agentId is required for scoreEvent');
        const body = {
            decision_text,
            outcome,
            task_domain,
            certainty,
            llm_provider,
            ...extra
        };
        return this.request('POST', `/api/v1/agents-external/${id}/score-event`, body);
    }
    async getProviders() {
        return this.request('GET', '/api/v1/llm/providers');
    }
    async getRouteDebug(prompt) {
        return this.request('POST', '/api/v1/llm/route-debug', { prompt });
    }
}
exports.TrustShell = TrustShell;
