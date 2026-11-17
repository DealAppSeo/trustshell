"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.proofClassOf = proofClassOf;
const WEAK_BINDING = 'agent binding is weak (about 1 in 256 foreign agent ids verify)';
const NOT_PROVEN = 'the tier label and the time are not proven';
/** Keyed by `scheme`. Add an entry only with the measurement behind it. */
const CLASSES = {
    plonky3_range_check: (tier) => ({
        kind: 'validity',
        scoreHidden: false,
        agentBinding: 'weak',
        notProven: ['tier', 'time'],
        summary: [
            'validity proof',
            tier === 'postcard'
                ? 'the score is public'
                : 'the score is left out of the statement but is not hidden (trying each score against the verifier finds it)',
            WEAK_BINDING,
            NOT_PROVEN,
        ].join('; '),
    }),
};
function proofClassOf(p) {
    if (!p.proofBytes) {
        return { kind: 'none', scoreHidden: false, agentBinding: 'none', notProven: [], summary: 'no proof: the response carried no proof bytes' };
    }
    // `scheme` comes from the server: own keys only, so "constructor" cannot reach Object's prototype.
    const known = p.scheme && Object.prototype.hasOwnProperty.call(CLASSES, p.scheme) ? CLASSES[p.scheme] : undefined;
    if (known)
        return known(p.tier);
    return {
        kind: 'unknown',
        scoreHidden: false,
        agentBinding: 'unknown',
        notProven: [],
        summary: `unknown proof scheme ${p.scheme ?? '(none)'}: TrustShell makes no claim about what it shows`,
    };
}
