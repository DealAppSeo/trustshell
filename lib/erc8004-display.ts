/**
 * What the passport may PRINT about an agent's ERC-8004 identity: the canonical registry address,
 * a token id, a mint transaction, or NOT_CHECKED. Never a string the engine happened to hold.
 *
 * WHY THIS EXISTS. The passport page printed `identity_erc8004.contract_address` verbatim. For 11 of
 * the 12 squad agents that field holds something that is not an address at all: names with non-hex
 * letters, a placeholder meaning "pending-mint", a transaction hash in the address column, an
 * externally-owned account, a value one character short [MEASURED 2026-10-12 against production];
 * only one agent's matched the real registry. The page then showed all of it, under a heading that
 * says "every fact below is a recorded fact". A headline ID row that prints a placeholder is the
 * product failing its own sentence.
 *
 * The engine/database data is not fixed here: that is a follow-up in repid-engine, and it is not
 * this repo's to rewrite. This is the web-side guard, and it is deliberately strict in ONE
 * direction: it will show NOT_CHECKED for an address that is a perfectly valid, different address,
 * because a registry other than the one this product is built on is not a thing a stranger should be
 * handed as "the registry" without a check that nothing here can make.
 *
 * Three outcomes, never two: the canonical value, or NOT_CHECKED with the reason. An unknown never
 * becomes a blank, and never becomes a guess.
 */

/** ERC-8004 IdentityRegistry on Base Sepolia. A contract, not a wallet. */
export const IDENTITY_REGISTRY_BASE_SEPOLIA = '0x8004A818BFB912233c491871b3d84c89A494BD9e';
/** ERC-8004 ReputationRegistry on Base Sepolia. */
export const REPUTATION_REGISTRY_BASE_SEPOLIA = '0x8004B663056A597Dffe9eCcC1965A193B7388713';

const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HEX_TX = /^0x[0-9a-fA-F]{64}$/;
const TOKEN_ID = /^(0|[1-9]\d{0,17})$/;

export type RegistryShown =
  | { state: 'CANONICAL'; address: string }
  | { state: 'NOT_CHECKED'; reason: string };

function registryShown(raw: unknown, canonical: string, which: string): RegistryShown {
  if (typeof raw !== 'string' || raw.trim() === '') return { state: 'NOT_CHECKED', reason: `the engine sent no ${which} address` };
  const v = raw.trim();
  if (!HEX_ADDRESS.test(v)) return { state: 'NOT_CHECKED', reason: `the engine sent something that is not an address for the ${which}` };
  if (v.toLowerCase() !== canonical.toLowerCase()) {
    return { state: 'NOT_CHECKED', reason: `the engine named a different address than the ${which} this product is built on` };
  }
  // Always print OUR constant, never the engine's casing.
  return { state: 'CANONICAL', address: canonical };
}

/** The IdentityRegistry to print, or NOT_CHECKED. */
export function identityRegistryShown(raw: unknown): RegistryShown {
  return registryShown(raw, IDENTITY_REGISTRY_BASE_SEPOLIA, 'IdentityRegistry');
}

/** The ReputationRegistry to print, or NOT_CHECKED. */
export function reputationRegistryShown(raw: unknown): RegistryShown {
  return registryShown(raw, REPUTATION_REGISTRY_BASE_SEPOLIA, 'ReputationRegistry');
}

export type TokenIdShown = { state: 'ID'; id: string } | { state: 'NOT_CHECKED'; reason: string };

/** An ERC-8004 token id is a plain non-negative whole number. Anything else is not printed. */
export function tokenIdShown(raw: unknown): TokenIdShown {
  const v = typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0 ? String(raw) : typeof raw === 'string' ? raw.trim() : '';
  if (v === '') return { state: 'NOT_CHECKED', reason: 'the engine sent no token id' };
  if (!TOKEN_ID.test(v)) return { state: 'NOT_CHECKED', reason: 'the engine sent a token id that is not a whole number' };
  return { state: 'ID', id: v };
}

/** The mint link, only when it really is a Base Sepolia transaction page. Else null. */
export function mintTxUrlShown(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const m = /^https:\/\/sepolia\.basescan\.org\/tx\/(0x[0-9a-fA-F]{64})$/.exec(raw.trim());
  return m && HEX_TX.test(m[1]!) ? raw.trim() : null;
}

/**
 * The engine's three states, plus NOT_CHECKED for anything it did not say clearly. In what this module RETURNS
 * for display (`twoFieldsOf`, `mintVerdictOf`), `MINTED` means VERIFIED: see {@link mintVerdictOf}. The engine's
 * own word is only ever a record (`mintStateShown` reads the word, nothing more).
 */
