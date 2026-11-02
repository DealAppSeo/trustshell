"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrustShell = exports.SDK_GUARD_METHODS = void 0;
exports.kernelDecide = kernelDecide;
exports.requireKernelAllow = requireKernelAllow;
exports.kernelReceipt = kernelReceipt;
exports.verifySigner = verifySigner;
exports.onchainFeedbackClients = onchainFeedbackClients;
exports.rememberUntrusted = rememberUntrusted;
exports.releaseByGround = releaseByGround;
exports.releaseByHal = releaseByHal;
/**
 * GUARD FOR SDK CALLS (containment row C4). What `@hyperdag/trustshell` exports at its root, gated.
 * ---------------------------------------------------------------------------------------------------------
 * Every SDK function that acts (sends over the network on the agent's behalf, posts, writes memory) asks the
 * owner's Guard policy first, through sdkGuard: the CLI's own decision and hash-chained ledger, origin 'Sdk', the
 * policy re-read from TRUSTSHELL_HOME on every call. Denied, it throws GuardDeniedError and does nothing. The one
 * place a payment is signed, buildX402Payment, asks inside src/lib/trustshell.ts, so guardedX402Payment is covered
 * by the same decision and the Guard's spend limits (C8).
 *
 * Why wrappers here and not a check inside each function: the CLI (C1) and the MCP server (C3) already decide each
 * command or tool call and then use these same functions from their own modules. Gating the shared code would
 * decide every CLI and MCP action twice. The package root (src/lib/index.ts) is the SDK; the `exports` map does
 * not expose this file's inner modules.
 *
 * The caller cannot pass an allow: nothing here reads an option that skips the decision. A function that already
 * takes `env` (the memory ones) is decided against that env's TRUSTSHELL_HOME, the caller's own home.
 *
 * WHAT THIS IS NOT. Code in the same process can skip the SDK: call fetch, sign with ethers, write the files itself.
 * Nothing here bounds that code (C4 is PARTIAL). A sandbox mission is the answer for code that is not trusted.
 */
const guardrails_1 = require("./guardrails");
const trustshell_1 = require("./trustshell");
const kernel = __importStar(require("./kernel-client"));
const signers = __importStar(require("./verify-signer"));
const quarantine = __importStar(require("../memory/quarantine"));
const quarantineHal = __importStar(require("../memory/quarantine-hal"));
const read = (tool) => ({ tool, class: 'other' });
/**
 * THE table of gated TrustShell methods and the action each is decided as. Tool names are the CLI's where one
 * mirrors the method (MCP_GUARD_TOOLS uses the same), so `tool:verify` in a policy means the same everywhere.
 * Not here, and not gated: `subscribe` (a local listener) and `getAllowance` (calls the caller's own readAllowance).
 * tests/sdk-guard.test.ts fails if a TrustShell method is in neither list.
 */
