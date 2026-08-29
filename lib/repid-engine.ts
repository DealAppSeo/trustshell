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
  /**
   * The authority ceiling in raw engine units — or NULL when the backend withholds it.
   *
   * It is withheld for a builder whose path never applied the builder floor (a token_only demo
   * builder). Its computed figure is real arithmetic, but A_eff — the ceiling that actually
   * governs spend delegation — would refuse a budget against it, so quoting it promises something
   * that does not exist.
   *
   * NULL IS NOT ZERO, and the difference is the whole reason this field is nullable rather than
   * defaulted. `rawToUsdc(null)` returns 0, so anything that funnels this through the usual
   * conversion renders "$0.00" and states the opposite falsehood: that the ceiling was measured
   * and came out empty. Check `authority_withheld` BEFORE converting.
   */
  authority: string | null;
  /** True when the backend deliberately withheld a figure. Render "not established", never "$0". */
  authority_withheld?: boolean;
  /** False when the figure, if shown at all, is not one the spend gate would honour. */
  authority_is_binding?: boolean;
  /** Why it was withheld or is non-binding, in the backend's own words. */
  authority_detail?: string;
  basis: string;
};

/**
 * Decide what the UI should show for an authority ceiling.
 *
 * EXTRACTED FROM THE PAGE ON PURPOSE. This is a claim about what is true, not about layout, and
 * it has one hazard that a render function will get wrong every time: `rawToUsdc(null)` returns
 * **0**. So any code that converts before checking renders "$0.00" and asserts the ceiling was
 * measured and came out empty — the exact opposite falsehood from the one the backend withholds
 * the figure to avoid. Checking must happen BEFORE converting, and putting that in one tested
 * function is the only way it stays that way.
 *
 * Treats a missing `authority` as withheld even when the backend did not say so, because an older
 * backend that predates the flag still must not have its null read as zero.
 */
export function authorityCeilingDisplay(a: AuthoritySnapshot | null): {
  /** USD figure to show, or null when there is nothing honest to show. */
  usd: number | null;
  /** Render "Not established" — never "$0.00". */
  withheld: boolean;
  /** Shown, but the spend gate would not honour it. */
  nonBinding: boolean;
  detail?: string;
} {
  if (!a) return { usd: null, withheld: false, nonBinding: false };
  const withheld = a.authority_withheld === true || a.authority == null;
  if (withheld) {
    return {
      usd: null,
      withheld: true,
      nonBinding: true,
      ...(a.authority_detail ? { detail: a.authority_detail } : {}),
    };
  }
  return {
    usd: rawToUsdc(a.authority as string),
    withheld: false,
    nonBinding: a.authority_is_binding === false,
    ...(a.authority_detail ? { detail: a.authority_detail } : {}),
  };
}

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
 * Wired to GET /api/v1/stake/authority/:builder_id.
 *
 * Returns null on ANY failure — refused, server error, unreachable — so a caller cannot tell
 * those apart and MUST NOT render a reason it does not have. See the note in
 * fetchStakePositions; the same 401 that looked like an unfinished backend was an auth gate.
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
  // ENDPOINT CONFIRMED 2026-08-28, and the TODO that used to sit here was wrong in a way
  // worth recording: it read "confirm canonical endpoint", which invited the reader to
  // conclude the backend was unfinished. It is not. This path exists, is mounted, and
  // answers — it was returning 401 because it sat behind auth while this call sends no key
  // (repid-engine#504 opens the read). "Unfinished" and "gated" look identical from here,
  // and guessing between them is what put a false claim on the stake page.
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
// Grants — principal-to-principal authority (scope + budget + expiry + revoke)
//
// Wired to repid-engine's src/routes/mvp-api.ts / src/services/principal-grants.ts (new).
// Not a TODO-shaped contract like purchaseService below — this backend exists and was
// verified end-to-end (mint -> list -> revoke) against the live principal_grants table
// before this client was written.
// ---------------------------------------------------------------------------

export type GrantClass = 'spend' | 'hot' | 'warm' | 'cold';

export type Caveat =
  | { type: 'maxValue'; asset: string; amount: number }
  | { type: 'toolAllowlist'; tools: string[] }
  | { type: 'maxCalls'; limit: number };

export type Grant = {
  id: string;
  grantor_agent_id: string;
  grantee_agent_id: string;
  parent_grant_id: string | null;
  depth: number;
  grant_class: GrantClass;
  capabilities: string[];
  caveats: Caveat[];
  role: string | null;
  audit_for: string | null;
  not_before: string;
  expires_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
  mint_reason: string;
  created_at: string;
  idempotency_key: string | null;
  grantor_signature: string | null;
  grantor_wallet_address_used: string | null;
  /**
   * VERIFIED: grantor has a registered wallet_address and the mint intent signature matched it.
   * NOT_CHECKED: grantor has no wallet_address on record (most agents today — measured
   * 2026-08-20: 18 of 176). Never silently equivalent to VERIFIED; render them distinctly.
   */
  signature_status: 'VERIFIED' | 'NOT_CHECKED' | null;
};

