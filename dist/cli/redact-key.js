"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.redactKey = redactKey;
/**
 * Delete one keyed row from the local sqlite file. No network.
 */
const local_store_1 = require("../memory/local-store");
function redactKey(key, env = process.env) {
    return (0, local_store_1.deleteKeyed)((0, local_store_1.memoryDbPath)(env), key);
}