exports.SDK_GUARD_METHODS = {
    score: read('verify'),
    verifyOutput: read('verify'),
    evaluate: read('evaluate'),
    verify: read('repid'),
    getRepID: read('repid'),
    getIdentity: read('repid'),
    getRepIDStake: read('repid'),
    getLeaderboard: read('leaderboard'),
    getFactCheckCount: read('fact_checks'),
    presentProof: read('proof'),
    verifyProof: read('proof'),
    audit: read('audit'),
    listServices: read('market'),
    getService: read('market'),
    getContractStatus: read('contracts'),
    pollUntilSettled: read('contracts'),
    // A contract and its escrow: a write to the engine. The payment it carries is counted where it is signed.
    executeA2A: { tool: 'a2a', class: 'post' },
    register: { tool: 'register', class: 'post' },
    registerHuman: { tool: 'register', class: 'post' },
};
// Module-private, so no caller can reach the ungated client behind a TrustShell.
const CORES = new WeakMap();
async function gated(t, m, fn) {
    (0, guardrails_1.sdkGuard)(`TrustShell.${m}`, exports.SDK_GUARD_METHODS[m]);
    const c = CORES.get(t);
    if (!c)
        throw new TypeError('not a TrustShell client');
    return fn(c);
}
/** The TrustShell client, each network method decided by the Guard policy first (see SDK_GUARD_METHODS). */
class TrustShell {
    constructor(config = {}) {
        CORES.set(this, new trustshell_1.TrustShell(config));
    }
    /** As the ungated init; the `/health` probe is a network call, so it is decided as tool:status unless skipped. */
    static async init(config = {}) {
        if (config.healthCheck !== false)
            (0, guardrails_1.sdkGuard)('TrustShell.init', read('status'));
        const { client, health } = await trustshell_1.TrustShell.init(config);
        const t = Object.create(TrustShell.prototype);
        CORES.set(t, client);
        return { client: t, health };
    }
    subscribe(...a) {
        return CORES.get(this).subscribe(...a);
    }
    getAllowance(...a) {
        return CORES.get(this).getAllowance(...a);
    }
    score(...a) { return gated(this, 'score', (c) => c.score(...a)); }
    verifyOutput(...a) { return gated(this, 'verifyOutput', (c) => c.verifyOutput(...a)); }
    evaluate(...a) { return gated(this, 'evaluate', (c) => c.evaluate(...a)); }
    verify(...a) { return gated(this, 'verify', (c) => c.verify(...a)); }
    getRepID(...a) { return gated(this, 'getRepID', (c) => c.getRepID(...a)); }
    getIdentity(...a) { return gated(this, 'getIdentity', (c) => c.getIdentity(...a)); }
    getRepIDStake(...a) { return gated(this, 'getRepIDStake', (c) => c.getRepIDStake(...a)); }
    getLeaderboard(board) {
        return gated(this, 'getLeaderboard', (c) => (board === 'agents' ? c.getLeaderboard('agents') : c.getLeaderboard(board)));
    }
    getFactCheckCount() { return gated(this, 'getFactCheckCount', (c) => c.getFactCheckCount()); }
    presentProof(...a) { return gated(this, 'presentProof', (c) => c.presentProof(...a)); }
    verifyProof(...a) { return gated(this, 'verifyProof', (c) => c.verifyProof(...a)); }
    audit(...a) { return gated(this, 'audit', (c) => c.audit(...a)); }
    listServices(...a) { return gated(this, 'listServices', (c) => c.listServices(...a)); }
    getService(...a) { return gated(this, 'getService', (c) => c.getService(...a)); }
    getContractStatus(...a) { return gated(this, 'getContractStatus', (c) => c.getContractStatus(...a)); }
    pollUntilSettled(...a) { return gated(this, 'pollUntilSettled', (c) => c.pollUntilSettled(...a)); }
    executeA2A(...a) { return gated(this, 'executeA2A', (c) => c.executeA2A(...a)); }
    register(...a) { return gated(this, 'register', (c) => c.register(...a)); }
    registerHuman(...a) { return gated(this, 'registerHuman', (c) => c.registerHuman(...a)); }
}
exports.TrustShell = TrustShell;
const KERNEL = read('kernel');
/** The Guard's refusal, or null when the call may go ahead. For the functions documented never to throw. */
function refusal(call, act) {
    try {
        (0, guardrails_1.sdkGuard)(call, act);
        return null;
    }
    catch (e) {
        if (e instanceof guardrails_1.GuardDeniedError)
            return e;
        throw e;
    }
}
/** As kernel-client's; it never throws, so a Guard denial is its refusal with code `guard_denied`. */
async function kernelDecide(input, opts = {}) {
    const no = refusal('kernelDecide', KERNEL);
    if (no)
        return { allowed: false, verdict: 'NOT_CHECKED', source: 'client', args_hash: null, receipt: null, reasons: [{ code: 'guard_denied', detail: no.message }], http_status: null };
    return kernel.kernelDecide(input, opts);
}
async function requireKernelAllow(...a) {
    (0, guardrails_1.sdkGuard)('requireKernelAllow', KERNEL);
    return kernel.requireKernelAllow(...a);
}
/** As kernel-client's; it never throws, so a Guard denial is `{ ok: false, reason: 'guard_denied' }`. */
async function kernelReceipt(receiptId, opts = {}) {
    const no = refusal('kernelReceipt', read('receipt'));
    if (no)
        return { ok: false, reason: 'guard_denied', detail: no.message, http_status: null };
    return kernel.kernelReceipt(receiptId, opts);
}
async function verifySigner(...a) {
    (0, guardrails_1.sdkGuard)('verifySigner', read('signers'));
    return signers.verifySigner(...a);
}
async function onchainFeedbackClients(...a) {
    (0, guardrails_1.sdkGuard)('onchainFeedbackClients', read('signers'));
    return signers.onchainFeedbackClients(...a);
}
function rememberUntrusted(text, opts, env = process.env) {
    (0, guardrails_1.sdkGuard)('rememberUntrusted', read('remember'), env);
    return quarantine.rememberUntrusted(text, opts, env);
}
function releaseByGround(id, sourceText, opts = {}, env = process.env) {
    (0, guardrails_1.sdkGuard)('releaseByGround', read('quarantine'), env);
    return quarantine.releaseByGround(id, sourceText, opts, env);
}
async function releaseByHal(id, opts = {}, env = process.env) {
    (0, guardrails_1.sdkGuard)('releaseByHal', read('quarantine'), env);
    return quarantineHal.releaseByHal(id, opts, env);
}
