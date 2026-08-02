// Thin client for repid-engine HTTP endpoints used by the app UI.
// All calls target NEXT_PUBLIC_REPID_ENGINE_URL (see existing usage in
// app/run/[agentId]/page.tsx, app/agents/page.tsx). Kept dependency-free
// so it can run in the browser.

export const REPID_ENGINE_URL = process.env.NEXT_PUBLIC_REPID_ENGINE_URL || '';

// USDC is 6-decimal. Backend stake math stores raw micro-USDC integers.
export const USDC_DECIMALS = 6;

export function usdcToRaw(usdc: number): string {
  return BigInt(Math.round(usdc * 10 ** USDC_DECIMALS)).toString();
}

export function rawToUsdc(raw: string | number | bigint | null | undefined): number {
  if (raw == null) return 0;
  return Number(BigInt(String(raw))) / 10 ** USDC_DECIMALS;
}

// ---------------------------------------------------------------------------
// Staking
// ---------------------------------------------------------------------------

export type AuthoritySnapshot = {
  builder_id: string;
  stake_total: string; // raw micro-USDC
  authority: string; // authority ceiling (raw / engine units)
  basis: string;
};

export type StakeDepositResult = {
  ok: boolean;
  error?: string;
  [k: string]: unknown;
};

/**
 * Fetch the exact text a wallet must sign to claim a real (on-chain) deposit.
 *
 * We ask the server rather than rebuilding the string here on purpose: if the
 * two ever drift, the failure should be a rejected signature, not a subtly
 * wrong sentence shown to someone in the moment they decide to sign.
 */
export async function fetchStakeSignMessage(input: {
  builder_address: string;
  amount_raw: string;
  tx_hash: string;
}): Promise<string | null> {
  try {
    const q = new URLSearchParams({
      wallet: input.builder_address,
      amount: input.amount_raw,
      tx_hash: input.tx_hash,
    });
    const res = await fetch(`${REPID_ENGINE_URL}/api/v1/stake/deposit/message?${q}`);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.message === 'string' ? data.message : null;
  } catch {
    return null;
  }
}

/**
 * Deposit a stake to back an agent's authority.
 * Wired to POST /api/v1/stake/deposit.
 *
 * AUTHORIZATION SCALES WITH WHAT IS BEING CREDITED, and the client mirrors the
 * server's ladder rather than guessing at it:
 *   simulated (no tx_hash) — the account's own login token is enough, so a
 *                            signed-in user clicks once and is done.
 *   real (tx_hash present) — additionally a wallet signature over that exact
 *                            wallet, amount and tx. A session proves an email
 *                            login; a deposit credits value against a wallet.
 *
 * `signature` is passed straight through; obtaining it belongs to the page that
 * owns the wallet prompt, so this module stays dependency-free.
 */
