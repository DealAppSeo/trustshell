"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.guardedX402Payment = guardedX402Payment;
const origin_1 = require("./origin");
const audit_1 = require("./audit");
const trustshell_1 = require("./trustshell");
/**
 * The fail-closed spend path: assert the origin can pay, write the intent row + require a policy
 * (auditThenAct), THEN sign via `buildX402Payment` (which still enforces the cap). Use this from a
 * turn boundary that knows the origin. `buildX402Payment` stays the lower-level cap-checked signer
 * for advanced callers; this composes the origin + audit gates around it so neither can be skipped.
 *
 * Order matters: origin is checked FIRST (a turn that may not pay never even writes an intent), then
 * auditThenAct records the attempt before the policy gate; then the receipt is written; then the
 * signature. A receipt-write failure refuses the spend — write-receipt-BEFORE-pay is fail-closed.
 */
// What to record for the cap in the audit row. Deliberately does NOT re-read the allowance or
// BigInt-parse the declared cap: the signer (buildX402Payment → resolvePaymentCap) is the single
// source that reads the allowance and enforces min(declared, allowance). Re-deriving it here would
// (a) read the allowance a SECOND time — a caller reader returning a different value would make the
// row disagree with what was enforced, and (b) risk throwing (malformed cap / throwing reader)
// BEFORE the intent row is written, leaving the attempt unaudited. So this is total and never throws:
// it records the declared cap, and flags when an allowance may lower it at sign time.
function auditCapLabel(params) {
    const c = params.cap;
    const hasDeclared = c !== undefined && c !== null && c !== '';
    if (hasDeclared)
        return params.readAllowance ? `${String(c)} (or lower, per allowance at sign time)` : String(c);
    return params.readAllowance ? 'from_allowance' : 'cap_required';
}
async function guardedX402Payment(params, opts = {}) {
    (0, origin_1.assertOriginCanPay)(params.origin);
    const intent = {
        origin: params.origin,
        amount: String(params.amount),
        cap: auditCapLabel(params),
        agentId: params.agentId,
    };
    return (0, audit_1.auditThenAct)(intent, params.policy, async () => {
        // Receipt BEFORE pay: a throw here (unbuildable/invalid/unpersisted receipt) refuses the sign.
        if (params.writeReceipt)
            await params.writeReceipt();
        return (0, trustshell_1.buildX402Payment)(params);
    }, opts);
}
