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
// The ceiling the signer will actually enforce, for the audit row. Mirrors resolvePaymentCap's
// min(declared, allowance) — but audit-only, so it NEVER throws (the signer still resolves + enforces
// + throws no_allowance_set/cap_required). Records the number that applied at sign time, since a
// later allowance change would otherwise make the row unreadable. Returns a marker if unresolvable.
// ponytail: mirrors resolvePaymentCap; keep in sync if that min-logic changes.
function effectiveCapForAudit(params: GuardedPaymentParams): string {
  const declared = params.cap;
  const hasDeclared = declared !== undefined && declared !== null && declared !== '';
  if (params.readAllowance && params.agentId) {
    const allowed = params.readAllowance(params.agentId);
    if (allowed === undefined) return hasDeclared ? `${declared} (allowance unset)` : 'no_allowance_set';
    if (!hasDeclared) return String(allowed);
    const d = BigInt(declared as number | bigint | string);
    return String(allowed < d ? allowed : d); // effective = min(allowance, declared)
  }
  return hasDeclared ? String(declared) : 'cap_required';
}

export async function guardedX402Payment(params: GuardedPaymentParams, opts: AuditOpts = {}): Promise<string> {
  assertOriginCanPay(params.origin);
  const intent = {
    origin: params.origin,
    amount: String(params.amount),
    cap: effectiveCapForAudit(params), // the ceiling actually enforced, not just the declared cap
    agentId: params.agentId,
  };
  return auditThenAct(intent, params.policy, () => buildX402Payment(params), opts);
}