/** A listed grant with liveness computed against its FULL ancestor chain, not just its own row. */
export type ListedGrant = Grant & { live: boolean; liveReason: string };

export type MintGrantResult = { ok: true; grant: Grant } | { ok: false; error: string };

/**
 * `idempotencyKey`: generate one client-side (e.g. crypto.randomUUID()) and reuse the SAME
 * value across retries of one logical mint attempt — a retry with the same key returns the
 * grant that attempt already minted rather than risking a duplicate.
 *
 * `signature`: an EIP-712 signature over the canonical GrantIntent typed-data payload
 * (repid-engine's src/services/principal-grant-intent.ts), signed by whoever holds the
 * grantor agent's registered wallet key. This client never signs anything — it only carries
 * a signature the caller already produced, the same "verify, don't sign" boundary the backend
 * itself holds. Omit it if the grantor has no registered wallet yet; the mint proceeds with
 * `signature_status: 'NOT_CHECKED'` rather than being blocked on wallet coverage that doesn't
 * exist yet for most agents.
 */
export async function mintGrant(input: {
  grantorAgentId: string;
  granteeAgentId: string;
  grantClass: GrantClass;
  capabilities: string[];
  caveats: Caveat[];
  ttlSeconds: number;
  role?: string;
  auditFor?: string;
  parentGrantId?: string;
  idempotencyKey?: string;
  signature?: string;
}): Promise<MintGrantResult> {
  const res = await fetch(`${REPID_ENGINE_URL}/api/v1/grants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grantor_agent_id: input.grantorAgentId,
      grantee_agent_id: input.granteeAgentId,
      grant_class: input.grantClass,
      capabilities: input.capabilities,
      caveats: input.caveats,
      ttl_seconds: input.ttlSeconds,
      role: input.role ?? null,
      audit_for: input.auditFor ?? null,
      parent_grant_id: input.parentGrantId ?? null,
      idempotency_key: input.idempotencyKey ?? null,
      signature: input.signature ?? null,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    return { ok: false, error: data?.error || `mint failed (${res.status})` };
  }
  return { ok: true, grant: data.grant as Grant };
}

/**
 * List every grant where `principal` is grantor or grantee. Returns `'error'` (unreachable
 * backend) distinctly from an empty list (reachable, genuinely zero grants) — the page must not
 * render "no grants" when the real answer is "could not check."
 */
export async function listGrantsFor(principal: string): Promise<ListedGrant[] | 'error'> {
  try {
    const res = await fetch(
      `${REPID_ENGINE_URL}/api/v1/grants?principal=${encodeURIComponent(principal)}`,
      { cache: 'no-store' }
    );
    if (!res.ok) return 'error';
    const data = await res.json();
    return Array.isArray(data?.grants) ? (data.grants as ListedGrant[]) : [];
  } catch {
    return 'error';
  }
}

export async function revokeGrant(
  grantId: string,
  requestedBy: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(`${REPID_ENGINE_URL}/api/v1/grants/${encodeURIComponent(grantId)}/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requested_by: requestedBy }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    return { ok: false, error: data?.error || `revoke failed (${res.status})` };
  }
  return { ok: true };
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

// ---------------------------------------------------------------------------
// Publish queue — the verification record for anything an agent wants to post.
//
// Wired to repid-engine's src/routes/social-queue.ts. The read is deliberately keyless and
// returns METADATA ONLY — id, platform, status, verdict, score, mode, author, timestamps.
// The draft copy itself is never returned, so this client cannot display unpublished content
// and must not pretend to.
// ---------------------------------------------------------------------------

export type QueuedDraft = {
  id: number;
  platform: string | null;
  status: string | null;
  /** clean | flagged | vetoed | abstain, or NULL meaning NOT CHECKED — never a pass. */
  hal_decision: string | null;
  hal_score: number | null;
  hal_mode: string | null;
  agent_id: string | null;
  verified_at: string | null;
  scheduled_for: string | null;
  posted_at: string | null;
  post_url: string | null;
  created_at: string | null;
};

export type QueueRead =
  | { kind: 'ok'; count: number; unverified: number; drafts: QueuedDraft[] }
  /**
   * The backend refused the read, and WE CANNOT TELL WHY FROM OUT HERE.
   *
   * MEASURED, and it is the reason this state is not called `not_deployed`: the engine runs
   * its auth middleware BEFORE routing, so an unknown path and a known-but-authed path
   * return the identical `401 Unauthorized: API key required`. A route that has not shipped
   * yet is indistinguishable from one that has and is gated.
   *
   * That ambiguity is not a detail — it is exactly why three broken reads went unnoticed on
   * this product. So the page says both possibilities rather than picking the flattering one.
   */
  | { kind: 'refused' }
  | { kind: 'error'; status: number };

