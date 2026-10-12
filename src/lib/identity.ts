/**
 * The SECOND RepID field: the ERC-8004 identity. The score says how an agent has behaved; the ID
 * says which agent it is. They are two different things, so they are read separately, returned
 * separately, and neither is ever derived from the other.
 *
 * Source: the public passport route, `GET /api/v1/passport/:id`. `GET /api/v1/repid/:id` returns
 * only the score (it has no mint status; see repidHonesty in honest-contract.ts), so the ID comes
 * from here.
 *
 * Three states, plus one for "did not look":
 *   MINTED       an ERC-8004 token exists and the engine holds the mint transaction.
 *   UNVERIFIED   a token id exists, but the engine has no record of the mint transaction. This is
 *                NOT the same as not minted: tokens in this state resolve on chain.
 *   NOT_MINTED   no ERC-8004 token has been minted for this agent (off-chain only).
 *   NOT_CHECKED  the passport could not be read, or said something unclear. Never read as NOT_MINTED.
 */
export type MintStatus = 'MINTED' | 'UNVERIFIED' | 'NOT_MINTED' | 'NOT_CHECKED';

export interface AgentIdentity {
  registeredOnchain: MintStatus;
  /** The ERC-8004 token id as a decimal string, only when the engine sent a plain whole number. */
  tokenId: string | null;
  /** Why this is NOT_CHECKED, or why the token id was withheld. Absent when there is nothing to explain. */
  reason?: string;
}

const TOKEN_ID = /^(0|[1-9]\d{0,17})$/;

export function notCheckedIdentity(reason: string): AgentIdentity {
  return { registeredOnchain: 'NOT_CHECKED', tokenId: null, reason };
}

/** Read the identity out of a passport body. PURE. Anything unclear is NOT_CHECKED, not NOT_MINTED. */
export function identityFromPassport(body: unknown): AgentIdentity {
  const p = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  const id = p && p['identity_erc8004'] && typeof p['identity_erc8004'] === 'object' ? (p['identity_erc8004'] as Record<string, unknown>) : null;
  if (!id) return notCheckedIdentity('the passport had no identity section');
  const state = id['registered_onchain'];
  if (state !== 'MINTED' && state !== 'UNVERIFIED' && state !== 'NOT_MINTED') {
    return notCheckedIdentity('the passport did not say whether a token is minted');
  }
  const raw = id['token_id'];
  const asText = typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0 ? String(raw) : typeof raw === 'string' ? raw.trim() : '';
  if (asText !== '' && TOKEN_ID.test(asText)) return { registeredOnchain: state, tokenId: asText };
  return {
    registeredOnchain: state,
    tokenId: null,
    ...(asText !== '' ? { reason: 'the engine sent a token id that is not a whole number, so it is not shown' } : {}),
  };
}

/** One line for a terminal: the ID as its own field, with its state. */
export function formatIdentity(identity: AgentIdentity | undefined): string {
  if (!identity) return '  ERC-8004 ID  not checked';
  const id = identity.tokenId !== null ? `#${identity.tokenId}` : identity.registeredOnchain === 'NOT_MINTED' ? 'none yet' : 'not checked';
  const note =
    identity.registeredOnchain === 'MINTED'
      ? 'on-chain'
      : identity.registeredOnchain === 'UNVERIFIED'
        ? 'has a token id; no record of the mint transaction here, which is not the same as not minted'
        : identity.registeredOnchain === 'NOT_MINTED'
          ? 'off-chain only'
          : identity.reason ?? 'not checked';
  return `  ERC-8004 ID  ${id}  (${note})`;
}
