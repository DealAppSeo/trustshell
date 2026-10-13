/**
 * six-claims.ts — the shape of a trust receipt's six-claim envelope, for rendering.
 *
 * A trust receipt must NEVER collapse to one green "VERIFIED" badge. It makes SIX claims, each
 * stated separately, each with its own status and its own gaps, plus a top-level
 * "what this does not establish" line. There is deliberately NO top-level boolean: a reader must
 * read the six statuses, not a rollup.
 *
 * SOURCE OF TRUTH. The canonical envelope is produced server-side by repid-engine
 * (`src/kernel/six-claims.ts::toSixClaimStatement`) as an in-toto Statement with a HyperDAG
 * predicate — an open, Sigstore/in-toto-compatible shape a stranger can verify with standard
 * tooling. This module mirrors that shape so TrustShell can RENDER it; it does not recompute it.
 * The two must agree, which is why the field names here match the engine's exactly.
 *
 * FAIL CLOSED: a claim with insufficient evidence is NOT_CHECKED — it NEVER renders as a pass.
 * NOT_APPLICABLE is not a pass either; it means the claim does not apply to this call.
 */

export type ClaimStatus = 'VERIFIED' | 'NOT_CHECKED' | 'FAILED' | 'NOT_APPLICABLE';

export interface Claim {
  status: ClaimStatus;
  /** One plain sentence a stranger reads. */
  statement: string;
  /** Receipt facts that support the status. */
  supports: string[];
  /** What this claim does NOT establish, stated rather than implied. */
  gaps: string[];
}

export interface SixClaims {
  integrity: Claim;
  authenticity: Claim;
  observation: Claim;
  correctness: Claim;
  authorization: Claim;
  containment: Claim;
}

export const SIX_CLAIM_KEYS: ReadonlyArray<keyof SixClaims> = [
  'integrity',
  'authenticity',
  'observation',
  'correctness',
  'authorization',
  'containment',
];

export const SIX_CLAIMS_PREDICATE_TYPE =
  'https://hyperdag.dev/predicates/trust-receipt-six-claims/v1';

export interface InTotoStatement {
  _type: 'https://in-toto.io/Statement/v1';
  subject: Array<{ name: string; digest: Record<string, string> }>;
  predicateType: typeof SIX_CLAIMS_PREDICATE_TYPE;
  predicate: {
    claims: SixClaims;
    /** The union of each claim's gaps and the decision's own does_not_attest. */
    what_this_does_not_establish: string[];
  };
}

/** Human title for each claim. */
export const CLAIM_TITLE: Record<keyof SixClaims, string> = {
  integrity: 'Integrity',
  authenticity: 'Authenticity',
  observation: 'Observation',
  correctness: 'Correctness',
  authorization: 'Authorization',
  containment: 'Containment',
};

/** One line naming the question each claim answers — so the six are not read as interchangeable. */
export const CLAIM_QUESTION: Record<keyof SixClaims, string> = {
  integrity: 'Is the record whole and chained?',
  authenticity: 'Who authorized it, and does the policy signature hold?',
  observation: 'What was actually seen — was it read back, or only authorized?',
  correctness: 'Was the content independently settled, or only voted on?',
  authorization: 'Did the kernel permit the action, refuse it, or fail to check?',
  containment: 'Did the execution boundary hold?',
};

/**
 * A worked EXAMPLE envelope with a deliberate MIX of all four statuses, for the renderer and its
 * test. It is clearly an example — not a live receipt — and exists so the render exercises every
 * status, including a FAILED and a NOT_APPLICABLE claim, rather than an all-green happy path.
 */
export const EXAMPLE_SIX_CLAIM_STATEMENT: InTotoStatement = {
  _type: 'https://in-toto.io/Statement/v1',
  subject: [
    {
      name: 'kernel-receipt',
      digest: { keccak256: '0x0000000000000000000000000000000000000000000000000000000000000000' },
    },
  ],
  predicateType: SIX_CLAIMS_PREDICATE_TYPE,
  predicate: {
    claims: {
      integrity: {
        status: 'VERIFIED',
        statement: 'The record is whole and chained.',
        supports: ['receipt_hash is a keccak256 over the canonical receipt', 'chained to a prior receipt'],
        gaps: ['unsigned — integrity rests on the hash and the ledger chain, not a signature'],
      },
      authenticity: {
        status: 'NOT_CHECKED',
        statement: 'The action was authorized by the agent’s accountable owner.',
        supports: ['owner status unknown', 'policy signature NOT_CHECKED'],
        gaps: ['the accountable owner was not positively resolved', 'policy signature NOT_CHECKED'],
      },
      observation: {
        status: 'NOT_APPLICABLE',
        statement: 'No payment was part of this call.',
        supports: ['payment NOT_APPLICABLE'],
        gaps: [],
      },
      correctness: {
        status: 'FAILED',
        statement: 'The content was independently settled as correct.',
        supports: ['settled by holdout', 'holdout returned a mismatch'],
        gaps: ['the claimed answer did not match the held-out answer'],
      },
      authorization: {
        status: 'VERIFIED',
        statement: 'The kernel permitted the action.',
        supports: ['verdict ALLOW', 'every required check passed'],
        gaps: [],
      },
      containment: {
        status: 'NOT_CHECKED',
        statement: 'The execution boundary held.',
        supports: ['no hard-prohibited capability was requested'],
        gaps: ['the tool run itself was not observed from inside the boundary'],
      },
    },
    what_this_does_not_establish: [
      'This is an example envelope, not a live receipt.',
      'A valid record is not a correct one: the content FAILED its holdout check.',
      'No owner was resolved, so who stands behind this action is not established.',
    ],
  },
};
