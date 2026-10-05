"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rememberLocal = rememberLocal;
exports.recallLocal = recallLocal;
/**
 * Local memory tools. They write and list sqlite notes.
 * They do not call an LLM or any network helper.
 */
const remember_1 = require("../cli/remember");
const local_store_1 = require("../memory/local-store");
function rememberLocal(text, env = process.env) {
    if ((0, remember_1.refusedValue)(text))
        throw new Error('remember refused');
    (0, local_store_1.insertMemory)((0, local_store_1.memoryDbPath)(env), 'note', text, undefined, env);
    return { kind: 'note', remembered: true };
}
function recallLocal(env = process.env) {
    return { notes: (0, local_store_1.formatRecall)((0, local_store_1.memoryDbPath)(env), env) };
}
