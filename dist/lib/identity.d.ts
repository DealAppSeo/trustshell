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
 *   1. the registry the ownership read was bound to is the canonical IdentityRegistry (not a placeholder,
 *      not a transaction hash, not another address, not a near-miss), and
 *   2. the engine's LIVE ownership read (ownerOf on that registry) found an owner for this token id.
 * Anything else the engine called MINTED is `NOT_CHECKED` here, with `recordedState: 'MINTED'` so
 * nothing the engine said is lost, and the reason it could not be confirmed. This client does not
 * read the chain itself; it consumes the engine's read.
 *
 * WHERE THE READ COMES FROM. repid-engine #1330 folds that ownership read into the passport as an
 * additive `onchain` object, so the ONE `GET /api/v1/passport/:id` already carries it — no second call.
 * An older engine that does not fold it in is read with a second `GET /api/v1/agents/:id/onchain`, whose
 * body is passed here as `onChainBody`. The passport's object is preferred when present; its `registry`
 * is the registry the read was bound to, which is what the guard judges (the DB `contract_address` can be
 * null for an agent the live read confirmed).
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
export declare const IDENTITY_REGISTRY_BASE_SEPOLIA = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
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
export type RegistryReading = {
    status: 'CANONICAL';
    address: string;
} | {
    status: 'NOT_CHECKED';
    reason: string;
};
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
export declare function notCheckedIdentity(reason: string): AgentIdentity;
/**
 * The registry the engine RECORDED, judged against the canonical IdentityRegistry. PURE. The result is
 * the canonical constant or NOT_CHECKED with a reason: never the engine's own string, which for most
 * squad agents is a placeholder, a transaction hash, another address or a near-miss.
 */
export declare function registryReading(raw: unknown, engineReason?: unknown): RegistryReading;
/**
 * The engine's live ownerOf cross-check (`GET /api/v1/agents/:id/onchain`), reduced to what a surface may
 * rely on. PURE. OWNER_FOUND counts only when the owner is a real, non-zero address AND the read was about
 * exactly the token id the passport named. A body with no `check` (an older engine), a `check` this client
 * does not know, or anything malformed is NOT_CHECKED: it is not a confirmation and it is not a denial.
 */
export declare function onChainReadFrom(body: unknown, tokenId: string | null): OnChainRead;
/**
 * The same ownerOf cross-check, read from the ADDITIVE `onchain` object the passport now folds in
 * (repid-engine #1330, `PassportOnchain`), so the ONE `GET /passport/:id` call carries the read and the
 * second `GET /agents/:id/onchain` is not made. PURE. Same rule as {@link onChainReadFrom}: OWNER_FOUND
 * counts only with a real, non-zero owner. The embedded read is computed by the engine FOR THIS PASSPORT'S
 * AGENT, so there is no separate token id to cross-check (the field carries none). A missing, unknown or
 * malformed `check` is NOT_CHECKED — not a confirmation and not a denial. `ownerMatchesRecord` is null here:
 * the embedded object carries no conservator to compare against.
 */
export declare function onChainReadFromPassport(onchain: unknown): OnChainRead;
/**
 * Does this passport already carry the live ownership read (repid-engine #1330)? When true, the ONE
 * `/passport/:id` call is enough and no second `/agents/:id/onchain` GET is made. When false (an older or
 * not-yet-redeployed engine) a recorded MINTED still needs that second call to be confirmed.
 */
export declare function passportCarriesOnChainRead(body: unknown): boolean;
/**
 * Is this identity ENTITLED to be called on-chain? True only for MINTED with the evidence that backs it: the
 * canonical registry recorded AND a live ownership read that found an owner. A hand-built or older object that
 * says MINTED with neither is not verified, whoever produced it. Every surface asks this, not the status word.
 */
export declare function isVerifiedOnChain(identity: AgentIdentity | undefined): boolean;
/**
 * Read the identity out of a passport body, and, for a MINTED record, out of the engine's live ownership read.
 * PURE. Anything unclear is NOT_CHECKED, not NOT_MINTED. The engine's `MINTED` is a record of a mint
 * transaction, not a reading of the chain: without `onChainBody` confirming it, the result is NOT_CHECKED with
 * `recordedState: 'MINTED'` (see the header comment). UNVERIFIED and NOT_MINTED make no claim about the chain
 * and are passed through as the engine said them.
 */
export declare function identityFromPassport(body: unknown, onChainBody?: unknown): AgentIdentity;
/** One line for a terminal: the ID as its own field, with its state. */
export declare function formatIdentity(identity: AgentIdentity | undefined): string;
