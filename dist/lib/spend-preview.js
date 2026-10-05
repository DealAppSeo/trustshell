"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.spendPreview = spendPreview;
/**
 * Preview a spend of 50 or 100. The amount is a number. This does not send.
 */
function spendPreview(amount) {
    if (amount !== 50 && amount !== 100) {
        throw new Error('preview amount must be 50 or 100');
    }
    return { amount, send: false };
}
