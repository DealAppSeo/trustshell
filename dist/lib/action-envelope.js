"use strict";
/**
 * S5 stub — one action class cannot run without a typed envelope.
 * Unit-test only. Not exported from the package entry.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnvelopeRequiredError = exports.ACTION_ORIGINS = void 0;
exports.isActionEnvelope = isActionEnvelope;
exports.runEnvelopedAction = runEnvelopedAction;
exports.ACTION_ORIGINS = ['Cli', 'Site', 'Mcp', 'Market'];
class EnvelopeRequiredError extends Error {
    constructor() {
        super('action_refused: typed envelope required');
        this.code = 'envelope_required';
        this.name = 'EnvelopeRequiredError';
    }
}
exports.EnvelopeRequiredError = EnvelopeRequiredError;
function isActionEnvelope(value) {
    if (!value || typeof value !== 'object')
        return false;
    const v = value;
    return (typeof v.origin === 'string' &&
        exports.ACTION_ORIGINS.includes(v.origin) &&
        typeof v.actionClass === 'string' &&
        v.actionClass.length > 0 &&
        typeof v.policyId === 'string' &&
        v.policyId.length > 0);
}
async function runEnvelopedAction(envelope, act) {
    if (!isActionEnvelope(envelope)) {
        throw new EnvelopeRequiredError();
    }
    return act();
}