export async function depositStake(input: {
  builder_address: string;
  amount_usdc: number;
  tx_hash?: string;
  signature?: string;
  /** Supply from lib/account.ts accountHeader(). */
  authHeaders?: Record<string, string>;
}): Promise<StakeDepositResult> {
  const res = await fetch(`${REPID_ENGINE_URL}/api/v1/stake/deposit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(input.authHeaders ?? {}) },
    body: JSON.stringify({
      builder_address: input.builder_address,
      // Backend demo path keys off the literal "100"; otherwise send raw micro-USDC.
      amount: input.amount_usdc === 100 ? '100' : usdcToRaw(input.amount_usdc),
      tx_hash: input.tx_hash,
      signature: input.signature,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      error: data?.error || `deposit failed (${res.status})`,
      message: data?.message,
      status: res.status,
    };
  }
  return { ok: true, ...data };
}

/**
 * Plain language for each reason the backend declines to credit a deposit.
 * A raw `not_your_account` on screen is exactly the dead end DESIGN_PRINCIPLES
 * exists to prevent — every one of these says what to do next.
 */
export const STAKE_AUTH_ERRORS: Record<string, string> = {
  no_credential: 'Verify your email first — that gives you the account this stake credits.',
  invalid_session: 'Your session expired. Verify your email again to continue.',
  not_your_account: 'That address belongs to a different account.',
  account_not_found: 'No account is registered under that address yet.',
  signature_required: 'Real deposits need a wallet signature — approve the prompt to continue.',
  bad_signature: "That signature didn't match this deposit. Try signing again.",
};

/**
 * Read the current stake total + authority ceiling for a builder/agent.
 * Wired to GET /api/v1/stake/authority/:builder_id (v1.ts:404).
 */
export async function fetchAuthority(builderId: string): Promise<AuthoritySnapshot | null> {
  try {
    const res = await fetch(
      `${REPID_ENGINE_URL}/api/v1/stake/authority/${encodeURIComponent(builderId)}`
    );
    if (!res.ok) return null;
    return (await res.json()) as AuthoritySnapshot;
  } catch {
    return null;
  }
}

// TODO(review): depends on backend endpoint X — there is no single public
// "list my stakes + earned rewards" endpoint yet. mvp-api exposes
// GET /api/v1/staking/:agent ({ total_active_usdc, deposits[] }) but its shape
// (staking_deposits table) differs from the v1 stake vault used above. Once the
// backend settles on one canonical read surface, wire fetchStakePositions here.
export type StakePosition = {
  id: string;
  amount_usdc: number;
  status: string;
  staked_at?: string;
  earned_rewards_usdc?: number;
};

export async function fetchStakePositions(agent: string): Promise<{
  total_active_usdc: number;
  positions: StakePosition[];
} | null> {
  // TODO(review): confirm canonical endpoint. Using mvp-api /staking/:agent shape.
  try {
    const res = await fetch(
      `${REPID_ENGINE_URL}/api/v1/staking/${encodeURIComponent(agent)}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const deposits: Record<string, unknown>[] = Array.isArray(data?.deposits)
      ? data.deposits
      : [];
    return {
      total_active_usdc: Number(data?.total_active_usdc ?? 0),
      positions: deposits.map((d) => ({
        id: String(d.id ?? crypto.randomUUID()),
        amount_usdc: Number(d.amount_usdc ?? 0),
        status: String(d.status ?? 'unknown'),
        staked_at: d.staked_at != null ? String(d.staked_at) : undefined,
        // TODO(review): backend does not yet return per-stake earned rewards.
        earned_rewards_usdc:
          d.earned_rewards_usdc != null ? Number(d.earned_rewards_usdc) : undefined,
      })),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Marketplace trade / x402
// ---------------------------------------------------------------------------

export type TradeQuote = {
  fee_usdc: number;
  service_type: string;
  service_name?: string;
  provider_agent_id: string;
};

export type TradeReceipt = {
  ok: boolean;
  tx_hash?: string;
  settlement_url?: string;
  repid_delta?: number;
  receipt_id?: string;
  error?: string;
  [k: string]: unknown;
};

/**
 * Purchase a marketplace service from a provider agent.
 *
 * TODO(review): depends on backend endpoint POST /api/v1/agent/:agentId/trade
 * — this endpoint does NOT exist yet in repid-engine (verified: no /trade route
 * under src/routes). Coded against the agreed contract below so the UI is ready
 * the moment the backend lands. Expected contract:
 *   POST /api/v1/agent/:agentId/trade
 *   body: { buyer_agent_id, service_type, provider_agent_id? }
 *   200 -> { ok, tx_hash, settlement_url, repid_delta, receipt_id }
 *   402 -> { ok:false, error, x402_challenge }  (payment required)
 */
export async function purchaseService(input: {
  providerAgentId: string;
  buyerAgentId: string;
  serviceType: string;
}): Promise<TradeReceipt> {
  const res = await fetch(
    `${REPID_ENGINE_URL}/api/v1/agent/${encodeURIComponent(input.providerAgentId)}/trade`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        buyer_agent_id: input.buyerAgentId,
        service_type: input.serviceType,
        provider_agent_id: input.providerAgentId,
      }),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: data?.error || `trade failed (${res.status})`, ...data };
  }
  return { ok: true, ...data };
}
