"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rememberLocal = rememberLocal;
exports.recallLocal = recallLocal;
exports.releaseLocal = releaseLocal;
/**
 * Local memory tools. They write and list sqlite notes.
 * They do not call an LLM or any network helper.
 *
 * IMMUNE SYSTEM v0. A note written through MCP did not come from the operator's keyboard: an agent
 * passed it, and it may carry a web page, a tool result or another agent's words. So it is stored
 * UNTRUSTED and QUARANTINED, and `recall` leaves it out until a check releases it
 * (`quarantine_release`, which grounds it against its source text, locally).
 */
const remember_1 = require("../cli/remember");
const local_store_1 = require("../memory/local-store");
const quarantine_1 = require("../memory/quarantine");
function rememberLocal(text, env = process.env, source = 'mcp:remember') {
    if ((0, remember_1.refusedValue)(text))
        throw new Error('remember refused');
    const rec = (0, quarantine_1.rememberUntrusted)(text, { source }, env);
    return { kind: 'note', remembered: true, id: rec.id, provenance: 'untrusted', quarantined: true, reason: rec.reason };
}
function recallLocal(env = process.env, opts = {}) {
    return { notes: (0, local_store_1.formatRecall)((0, local_store_1.memoryDbPath)(env), env, opts) };
}
/** Ground release over MCP: the source is passed as text. Local, no network. */
function releaseLocal(id, sourceText, page = null, env = process.env) {
    return (0, quarantine_1.releaseByGround)(id, sourceText, { page, sourceLabel: 'source_text (mcp)' }, env);
}
