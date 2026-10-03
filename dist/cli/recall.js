"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recallNotes = recallNotes;
exports.recallKey = recallKey;
/**
 * List saved notes from the local sqlite file, oldest first.
 * do_not_send rows stay a count. No network.
 */
const local_store_1 = require("../memory/local-store");
function recallNotes(env = process.env) {
    return (0, local_store_1.formatRecall)((0, local_store_1.memoryDbPath)(env));
}
/** The value for key, or NOT_CHECKED. Never an empty string. No network. */
function recallKey(key, env = process.env) {
    return (0, local_store_1.readKeyed)((0, local_store_1.memoryDbPath)(env), key);
}
