/**
 * The SECOND RepID field: the ERC-8004 identity. The score says how an agent has behaved; the ID
 * says which agent it is. They are two different things, so they are read separately, returned
 * separately, and neither is ever derived from the other.
 *
 * Source: the public passport route, `GET /api/v1/passport/:id`. `GET /api/v1/repid/:id` returns
 * only the score (it has no mint status; see repidHonesty in honest-contract.ts), so the ID comes
 * from here.
 *
 * WHAT `MINTED` MEANS HERE (E-1). The engine's own `MINTED` is BOOKKEEPING: "we hold a mint
 * transaction for this agent". It is not a reading of the chain, and the record it comes from is
 * known to be wrong for most squad agents (a placeholder, a transaction hash, a valid but different
 * address, a near-miss of the registry in the registry column). A client that printed "on-chain"
 * from that word alone was repeating a database row as if it were a blockchain fact.
 *
 * So this client says MINTED, and "on-chain", only when BOTH hold:
 *   1. the registry the engine recorded is the canonical IdentityRegistry (not a placeholder, not a
 *      transaction hash, not another address, not a near-miss), and
 *   2. the engine's LIVE ownership read (`GET /api/v1/agents/:id/onchain`, ownerOf on the registry)
 *      found an owner for exactly this token id.
 * Anything else the engine called MINTED is `NOT_CHECKED` here, with `recordedState: 'MINTED'` so
 * nothing the engine said is lost, and the reason it could not be confirmed. This client does not
 * read the chain itself; it consumes the engine's read.
 *
 * Five states:
 *   MINTED       verified as above. The only state that may be called "on-chain".
 *   UNVERIFIED   a token id exists, but the engine has no record of the mint transaction. This is
 *                NOT the same as not minted: tokens in this state resolve on chain.
 *   NOT_MINTED   no ERC-8004 token has been minted for this agent (off-chain only).
 *   NOT_CHECKED  the passport could not be read, said something unclear, OR said MINTED and nothing
 *                confirmed it (see `recordedState` and `reason`). Never read as NOT_MINTED.
 */
export type MintStatus = 'MINTED' | 'UNVERIFIED' | 'NOT_MINTED' | 'NOT_CHECKED';

/** The ERC-8004 IdentityRegistry on Base Sepolia: a contract, not a wallet. The only registry this product is built on. */
export const IDENTITY_REGISTRY_BASE_SEPOLIA = '0x8004A818BFB912233c491871b3d84c89A494BD9e';

export type OnChainCheck = 'OWNER_FOUND' | 'REVERTED' | 'NO_TOKEN' | 'NOT_CHECKED';

/** The engine's live ownerOf cross-check, reduced to the parts a surface may rely on. */
export interface OnChainRead {
  check: OnChainCheck;
  /** The on-chain owner. Present only when `check` is OWNER_FOUND. */
  owner: string | null;
  /** true: the owner is the conservator the engine has on record; false: it differs; null: the engine had none on record. */
  ownerMatchesRecord: boolean | null;
}

/** The registry the engine RECORDED, judged against the canonical one. Never the engine's raw string. */
export type RegistryReading =
  | { status: 'CANONICAL'; address: string }
  | { status: 'NOT_CHECKED'; reason: string };

export interface AgentIdentity {
  /** MINTED only when verified on chain (see above). */
  registeredOnchain: MintStatus;
  /** The ERC-8004 token id as a decimal string, only when the engine sent a plain whole number. */
  tokenId: string | null;
  /** Why this is NOT_CHECKED, or why the token id was withheld. Absent when there is nothing to explain. */
  reason?: string;
  /** What the engine's RECORD said, when it said MINTED. Present exactly when that was not confirmed on chain. */
  recordedState?: 'MINTED';
  /** The registry the engine recorded, for a MINTED record. */
  registry?: RegistryReading;
  /** The live ownership read, for a MINTED record when one was made. */
  onChain?: OnChainRead;
}

const TOKEN_ID = /^(0|[1-9]\d{0,17})$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const TX_HASH = /^0x[0-9a-fA-F]{64}$/;
const ZERO_ADDRESS = /^0x0{40}$/;
/** The engine's machine reason for withholding a registry address (`transaction_hash`, `not_an_address`...). Anything else is not printed. */
const ENGINE_REASON = /^[a-z_]{1,40}$/;