/**
 * Read the publish queue.
 *
 * THE OUTCOMES ARE THE POINT, and none of them is an empty list. Folding a refusal into
 * "nothing queued" would render a measurement nobody made, which is the exact collapse this
 * product exists to refuse.
 *
 * CAUGHT BY RUNNING IT, NOT BY READING IT. The first version keyed "not deployed" off a 404
 * and never fired: the engine authenticates before it routes, so an unmapped path answers
 * 401 like any gated one. The build was green and the page rendered the wrong state — a
 * compile is not a run.
 */
export async function readPublishQueue(): Promise<QueueRead> {
  if (!REPID_ENGINE_URL) return { kind: 'refused' };
  try {
    const res = await fetch(`${REPID_ENGINE_URL}/api/v1/social/drafts`, { cache: 'no-store' });
    // 401 and 404 are the same fact from out here: the read did not happen. See `refused`.
    if (res.status === 401 || res.status === 404) return { kind: 'refused' };
    if (!res.ok) return { kind: 'error', status: res.status };
    const data = await res.json();
    return {
      kind: 'ok',
      count: Number(data?.count ?? 0),
      unverified: Number(data?.unverified ?? 0),
      drafts: Array.isArray(data?.drafts) ? (data.drafts as QueuedDraft[]) : [],
    };
  } catch {
    return { kind: 'error', status: 0 };
  }
}

// ---------------------------------------------------------------------------
// Preview RepID — what an action is WORTH, before anyone has done anything
// ---------------------------------------------------------------------------
//
// THE POINT OF THESE TWO CALLS IS THAT THEY WRITE NOTHING. A visitor with no agent, no
// key and no account can ask "what would I earn" and get a real answer off the same
// tariff the live scorer uses. Keyless by design: the engine bypasses auth for
// `GET /api/v1/repid/*`, so the browser calls it directly.
//
// EVERY FIELD THAT KEEPS THIS HONEST IS CARRIED THROUGH, NOT SUMMARISED AWAY. The engine
// labels its own answer `APPROXIMATE`, says `persisted: false`, flags the tier as a
// counterparty-gate approximation, and lists what it `omits`. A client that dropped any
// of those would turn a projection into a promise — which is exactly the failure this
// whole surface exists to avoid. So the types below mirror the payload rather than
// flattening it, and the page renders the caveats rather than the numbers alone.
//
// `verdict` is the three-outcome vocabulary, not a boolean:
//   APPROXIMATE — a published tariff value; real, but subject to decay and need-weight
//   NOT_CHECKED — the value CANNOT be stated before the event happens, or the live path
//                 awards nothing for it yet. Listed rather than hidden, because an action
//                 silently missing from a catalogue reads as an action that does not exist.

export type PreviewVerdict = 'APPROXIMATE' | 'NOT_CHECKED';

export type PreviewAction = {
  eventType: string;
  verdict: PreviewVerdict;
  delta: number | null;
  contingentOnEvidence: boolean;
  reason: string;
};

export type PreviewCatalog = {
  measurement: 'APPROXIMATE';
  persisted: false;
  actions: PreviewAction[];
  disclaimer: string;
};

export type PreviewProjection = {
  measurement: 'APPROXIMATE';
  persisted: false;
  baseRepId: number;
  projectedRepId: number;
  projectedTier: string;
  tierIsCounterpartyGateApproximation: boolean;
  tierCaveat: string;
  events: PreviewAction[];
  omits: string[];
};

/**
 * Fetch the action catalogue.
 *
 * Returns `'not_checked'` rather than `null` on any failure, and the caller MUST render
 * that as its own state. An empty list would read as "there are no actions", which is a
 * different and false claim; a thrown error would blank the page. Not reached is not the
 * same as nothing to show.
 */
export async function fetchPreviewCatalog(): Promise<PreviewCatalog | 'not_checked'> {
  if (!REPID_ENGINE_URL) return 'not_checked';
  try {
    const res = await fetch(`${REPID_ENGINE_URL}/api/v1/repid/preview/actions`, {
      cache: 'no-store',
    });
    if (!res.ok) return 'not_checked';
    const data = await res.json();
    if (!data?.ok || !Array.isArray(data.actions)) return 'not_checked';
    return data as PreviewCatalog;
  } catch {
    return 'not_checked';
  }
}

/**
 * Project a starting score forward over a chosen set of actions.
 *
 * `base` is omitted from the query when undefined so the engine applies its OWN default
 * rather than one invented here. Two defaults for one number is how they drift.
 */
export async function fetchPreviewProjection(input: {
  base?: number;
  eventTypes: string[];
}): Promise<PreviewProjection | 'not_checked'> {
  if (!REPID_ENGINE_URL) return 'not_checked';
  try {
    const q = new URLSearchParams();
    if (input.base !== undefined) q.set('base', String(input.base));
    q.set('events', input.eventTypes.join(','));
    const res = await fetch(
      `${REPID_ENGINE_URL}/api/v1/repid/preview/project?${q.toString()}`,
      { cache: 'no-store' },
    );
    if (!res.ok) return 'not_checked';
    const data = await res.json();
    if (!data?.ok || typeof data.projectedRepId !== 'number') return 'not_checked';
    return data as PreviewProjection;
  } catch {
    return 'not_checked';
  }
}
