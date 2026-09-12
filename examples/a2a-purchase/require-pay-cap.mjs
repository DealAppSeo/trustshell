/** Buyer spend ceiling. Never default to the listing price. */
export const PAY_CAP_MISSING =
  'set TRUSTSHELL_PAY_CAP (raw USDC units) — will not default to the listing price';

export const CAP_EXCEEDED =
  'cap_exceeded — amount above TRUSTSHELL_PAY_CAP; will not sign';

export function requirePayCap(env = process.env) {
  const cap = env.TRUSTSHELL_PAY_CAP;
  if (cap === undefined || cap === null || String(cap).trim() === '') {
    return { ok: false, message: PAY_CAP_MISSING };
  }
  return { ok: true, cap };
}

/** Amount above cap → refuse before any signer is loaded. */
export function refuseOverCap(amount, cap) {
  try {
    if (BigInt(amount) > BigInt(cap)) return { ok: false, message: CAP_EXCEEDED };
    return { ok: true };
  } catch {
    return { ok: false, message: CAP_EXCEEDED };
  }
}
