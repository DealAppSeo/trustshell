/**
 * What a RepID proof actually shows, said once, so the CLI, `--json`, the MCP tool and the badge cannot
 * drift apart. A reader sees `verified ✓` and assumes the strongest meaning; this field is the correction.
 *
 * Today's live proofs (`plonky3_range_check`, the postcard) are VALIDITY proofs. They show that the numbers
 * in the statement satisfy `threshold < repid_score`. They hide nothing. MEASURED 2026-11-17 with
 * @hyperdag/proof-verifier 0.2.0 against one live proof, on Sean's Windows laptop:
 *   - 7 of 2048 random agent ids verified (about 1 in 293). The verifier rejects a foreign id only by an
 *     8-bit proof-of-work check (`InvalidPowWitness`), which predicts 1 in 256.
 *   - exactly one score in 0..10000 verified, so the score is bound. Stripping it from the statement (the
 *     envelope tier) does not hide it: trying every score took 37 s.
 *   - setting the statement's `tier` to another value still verified, and the statement carries no time.
 * `tests/proof-class.test.ts` re-measures, with the real verifier on fixtures/proof-agent.json: the foreign-id
 * rate (1024 deterministic ids), that only the true score verifies within 50 of it, and that a changed tier
 * and an added time key still verify. So this text goes red when the verifier changes. The 2048 random ids and
 * the full 0..10000 score search above are NOT repeated there (too slow for every run).
 *
 * SEAM for the private eligibility proof (Lane Z). When that scheme ships, it gets its own entry in
 * `CLASSES`, carrying only what its own measurements support. A scheme this file does not know is
 * reported as `unknown` and is never given a stronger class.
 */
import type { ProofPresentation } from './trustshell';
export interface ProofClass {
    /** `validity`: the public numbers satisfy the statement, nothing hidden. `none`: no proof bytes. */
    kind: 'validity' | 'none' | 'unknown';
    /** Whether a holder of the proof can learn the score. False for every scheme today. */
    scoreHidden: boolean;
    /** `weak`: about 1 in 256 foreign agent ids verify. */
    agentBinding: 'weak' | 'none' | 'unknown';
    /** Statement fields and facts the proof does not cover, even when it verifies. */
    notProven: string[];
    /** One plain sentence, printed by `trustshell proof` and the badge. */
    summary: string;
}
export declare function proofClassOf(p: Pick<ProofPresentation, 'scheme' | 'proofBytes' | 'statement'>): ProofClass;