export function notCheckedIdentity(reason: string): AgentIdentity {
  return { registeredOnchain: 'NOT_CHECKED', tokenId: null, reason };
}

/**
 * The registry the engine RECORDED, judged against the canonical IdentityRegistry. PURE. The result is
 * the canonical constant or NOT_CHECKED with a reason: never the engine's own string, which for most
 * squad agents is a placeholder, a transaction hash, another address or a near-miss.
 */
export function registryReading(raw: unknown, engineReason?: unknown): RegistryReading {
  const notChecked = (reason: string): RegistryReading => ({ status: 'NOT_CHECKED', reason });
  if (typeof raw !== 'string' || raw.trim() === '') {
    const theirs = typeof engineReason === 'string' && ENGINE_REASON.test(engineReason) ? ` (the engine's reason: ${engineReason})` : '';
    return notChecked(`the engine sent no registry address${theirs}`);
  }
  const v = raw.trim();
  if (TX_HASH.test(v)) return notChecked('the recorded registry is a transaction hash, not an address');
  if (!ADDRESS.test(v)) return notChecked('the recorded registry is not an address');
  if (v.toLowerCase() !== IDENTITY_REGISTRY_BASE_SEPOLIA.toLowerCase()) {
    return notChecked('the recorded registry is not the canonical IdentityRegistry');
  }
  return { status: 'CANONICAL', address: IDENTITY_REGISTRY_BASE_SEPOLIA };
}

/**
 * The engine's live ownerOf cross-check (`GET /api/v1/agents/:id/onchain`), reduced to what a surface may
 * rely on. PURE. OWNER_FOUND counts only when the owner is a real, non-zero address AND the read was about
 * exactly the token id the passport named. A body with no `check` (an older engine), a `check` this client
 * does not know, or anything malformed is NOT_CHECKED: it is not a confirmation and it is not a denial.
 */
export function onChainReadFrom(body: unknown, tokenId: string | null): OnChainRead {
  const none: OnChainRead = { check: 'NOT_CHECKED', owner: null, ownerMatchesRecord: null };
  if (!body || typeof body !== 'object') return none;
  const b = body as Record<string, unknown>;
  const check = b['check'];
  if (check === 'NO_TOKEN' || check === 'REVERTED') return { check, owner: null, ownerMatchesRecord: null };
  if (check !== 'OWNER_FOUND') return none;
  const owner = b['onChainOwner'];
  if (typeof owner !== 'string' || !ADDRESS.test(owner) || ZERO_ADDRESS.test(owner)) return none;
  const dbToken = b['dbTokenId'];
  const readToken = typeof dbToken === 'number' && Number.isSafeInteger(dbToken) && dbToken >= 0 ? String(dbToken) : typeof dbToken === 'string' ? dbToken.trim() : '';
  if (tokenId === null || readToken !== tokenId) return none;
  const conservator = b['dbConservator'];
  const ownerMatchesRecord = typeof conservator === 'string' && ADDRESS.test(conservator) ? conservator.toLowerCase() === owner.toLowerCase() : null;
  return { check: 'OWNER_FOUND', owner, ownerMatchesRecord };
}

/**
 * Is this identity ENTITLED to be called on-chain? True only for MINTED with the evidence that backs it: the
 * canonical registry recorded AND a live ownership read that found an owner. A hand-built or older object that
 * says MINTED with neither is not verified, whoever produced it. Every surface asks this, not the status word.
 */
export function isVerifiedOnChain(identity: AgentIdentity | undefined): boolean {
  return (
    !!identity &&
    identity.registeredOnchain === 'MINTED' &&
    identity.tokenId !== null &&
    identity.registry?.status === 'CANONICAL' &&
    identity.onChain?.check === 'OWNER_FOUND'
  );
}

/**
 * Read the identity out of a passport body, and, for a MINTED record, out of the engine's live ownership read.
 * PURE. Anything unclear is NOT_CHECKED, not NOT_MINTED. The engine's `MINTED` is a record of a mint
 * transaction, not a reading of the chain: without `onChainBody` confirming it, the result is NOT_CHECKED with
 * `recordedState: 'MINTED'` (see the header comment). UNVERIFIED and NOT_MINTED make no claim about the chain
 * and are passed through as the engine said them.
 */
