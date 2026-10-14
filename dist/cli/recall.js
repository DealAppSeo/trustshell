"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recallNotes = recallNotes;
exports.recallKey = recallKey;
/**
 * List saved notes from the local sqlite file, oldest first.
 * do_not_send rows stay a count. Quarantined notes are left out (and counted) unless
 * `includeQuarantined` is set, and then each is marked [QUARANTINED: reason]. No network.
 */
const local_store_1 = require("../memory/local-store");
function recallNotes(env = process.env, opts = {}) {
    return (0, local_store_1.formatRecall)((0, local_store_1.memoryDbPath)(env), env, opts);
}
/** The value for key, or NOT_CHECKED. Never an empty string. No network. */
function recallKey(key, env = process.env) {
    return (0, local_store_1.readKeyed)((0, local_store_1.memoryDbPath)(env), key, env);
}
