"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.guardedX402Payment = guardedX402Payment;
const origin_1 = require("./origin");
const audit_1 = require("./audit");
const trustshell_1 = require("./trustshell");
/**
 * The fail-closed spend path: assert the origin can pay, write the intent row + require a policy
 * (auditThenAct), decide the payment (`prepareX402Payment`: the cap, the address and key, the Guard's spend
 * decision), write the receipt, THEN sign. Use this from a turn boundary that knows the origin.
 * `buildX402Payment` stays the lower-level cap-checked signer for advanced callers; this composes the
 * origin + audit gates around it so neither can be skipped.
 *
 * Order matters: origin is checked FIRST (a turn that may not pay never even writes an intent), then
 * auditThenAct records the attempt before the policy gate; then EVERY refusal is decided; then the receipt
 * is written; then the signature. Nothing that can refuse runs after the receipt except the receipt writer
 * itself, so a receipt exists only for a payment that was allowed. A receipt-write failure refuses the spend
 * — write-receipt-BEFORE-pay is fail-closed — and the Guard's one count for it stays (it errs high, never low).
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
        // Decide first: amount, cap, address, key and the Guard's spend decision (counted once, here). Any refusal
        // throws before a receipt exists; the attempt is already on the log, written above.
        const prepared = await (0, trustshell_1.prepareX402Payment)(params);
        // Receipt BEFORE pay: a throw here (unbuildable/invalid/unpersisted receipt) refuses the sign.
        if (params.writeReceipt)
            await params.writeReceipt();
        return prepared.sign();
    }, opts);
}
