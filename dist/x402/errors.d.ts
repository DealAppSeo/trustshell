import { X402Challenge } from './types';
export declare class X402PaymentRequiredError extends Error {
    readonly challenge: X402Challenge;
    constructor(challenge: X402Challenge);
}
export declare class X402SettlementFailedError extends Error {
    constructor(message: string);
}
//# sourceMappingURL=errors.d.ts.map