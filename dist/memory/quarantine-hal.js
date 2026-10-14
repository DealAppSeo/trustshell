"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.releaseByHal = releaseByHal;
/**
 * quarantine-hal — release a quarantined note by the HAL classify path. THE ONLY NETWORK PATH in the
 * quarantine feature, kept in its own file so the local paths (remember, recall, list, explain, ground
 * release) never import network code.
 *
 * It sends the note, after the same secret / personal-data scrub `trustshell check "<sentence>"`
 * applies, to the backend's POST /api/v1/classify. Only the label `pass` releases. A note the
 * scrubber changed is NOT released: the label would be about other text than the stored note.
 */
const claim_1 = require("../lib/claim");
const local_store_1 = require("./local-store");
const quarantine_1 = require("./quarantine");
async function releaseByHal(id, opts = {}, env = process.env) {
    const pre = (0, quarantine_1.preflight)(id, env);
    if (!('row' in pre))
        return pre;
    const claim = await (0, claim_1.classifyClaim)(pre.row.body, { env, ...opts });
    if (claim.scrubbed) {
        const reason = 'hal not-checked: the scrubber removed part of the note before sending, so the label is not about the stored text';
        (0, local_store_1.setQuarantineReason)((0, local_store_1.memoryDbPath)(env), id, reason);
        return { released: false, id, status: 'NOT_CHECKED', reason, claim };
    }
    if (claim.label !== 'pass') {
        const reason = `hal ${claim.label}${claim.reason ? `: ${claim.reason}` : ''}`;
        (0, local_store_1.setQuarantineReason)((0, local_store_1.memoryDbPath)(env), id, reason);
        return { released: false, id, status: claim.label === 'veto' ? 'HELD' : 'NOT_CHECKED', reason, claim };
    }
    const releasedBy = `hal pass${claim.by ? ` by ${claim.by}` : ''}`;
    (0, local_store_1.markReleased)((0, local_store_1.memoryDbPath)(env), id, releasedBy);
    return { released: true, id, check: 'hal', released_by: releasedBy, claim };
}
