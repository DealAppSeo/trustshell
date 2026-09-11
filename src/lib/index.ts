export * from './trustshell';
export { TrustShell as default } from './trustshell';

/**
 * Fail-closed turn origins. `Unknown` (or an unstamped turn) may never pay — the same
 * missing-config-refuses posture as the payment cap. Stamp origin at the trust boundary.
 */
export { canPay, assertOriginCanPay, PAY_CAPABLE_ORIGINS } from './origin';
export type { AgentTurnOrigin, PayCapableOrigin } from './origin';

/**
 * Audit before act: record the spend intent, require a policy, then run the act. A missing policy
 * refuses — a spend with no policy behind it never runs. Reuses the `.trustshell/value-events.jsonl`
 * on-device log. Wrap `buildX402Payment` / `executeA2A` with `auditThenAct` at the spend boundary.
 */
export { auditThenAct } from './audit';
export type { SpendIntent, SpendPolicy, AuditOpts } from './audit';

/**
 * Portable proof badge — render a {@link ProofPresentation} (from `presentProof`)
 * as a self-contained, embeddable SVG or Markdown snippet a reviewer can share and
 * re-verify. Green only when local verification returned true. The BADGE never prints the
 * score; the proof's statement still carries it as a bound public input.
 */
export {
  renderProofBadge,
  renderProofBadgeMarkdown,
  proofBadgeStatus,
} from './badge';
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
export async function verify(
  proofBytes: string,
  statement: { agent_id: string; repid_score: number; threshold: number; tier: string },
): Promise<{ verified: boolean; error: string | null; verifier_version: string }> {
  const verifierPkg = '@hyperdag/proof-verifier';
  const mod: any = await import(/* @vite-ignore */ verifierPkg);
  return mod.verify(proofBytes, statement);
}

/**
 * wrapExecute — run an agent's work, score the output with HAL, return both.
 *
 * Records by default and withholds nothing; blocking is opt-in per call via
 * `blockAtOrAbove`. See wrap-execute.ts for why that default is a measurement, not
 * caution, and for what the wrapper structurally cannot do (it scores output that has
 * already been produced, so it withholds results, not side effects).
 */
export { wrapExecute, meetsThreshold, HAL_VERDICT_ORDER } from './wrap-execute';
export type {
  HalVerdict,
  HalScorer,
  WrapDisposition,
  WrapExecuteOptions,
  WrapExecuteRecord,
  WrapExecuteResult,
} from './wrap-execute';
