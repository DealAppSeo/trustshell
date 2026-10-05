"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveLayaLane = resolveLayaLane;
/**
 * Pick the Laya lane before HAL.
 * Unset TRUSTSHELL_LAYA stays on the quorum.
 * local uses the text classifier and src/laya/hook.ts.
 * engine POSTs /api/v1/laya/classify. A 200ms timeout escalates.
 */
const redact_1 = require("../memory/redact");
const hook_1 = require("../laya/hook");
const classify_1 = require("./classify");
const CLASSIFY_TIMEOUT_MS = 200;
function engineOrigin(env) {
    const trimmed = (env.TRUSTSHELL_API_URL ?? '').trim().replace(/\/$/, '');
    return trimmed.length > 0 ? trimmed : null;
}
function asLane(value) {
    if (typeof value !== 'string')
        return null;
    const lane = value.trim().toLowerCase();
    if (lane === 'cheap' || lane === 'escalate' || lane === 'ask')
        return lane;
    return null;
}
function laneFromBody(body) {
    const direct = asLane(body);
    if (direct)
        return direct;
    if (!body || typeof body !== 'object')
        return null;
    const record = body;
    return asLane(record.classify) ?? asLane(record.lane);
}
async function engineLane(claim, env, fetchImpl) {
    if (env.OFFLINE === '1')
        return 'escalate';
    const origin = engineOrigin(env);
    if (!origin)
        return 'escalate';
    const ac = new AbortController();
    let timer;
    const pending = fetchImpl(`${origin}/api/v1/laya/classify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ text: (0, redact_1.redact)(claim) }),
        signal: ac.signal,
    });
    pending.catch(() => undefined);
    try {
        const res = await Promise.race([
            pending,
            new Promise((_, reject) => {
                timer = setTimeout(() => {
                    ac.abort();
                    reject(new Error('timeout'));
                }, CLASSIFY_TIMEOUT_MS);
            }),
        ]);
        if (!res.ok)
            return 'escalate';
        const body = await res.json().catch(() => null);
        return laneFromBody(body) ?? 'escalate';
    }
    catch {
        return 'escalate';
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
}
/** Lane for this verify. Unset, local, or engine. */
async function resolveLayaLane(claim, env, fetchImpl) {
    const mode = (env.TRUSTSHELL_LAYA ?? '').trim();
    if (mode === 'local') {
        const lane = (0, classify_1.classify)(claim);
        (0, hook_1.layaHook)(lane);
        return lane;
    }
    if (mode === 'engine')
        return engineLane(claim, env, fetchImpl);
    return 'escalate';
}
