import { assertOriginCanPay, AgentTurnOrigin } from './origin';
import { auditThenAct, SpendPolicy, AuditOpts } from './audit';
import { buildX402Payment, BuildX402PaymentParams } from './trustshell';

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
}

/**
 * The fail-closed spend path: assert the origin can pay, write the intent row + require a policy
 * (auditThenAct), THEN sign via `buildX402Payment` (which still enforces the cap). Use this from a
 * turn boundary that knows the origin. `buildX402Payment` stays the lower-level cap-checked signer
 * for advanced callers; this composes the origin + audit gates around it so neither can be skipped.
 *
 * Order matters: origin is checked FIRST (a turn that may not pay never even writes an intent), then
 * auditThenAct records the attempt before the policy gate and the signature.
 */
// What to record for the cap in the audit row. Deliberately does NOT re-read the allowance or
// BigInt-parse the declared cap: the signer (buildX402Payment → resolvePaymentCap) is the single
// source that reads the allowance and enforces min(declared, allowance). Re-deriving it here would
// (a) read the allowance a SECOND time — a caller reader returning a different value would make the
// row disagree with what was enforced, and (b) risk throwing (malformed cap / throwing reader)
// BEFORE the intent row is written, leaving the attempt unaudited. So this is total and never throws:
// it records the declared cap, and flags when an allowance may lower it at sign time.
function auditCapLabel(params: GuardedPaymentParams): string {
  const c = params.cap;
  const hasDeclared = c !== undefined && c !== null && c !== '';
  if (hasDeclared) return params.readAllowance ? `${String(c)} (or lower, per allowance at sign time)` : String(c);
  return params.readAllowance ? 'from_allowance' : 'cap_required';
}

export async function guardedX402Payment(params: GuardedPaymentParams, opts: AuditOpts = {}): Promise<string> {
  assertOriginCanPay(params.origin);
  const intent = {
    origin: params.origin,
    amount: String(params.amount),
    cap: auditCapLabel(params),
    agentId: params.agentId,
  };
  return auditThenAct(intent, params.policy, () => buildX402Payment(params), opts);
}
