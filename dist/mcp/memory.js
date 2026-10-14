"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rememberLocal = rememberLocal;
exports.recallLocal = recallLocal;
/**
 * Local memory tools. They write and list sqlite notes.
 * They do not call an LLM or any network helper.
 *
 * IMMUNE SYSTEM v0. A note written through MCP did not come from the operator's keyboard: an agent
 * passed it, and it may carry a web page, a tool result or another agent's words. So it is stored
 * UNTRUSTED and QUARANTINED, and `recall` leaves it out until the OPERATOR releases it at the CLI.
 * There is deliberately no release over MCP: the writer must not be able to release its own note.
 */
const remember_1 = require("../cli/remember");
const local_store_1 = require("../memory/local-store");
const quarantine_1 = require("../memory/quarantine");
function rememberLocal(text, env = process.env, source = 'mcp:remember', sourceText = null) {
    if ((0, remember_1.refusedValue)(text))
        throw new Error('remember refused');
    const rec = (0, quarantine_1.rememberUntrusted)(text, { source, sourceText }, env);
    return {
        kind: 'note',
        remembered: true,
        id: rec.id,
        provenance: 'untrusted',
        quarantined: true,
        reason: rec.reason,
        source_recorded: rec.source_recorded,
    };
}
function recallLocal(env = process.env, opts = {}) {
    return { notes: (0, local_store_1.formatRecall)((0, local_store_1.memoryDbPath)(env), env, opts) };
}
