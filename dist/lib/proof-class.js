"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.proofClassOf = proofClassOf;
const action_evidence_1 = require("./action-evidence");
const WEAK_BINDING = 'agent binding is weak (about 1 in 256 foreign agent ids verify)';
const NOT_PROVEN = 'the tier label and the time are not proven';
/** Keyed by `scheme`. Add an entry only with the measurement behind it. */
// The wording follows the statement in hand, not the tier name: only the envelope tier strips the score.
const CLASSES = {
    plonky3_range_check: (statement) => ({
        kind: 'validity',
        scoreHidden: false,
        agentBinding: 'weak',
        notProven: ['tier', 'time'],
        summary: [
            'validity proof',
            statement?.repid_score !== undefined
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
        return known(p.statement);
    return {
        kind: 'unknown',
        scoreHidden: false,
        agentBinding: 'unknown',
        notProven: [],
        // The scheme is engine text and this summary is printed to terminals: control code points stripped (Strix, #728).
        summary: `unknown proof scheme ${(0, action_evidence_1.cleanCodePoints)(p.scheme ?? '(none)')}: TrustShell makes no claim about what it shows`,
    };
}
