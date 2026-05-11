import type { ProofResult } from './types';

// Lazy-load the WASM verifier so users who never call verify()
// pay no startup cost.
let verifierModulePromise: Promise<any> | null = null;

async function loadVerifier() {
  if (!verifierModulePromise) {
    // We use dynamic import for lazy loading
    // @ts-ignore
    verifierModulePromise = import('@hyperdag/proof-verifier');
  }
  return verifierModulePromise;
}

export interface LocalVerifyResult {
  verified: boolean;
  error: string | null;
  proof_size_bytes: number;
  verifier_version: string;
  /** Total elapsed time in ms (fetch + WASM verify) */
  elapsed_ms: number;
}

/**
 * Verify a HyperDAG STARK proof locally on this machine.
 * Does NOT call the HyperDAG server — pure cryptographic math.
 *
 * @param proof ProofResult from TrustShell.getProof()
 * @returns LocalVerifyResult with verified=true|false
 */
export async function verifyProofLocal(proof: ProofResult): Promise<LocalVerifyResult> {
  const t0 = Date.now();
  try {
    const verifier = await loadVerifier();
    const result = await verifier.verify(proof.proof_bytes, proof.statement as any);
    return {
      verified: result.verified,
      error: (result as any).error ?? null,
      proof_size_bytes: result.proof_size_bytes ?? 0,
      verifier_version: (result as any).verifier_version ?? '0.1.0',
      elapsed_ms: Date.now() - t0,
    };
  } catch (e: any) {
    return {
      verified: false,
      error: e?.message ?? 'Unknown verification error',
      proof_size_bytes: 0,
      verifier_version: '0.1.0',
      elapsed_ms: Date.now() - t0,
    };
  }
}