export type MintState = 'MINTED' | 'UNVERIFIED' | 'NOT_MINTED' | 'NOT_CHECKED';

/** The engine's WORD, validated. A record of a mint transaction is not a reading of the chain: do not print "on-chain" from this. */
export function mintStateShown(raw: unknown): MintState {
  return raw === 'MINTED' || raw === 'UNVERIFIED' || raw === 'NOT_MINTED' ? raw : 'NOT_CHECKED';
}

const ADDRESS_SHAPE = HEX_ADDRESS;
const ZERO_ADDRESS = /^0x0{40}$/;

/** The engine's live ownerOf cross-check (GET /api/v1/agents/:id/onchain), reduced to what the page may rely on. */
export type OnChainShown = {
  check: 'OWNER_FOUND' | 'REVERTED' | 'NO_TOKEN' | 'NOT_CHECKED';
  /** true: the on-chain owner is the conservator the engine has on record; false: it differs; null: none on record. */
  ownerMatchesRecord: boolean | null;
};

/**
 * OWNER_FOUND counts only with a real non-zero owner AND a read about exactly the token the passport named. No
 * `check` (an older engine), an unknown `check` or anything malformed is NOT_CHECKED: not a confirmation, not a
 * denial. (Same rule as onChainReadFrom in src/lib/identity.ts and the extension; tests/mint-honesty-popup.test.ts
 * and tests/mint-honesty-web.test.ts hold them equal.)
 */
export function onChainShown(body: unknown, tokenId: string | null): OnChainShown {
  const none: OnChainShown = { check: 'NOT_CHECKED', ownerMatchesRecord: null };
  if (!body || typeof body !== 'object') return none;
  const b = body as Record<string, unknown>;
  const check = b.check;
  if (check === 'NO_TOKEN' || check === 'REVERTED') return { check, ownerMatchesRecord: null };
  if (check !== 'OWNER_FOUND') return none;
  const owner = b.onChainOwner;
  if (typeof owner !== 'string' || !ADDRESS_SHAPE.test(owner) || ZERO_ADDRESS.test(owner)) return none;
  const t = b.dbTokenId;
  const readToken = typeof t === 'number' && Number.isSafeInteger(t) && t >= 0 ? String(t) : typeof t === 'string' ? t.trim() : '';
  if (tokenId === null || readToken !== tokenId) return none;
  const conservator = b.dbConservator;
  return {
    check: 'OWNER_FOUND',
    ownerMatchesRecord: typeof conservator === 'string' && ADDRESS_SHAPE.test(conservator) ? conservator.toLowerCase() === owner.toLowerCase() : null,
  };
}

/**
 * The same ownerOf cross-check, read from the ADDITIVE `onchain` object the passport now folds in
 * (repid-engine #1330), so the one `GET /passport/:id` carries the read and the second `GET /agents/:id/onchain`
 * is not made. OWNER_FOUND counts only with a real non-zero owner. The embedded read is computed by the engine
 * for this passport's agent, so there is no separate token id to cross-check. `ownerMatchesRecord` is null: the
 * embedded object carries no conservator. Same rule as onChainReadFromPassport in src/lib/identity.ts.
 */
export function onChainShownFromPassport(onchain: unknown): OnChainShown {
  const none: OnChainShown = { check: 'NOT_CHECKED', ownerMatchesRecord: null };
  if (!onchain || typeof onchain !== 'object') return none;
  const b = onchain as Record<string, unknown>;
  const check = b.check;
  if (check === 'NO_TOKEN' || check === 'REVERTED') return { check, ownerMatchesRecord: null };
  if (check !== 'OWNER_FOUND') return none;
  const owner = b.owner;
  if (typeof owner !== 'string' || !ADDRESS_SHAPE.test(owner) || ZERO_ADDRESS.test(owner)) return none;
  return { check: 'OWNER_FOUND', ownerMatchesRecord: null };
}

/** True when a value is the passport's folded-in `onchain` object, not the older second-call body. The
 *  `verified` boolean marks it: the `/agents/:id/onchain` body never carries one, so the two never mix. */
function isEmbeddedOnChain(body: unknown): boolean {
  return !!body && typeof body === 'object' && typeof (body as Record<string, unknown>).verified === 'boolean';
}

