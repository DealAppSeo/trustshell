import { TrustShellError } from './trustshell';

/**
 * Where an agent turn came from. A turn that reaches a spend without a stamped,
 * recognized origin is `Unknown` — and `Unknown` may never pay. Callers stamp the
 * origin at the trust boundary they own (CLI entry, MCP request, hosted Site, Market
 * dispatch). Fail-closed: an absent or unrecognized origin never inherits max trust,
 * it is refused. Mirrors the cap rule in `buildX402Payment` — missing config = refuse,
 * not allow.
 */
export type AgentTurnOrigin = 'Cli' | 'Site' | 'Mcp' | 'Market' | 'Unknown';

/** The origins permitted to initiate a spend. `Unknown` is deliberately absent. */
export const PAY_CAPABLE_ORIGINS = ['Cli', 'Site', 'Mcp', 'Market'] as const;
export type PayCapableOrigin = (typeof PAY_CAPABLE_ORIGINS)[number];

/** True only for a known, pay-capable origin. `undefined`, `Unknown`, and any unrecognized string are false. */
export function canPay(origin: AgentTurnOrigin | undefined): origin is PayCapableOrigin {
  return origin !== undefined && (PAY_CAPABLE_ORIGINS as readonly string[]).includes(origin);
}

/**
 * Throw unless `origin` is a known pay-capable origin. Missing / `Unknown` / unrecognized
 * all refuse with HTTP 403 — the same fail-closed posture as a missing cap. Call this at
 * the top of any spend path (x402 payment, A2A escrow) before touching a key.
 */
export function assertOriginCanPay(origin?: AgentTurnOrigin): asserts origin is PayCapableOrigin {
  if (!canPay(origin)) {
    throw new TrustShellError(
      `origin_refused: turn origin ${origin ?? 'Unknown'} may not pay (fail-closed)`,
      403,
    );
  }
}
