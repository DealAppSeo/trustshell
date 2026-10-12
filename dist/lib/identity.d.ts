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
export declare function notCheckedIdentity(reason: string): AgentIdentity;
/** Read the identity out of a passport body. PURE. Anything unclear is NOT_CHECKED, not NOT_MINTED. */
export declare function identityFromPassport(body: unknown): AgentIdentity;
/** One line for a terminal: the ID as its own field, with its state. */
export declare function formatIdentity(identity: AgentIdentity | undefined): string;