/** The `onchain` object repid-engine folds into the passport (#1330), when present and of that shape, else undefined. */
export function embeddedOnChain(passport: unknown): unknown {
  const p = passport && typeof passport === 'object' ? (passport as Record<string, unknown>) : null;
  const o = p?.onchain;
  return isEmbeddedOnChain(o) ? o : undefined;
}

/**
 * What the page may SAY about an agent's mint (E-1). The engine's `MINTED` is a RECORD ("we hold a mint
 * transaction"), not a reading of the chain, and the record behind it is wrong for most squad agents. So `state`
 * is MINTED, and "on-chain" may be printed, ONLY when the recorded registry is the canonical IdentityRegistry AND the
 * engine's live ownership read found an owner for exactly this token. A MINTED record that is not confirmed comes back
 * as `state: 'NOT_CHECKED'` with `recorded: true` and the reason in `why`. UNVERIFIED and NOT_MINTED make no claim
 * about the chain and pass through. This page does not read the chain; it consumes the engine's read.
 */
export type MintVerdict = {
  state: MintState;
  /** The engine's word was MINTED but nothing confirmed it on chain. */
  recorded: boolean;
  why: string | null;
  registry: RegistryShown;
  onChain: OnChainShown | null;
  token: TokenIdShown;
};

export function mintVerdictOf(identity: unknown, onChainBody?: unknown): MintVerdict {
  const id = (identity && typeof identity === 'object' ? identity : {}) as Record<string, unknown>;
  const word = mintStateShown(id.registered_onchain);
  const token = tokenIdShown(id.token_id);
  if (word !== 'MINTED') {
    return { state: word, recorded: false, why: null, registry: identityRegistryShown(id.contract_address), onChain: null, token };
  }
  const tokenId = token.state === 'ID' ? token.id : null;
  // When the read is the passport's folded-in `onchain` object (repid-engine #1330), judge ITS registry —
  // the one the read was bound to — not the DB contract_address, which can be null for an agent the live
  // read confirmed. An older engine's second-call body falls through to the contract_address guard.
  const embedded = isEmbeddedOnChain(onChainBody);
  const registry = embedded ? identityRegistryShown((onChainBody as Record<string, unknown>).registry) : identityRegistryShown(id.contract_address);
  const onChain = onChainBody === undefined ? null : embedded ? onChainShownFromPassport(onChainBody) : onChainShown(onChainBody, tokenId);
  const problems: string[] = [];
  if (tokenId === null) problems.push(token.state === 'NOT_CHECKED' ? token.reason : 'the engine sent no token id');
  if (registry.state !== 'CANONICAL') problems.push(registry.reason);
  if (onChain === null) problems.push('no live ownerOf read was made');
  else if (onChain.check === 'REVERTED') problems.push('the registry says no token with that id exists');
  else if (onChain.check === 'NO_TOKEN') problems.push('the engine has no token id to read on chain');
  else if (onChain.check !== 'OWNER_FOUND') problems.push('the live ownerOf read did not confirm it');
  if (problems.length === 0) return { state: 'MINTED', recorded: false, why: null, registry, onChain, token };
  return { state: 'NOT_CHECKED', recorded: true, why: `the engine records a mint transaction, but ${problems.join('; ')}`, registry, onChain, token };
}

/**
 * The agent's two RepID fields, read from a passport body. THE SCORE AND THE ID ARE TWO DIFFERENT
 * THINGS: the score says how the agent has behaved; the ID says which agent it is. Neither proves
 * the other, so they are returned side by side and never folded into one value.
 */
export type TwoFields = {
  score: number | null;
  tier: string | null;
  /** MINTED only when verified on chain (see {@link mintVerdictOf}). */
  mint: MintState;
  token: TokenIdShown;
  /** The engine's word was MINTED but nothing confirmed it on chain: `mint` is then NOT_CHECKED and `why` says why. */
  recordedMint?: true;
  why?: string;
};

export function twoFieldsOf(passport: unknown, onChainBody?: unknown): TwoFields {
  const p = (passport && typeof passport === 'object' ? passport : {}) as Record<string, unknown>;
  const rep = (p.reputation && typeof p.reputation === 'object' ? p.reputation : {}) as Record<string, unknown>;
  const v = mintVerdictOf(p.identity_erc8004, onChainBody);
  return {
    score: typeof rep.repid_score === 'number' && Number.isFinite(rep.repid_score) ? rep.repid_score : null,
    tier: typeof rep.tier === 'string' ? rep.tier : null,
    mint: v.state,
    token: v.token,
    ...(v.recorded ? { recordedMint: true as const, why: v.why ?? '' } : {}),
  };
}
