"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PAY_CAPABLE_ORIGINS = void 0;
exports.canPay = canPay;
exports.assertOriginCanPay = assertOriginCanPay;
const trustshell_1 = require("./trustshell");
/** The origins permitted to initiate a spend. `Unknown` is deliberately absent. */
exports.PAY_CAPABLE_ORIGINS = ['Cli', 'Site', 'Mcp', 'Market'];
/** True only for a known, pay-capable origin. `undefined`, `Unknown`, and any unrecognized string are false. */
function canPay(origin) {
    return origin !== undefined && exports.PAY_CAPABLE_ORIGINS.includes(origin);
}
/**
 * Throw unless `origin` is a known pay-capable origin. Missing / `Unknown` / unrecognized
 * all refuse with HTTP 403 — the same fail-closed posture as a missing cap. Call this at
 * the top of any spend path (x402 payment, A2A escrow) before touching a key.
 */
function assertOriginCanPay(origin) {
    if (!canPay(origin)) {
        throw new trustshell_1.TrustShellError(`origin_refused: turn origin ${origin ?? 'Unknown'} may not pay (fail-closed)`, 403);
    }
}
