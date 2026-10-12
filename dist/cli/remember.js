"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refusedValue = refusedValue;
exports.rememberNote = rememberNote;
exports.rememberKey = rememberKey;
/**
 * Write one local note, or one value under a key. No network.
 */
const local_store_1 = require("../memory/local-store");
const redact_1 = require("../memory/redact");
/** Authorization header tokens, including `Bearer <jwt>`. Tokens are assumed to be at least 8 characters. */
const BEARER = /\bBearer\s+[A-Za-z0-9_\-./]{8,}/;
/**
 * True when a value carries a secret shape and must not be stored. Uses the same detector as the
 * outbound scrubber (containsSecret), so a key the checkers would never see is not written to
 * disk either: until 2026-10-05 this list was narrower and stored `sk-…` and `AKIA…` keys.
 * Personal data such as an email is NOT refused: local memory is the place for it.
 */
function refusedValue(value) {
    return (0, redact_1.containsSecret)(value) || /sb_secret_/i.test(value) || /postgresql:\/\//i.test(value) || value.includes('eyJ') || BEARER.test(value) || redact_1.PREFIXED_TOKEN.test(value);
}
function rememberNote(text, env = process.env) {
    (0, local_store_1.insertMemory)((0, local_store_1.memoryDbPath)(env), 'note', text, undefined, env);
}
/**
 * Save one value under key in the same local file.
 * A secret-shaped value is refused and nothing is written. No network.
 *
 * THE KEY IS SCANNED TOO, and that is the whole point of the second clause.
 * `remember` takes two positionals, so `remember <secret> <label>` — the arguments
 * the wrong way round — is the easiest slip to make with it. Until 2026-10-11
 * only the VALUE was checked, so that transposition stored the secret as the KEY,
 * on disk in plain text, and `recall` prints keys. The refusal a user was relying
 * on did not fire, and nothing said so: the command answered `remembered`.
 *
 * MEASURED: `remember sb_secret_… harmless` was accepted before this clause and is
 * refused after it (tests/memory-kv-key-scanned.test.ts).
 *
 * It lives HERE rather than in the CLI dispatch because this is the function the
 * SDK exports. Guarding only the CLI would leave the hole open for every caller
 * that imports rememberKey — one wired end, which is worse than none.
 */
function rememberKey(key, value, env = process.env) {
    if (refusedValue(value) || refusedValue(key))
        return false;
    (0, local_store_1.writeKeyed)((0, local_store_1.memoryDbPath)(env), key, value, undefined, env);
    return true;
}
