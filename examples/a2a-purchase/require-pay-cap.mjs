/** Buyer spend ceiling. Never default to the listing price. */
export const PAY_CAP_MISSING =
  'set TRUSTSHELL_PAY_CAP (raw USDC units) — will not default to the listing price';

export function requirePayCap(env = process.env) {
  const cap = env.TRUSTSHELL_PAY_CAP;
  if (cap === undefined || cap === null || String(cap).trim() === '') {
    return { ok: false, message: PAY_CAP_MISSING };
  }
  return { ok: true, cap };
}
