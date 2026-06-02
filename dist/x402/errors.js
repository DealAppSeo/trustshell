"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.X402SettlementFailedError = exports.X402PaymentRequiredError = void 0;
class X402PaymentRequiredError extends Error {
    constructor(challenge) {
        super(challenge.error || 'Payment Required');
        this.name = 'X402PaymentRequiredError';
        this.challenge = challenge;
    }
}
exports.X402PaymentRequiredError = X402PaymentRequiredError;
class X402SettlementFailedError extends Error {
    constructor(message) {
        super(message);
        this.name = 'X402SettlementFailedError';
    }
}
exports.X402SettlementFailedError = X402SettlementFailedError;
//# sourceMappingURL=errors.js.map