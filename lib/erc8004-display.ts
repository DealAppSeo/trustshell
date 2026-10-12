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

/** The engine's three states, plus NOT_CHECKED for anything it did not say clearly. */
export type MintState = 'MINTED' | 'UNVERIFIED' | 'NOT_MINTED' | 'NOT_CHECKED';

export function mintStateShown(raw: unknown): MintState {
  return raw === 'MINTED' || raw === 'UNVERIFIED' || raw === 'NOT_MINTED' ? raw : 'NOT_CHECKED';
}

/**
 * The agent's two RepID fields, read from a passport body. THE SCORE AND THE ID ARE TWO DIFFERENT
 * THINGS: the score says how the agent has behaved; the ID says which agent it is. Neither proves
 * the other, so they are returned side by side and never folded into one value.
 */
export type TwoFields = {
  score: number | null;
  tier: string | null;
  mint: MintState;
  token: TokenIdShown;
};

export function twoFieldsOf(passport: unknown): TwoFields {
  const p = (passport && typeof passport === 'object' ? passport : {}) as Record<string, unknown>;
  const rep = (p.reputation && typeof p.reputation === 'object' ? p.reputation : {}) as Record<string, unknown>;
  const id = (p.identity_erc8004 && typeof p.identity_erc8004 === 'object' ? p.identity_erc8004 : {}) as Record<string, unknown>;
  return {
    score: typeof rep.repid_score === 'number' && Number.isFinite(rep.repid_score) ? rep.repid_score : null,
    tier: typeof rep.tier === 'string' ? rep.tier : null,
    mint: mintStateShown(id.registered_onchain),
    token: tokenIdShown(id.token_id),
  };
}
