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
import { cleanCodePoints } from './action-evidence';

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

const WEAK_BINDING = 'agent binding is weak (about 1 in 256 foreign agent ids verify)';
const NOT_PROVEN = 'the tier label and the time are not proven';

/** Keyed by `scheme`. Add an entry only with the measurement behind it. */
// The wording follows the statement in hand, not the tier name: only the envelope tier strips the score.
const CLASSES: Record<string, (statement: ProofPresentation['statement']) => ProofClass> = {
  plonky3_range_check: (statement) => ({
    kind: 'validity',
    scoreHidden: false,
    agentBinding: 'weak',
    notProven: ['tier', 'time'],
    summary: [
      'validity proof',
      statement?.repid_score !== undefined
        ? 'the score is public'
        : 'the score is left out of the statement but is not hidden (trying each score against the verifier finds it)',
      WEAK_BINDING,
      NOT_PROVEN,
    ].join('; '),
  }),
};

export function proofClassOf(p: Pick<ProofPresentation, 'scheme' | 'proofBytes' | 'statement'>): ProofClass {
  if (!p.proofBytes) {
    return { kind: 'none', scoreHidden: false, agentBinding: 'none', notProven: [], summary: 'no proof: the response carried no proof bytes' };
  }
  // `scheme` comes from the server: own keys only, so "constructor" cannot reach Object's prototype.
  const known = p.scheme && Object.prototype.hasOwnProperty.call(CLASSES, p.scheme) ? CLASSES[p.scheme] : undefined;
  if (known) return known(p.statement);
  return {
    kind: 'unknown',
    scoreHidden: false,
    agentBinding: 'unknown',
    notProven: [],
    // The scheme is engine text and this summary is printed to terminals: control code points stripped (Strix, #728).
    summary: `unknown proof scheme ${cleanCodePoints(p.scheme ?? '(none)')}: TrustShell makes no claim about what it shows`,
  };
}
