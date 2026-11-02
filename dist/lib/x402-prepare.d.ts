import { type BuildX402PaymentParams } from './trustshell';
/**
 * A payment that has passed every check that can refuse it: origin, amount, cap, address, key, the typed data,
 * and the owner's Guard decision (already recorded and counted). Only the signature is left.
 */
export interface PreparedX402Payment {
    /**
     * Sign and return the base64 X-PAYMENT header. SINGLE-USE: the first call signs, every later call throws and
     * signs nothing. One Guard decision (and its spend limits) therefore buys one signature; another payment needs
     * another `prepareX402Payment`, which is another decision and another count.
     */
    sign(): Promise<string>;
}
/**
 * INTERNAL: not exported by the package root (src/lib/index.ts) or by any `exports` subpath; only `buildX402Payment`
 * (src/lib/trustshell.ts) and `guardedX402Payment` (src/lib/guarded-payment.ts) call it. tests/x402-prepare-internal.test.ts
 * fails if the root exposes it.
 *
 * The deciding half of `buildX402Payment`: everything that can REFUSE a payment, in the order it always ran, ending
 * with the Guard's spend decision (C4/C8). It signs nothing. `guardedX402Payment` calls this, then writes its
 * pre-pay receipt, then `sign()`, so a payment that is refused never leaves a receipt behind.
 *
 * Count rule: the Guard decision is the one and only count, made here, once per payment, after every other check
 * has passed (a refusal above counts nothing). The ledger is append-only and only an ALLOWED decision counts, so a
 * payment decided here and then not made (the receipt writer throws, or the signer fails) stays counted: the
 * ledger can read HIGHER than what was signed, never lower, because no signature exists without its record.
 */
export declare function prepareX402Payment(params: BuildX402PaymentParams): Promise<PreparedX402Payment>;
