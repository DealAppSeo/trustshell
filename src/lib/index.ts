export * from './trustshell';
export { TrustShell as default } from './trustshell';

/**
 * One-install story (Phase F): re-export the sound WASM proof verifier so a single
 * `npm install @hyperdag/trustshell` ships HAL filtering AND client-side ZKP RepID verification.
 * `@hyperdag/proof-verifier` is a direct dependency. Loaded via a variable specifier so the SDK
 * still type-checks/loads even if the optional native WASM build isn't present in a given env.
 *
 *   import { verify } from '@hyperdag/trustshell';
 *   const r = await verify(proofBytes, { agent_id, repid_score, threshold, tier });
 */
export async function verify(
  proofBytes: string,
  statement: { agent_id: string; repid_score: number; threshold: number; tier: string },
): Promise<{ verified: boolean; error: string | null; verifier_version: string }> {
  const verifierPkg = '@hyperdag/proof-verifier';
  const mod: any = await import(/* @vite-ignore */ verifierPkg);
  return mod.verify(proofBytes, statement);
}

// ─── ERC-8004 on-chain reputation reads (Task 3) ────────────────────────────
//
// Re-exported from `dist/reputation` so callers can use the first-class import:
//   import { getRepID, getReputationHistory, getAttestation } from '@hyperdag/trustshell';
//
// These functions read directly from the ERC-8004 IdentityRegistry / ReputationRegistry on-chain
// (Base Sepolia: 0x8004A818…, 0x8004B663…). They require `ethers` at runtime.
//
// `ethers` is declared as an optional peer dependency — it is NOT bundled. If ethers is not
// installed in the consumer's project, these functions throw a clear TrustShellError(424).
// For ethers-free environments, use client.getRepID(agentId) (backend API read via HTTP).
//
// Peer install: npm install ethers@^6
export { getRepID, getReputationHistory, getAttestation } from './reputation';
