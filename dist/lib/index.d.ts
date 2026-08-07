export * from './trustshell';
export { TrustShell as default } from './trustshell';
/**
 * Portable proof badge — render a {@link ProofPresentation} (from `presentProof`)
 * as a self-contained, embeddable SVG or Markdown snippet a reviewer can share and
 * re-verify. Green only when local verification returned true; never reveals the score.
 */
export { renderProofBadge, renderProofBadgeMarkdown, proofBadgeStatus, } from './badge';
export type { ProofBadgeState, ProofBadgeStatus, RenderBadgeOptions } from './badge';
/**
 * One-install story (Phase F): re-export the sound WASM proof verifier so a single
 * `npm install @hyperdag/trustshell` ships HAL filtering AND client-side ZKP RepID verification.
 * `@hyperdag/proof-verifier` is a direct dependency. Loaded via a variable specifier so the SDK
 * still type-checks/loads even if the optional native WASM build isn't present in a given env.
 *
 *   import { verify } from '@hyperdag/trustshell';
 *   const r = await verify(proofBytes, { agent_id, repid_score, threshold, tier });
 */
export declare function verify(proofBytes: string, statement: {
    agent_id: string;
    repid_score: number;
    threshold: number;
    tier: string;
}): Promise<{
    verified: boolean;
    error: string | null;
    verifier_version: string;
}>;