export function identityFromPassport(body: unknown, onChainBody?: unknown): AgentIdentity {
  const p = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  const id = p && p['identity_erc8004'] && typeof p['identity_erc8004'] === 'object' ? (p['identity_erc8004'] as Record<string, unknown>) : null;
  if (!id) return notCheckedIdentity('the passport had no identity section');
  const state = id['registered_onchain'];
  if (state !== 'MINTED' && state !== 'UNVERIFIED' && state !== 'NOT_MINTED') {
    return notCheckedIdentity('the passport did not say whether a token is minted');
  }
  const raw = id['token_id'];
  const asText = typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0 ? String(raw) : typeof raw === 'string' ? raw.trim() : '';
  const tokenId = asText !== '' && TOKEN_ID.test(asText) ? asText : null;
  const tokenNote = tokenId === null && asText !== '' ? 'the engine sent a token id that is not a whole number, so it is not shown' : null;

  if (state !== 'MINTED') {
    if (tokenId !== null) return { registeredOnchain: state, tokenId };
    return { registeredOnchain: state, tokenId: null, ...(tokenNote ? { reason: tokenNote } : {}) };
  }

  // MINTED is the engine's RECORD. It becomes MINTED here only with a canonical registry AND a live ownership read.
  const registry = registryReading(id['contract_address'], id['contract_address_reason']);
  const onChain = onChainReadFrom(onChainBody, tokenId);
  const problems: string[] = [];
  if (tokenNote) problems.push(tokenNote);
  else if (tokenId === null) problems.push('the engine sent no token id');
  if (registry.status !== 'CANONICAL') problems.push(registry.reason);
  if (onChain.check === 'REVERTED') problems.push('the registry says no token with that id exists');
  else if (onChain.check === 'NO_TOKEN') problems.push('the engine has no token id to read on chain');
  else if (onChain.check !== 'OWNER_FOUND') {
    problems.push(onChainBody === undefined ? 'no live ownerOf read was made' : 'the live ownerOf read did not confirm it');
  }
  const evidence = { registry, ...(onChainBody === undefined ? {} : { onChain }) };
  if (problems.length === 0) return { registeredOnchain: 'MINTED', tokenId, ...evidence };
  return {
    registeredOnchain: 'NOT_CHECKED',
    tokenId,
    recordedState: 'MINTED',
    ...evidence,
    reason: `the engine records a mint transaction, but ${problems.join('; ')}`,
  };
}

/** One line for a terminal: the ID as its own field, with its state. */
export function formatIdentity(identity: AgentIdentity | undefined): string {
  if (!identity) return '  ERC-8004 ID  not checked';
  const id = identity.tokenId !== null ? `#${identity.tokenId}` : identity.registeredOnchain === 'NOT_MINTED' ? 'none yet' : 'not checked';
  let note: string;
  if (isVerifiedOnChain(identity)) {
    note =
      `on-chain: the engine's ownerOf read found an owner for this token, and the recorded registry is the canonical IdentityRegistry ${IDENTITY_REGISTRY_BASE_SEPOLIA}` +
      (identity.onChain?.ownerMatchesRecord === false ? '; the on-chain owner is NOT the conservator the engine has on record' : '');
  } else if (identity.registeredOnchain === 'MINTED') {
    // Says MINTED but carries no evidence for it (an older or hand-built object): never printed as on-chain.
    note = 'NOT_CHECKED: recorded as minted, but nothing here confirmed it on chain';
  } else if (identity.registeredOnchain === 'UNVERIFIED') {
    note = 'has a token id; no record of the mint transaction here, which is not the same as not minted';
  } else if (identity.registeredOnchain === 'NOT_MINTED') {
    note = 'off-chain only';
  } else if (identity.recordedState === 'MINTED') {
    note = `NOT_CHECKED: ${identity.reason ?? 'recorded as minted, not confirmed on chain'}. Recorded, not verified: this is not on-chain until an ownership read confirms it`;
  } else {
    note = identity.reason ?? 'not checked';
  }
  return `  ERC-8004 ID  ${id}  (${note})`;
}
