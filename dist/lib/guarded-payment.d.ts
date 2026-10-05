import { AgentTurnOrigin } from './origin';
import { SpendPolicy, AuditOpts } from './audit';
import { BuildX402PaymentParams } from './trustshell';
/**
 * Params for the fail-closed spend entry point. Everything `buildX402Payment` needs, PLUS the two
 * pre-user gates: a pay-capable `origin` (SLICE 1) and a `policy` (SLICE 2). `agentId` is required
 * here (it is optional on the raw signer) so the audit intent row can name who is spending.
 */
export interface GuardedPaymentParams extends BuildX402PaymentParams {
    /** Where the turn came from. `Unknown`/undefined refuses — an unstamped turn never inherits max trust. */
    origin: AgentTurnOrigin;
    /** Spend policy. Its ABSENCE (null/undefined) refuses — a spend with no policy behind it never signs. */
    policy: SpendPolicy | null | undefined;
    /** Who is spending — required for the audit intent row. */
    agentId: string;
    /**
     * Provenance receipt writer, run AFTER the policy gate and BEFORE signing. If it THROWS — the
     * receipt can't be built, validated (schemas/receipt.schema.json), or persisted — the payment
     * REFUSES: no receipt, no signature. Build + validate with write-receipt.mjs's buildReceipt /
     * validateReceipt and persist inside this thunk; throw on any failure. Absent = no receipt gate.
     */
    writeReceipt?: () => void | Promise<void>;
}
export declare function guardedX402Payment(params: GuardedPaymentParams, opts?: AuditOpts): Promise<string>;
