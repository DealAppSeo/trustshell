/**
 * `ethers` is an OPTIONAL peer dependency from 1.6.0. Only two SDK functions use it: signing an
 * x402 payment (`buildX402Payment` / `guardedX402Payment`) and the keyless on-chain read behind
 * `verifySigner`. Measured on the published 1.5.0, it was 23 of the 50 MB every install pulled,
 * for `verify`, `check`, `repid` and `proof` users who never touch a chain.
 *
 * A caller of those two paths who has not installed it gets this error, which says what to run,
 * instead of a module-resolution stack trace. Any other failure inside ethers is rethrown as is.
 */
export declare class MissingDependencyError extends Error {
    readonly code = "ETHERS_MISSING";
    constructor(purpose: string);
}
export declare function loadEthers(purpose: string): Promise<typeof import('ethers')>;
