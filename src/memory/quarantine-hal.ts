/**
 * quarantine-hal — release a quarantined note by the HAL classify path. THE ONLY NETWORK PATH in the
 * quarantine feature, kept in its own file so the local paths (remember, recall, list, explain, ground
 * release) never import network code.
 *
 * It sends the note, after the same secret / personal-data scrub `trustshell check "<sentence>"`
 * applies, to the backend's POST /api/v1/classify. It releases ONLY when all of these hold:
 *   - the endpoint is the DEFAULT one (DEFAULT_API_URL). An `apiUrl` or TRUSTSHELL_API_URL that points
 *     anywhere else can answer anything, so its `pass` releases nothing;
 *   - the label is `pass`, decided `by: 'votes'` — not by exact arithmetic, which reads no checker;
 *   - the answer names two different deciders, and both of their votes say TRUE, from two different
 *     model families. An endpoint that does not send the votes releases nothing;
 *   - the scrubber did not change the note (the label would be about other text).
 */
import { DEFAULT_API_URL, classifyClaim, resolveClassifyUrl, type ClaimOptions, type ClaimResult } from '../lib/claim';
import { markReleased, memoryDbPath, setQuarantineReason } from './local-store';
import { preflight, type ReleaseOutcome } from './quarantine';

/** Why a classify answer may not release a note, or null when it may. PURE. */
export function halReleaseBlock(claim: ClaimResult): string | null {
  if (claim.label !== 'pass') return `hal ${claim.label}${claim.reason ? `: ${claim.reason}` : ''}`;
  if (claim.by !== 'votes') return `hal not-checked: pass was decided by ${claim.by ?? 'an unnamed path'}, not by two checkers`;
  const deciders = claim.deciders ?? [];
  if (deciders.length !== 2 || deciders[0] === deciders[1]) return 'hal not-checked: the answer did not name two different deciders';
  const byVoter = new Map((claim.votes ?? []).map((v) => [v.voter, v]));
  const both = deciders.map((d) => byVoter.get(d));
  if (both.some((v) => v === undefined)) return "hal not-checked: the answer did not include both deciders' votes";
  if (both.some((v) => v!.verdict !== 'TRUE')) return 'hal not-checked: the two deciders did not both say TRUE';
  if (both[0]!.family === both[1]!.family) return 'hal not-checked: both deciders are the same model family';
  return null;
}

/**
 * Release a quarantined note by HAL. The public signature takes no transport and no endpoint: a
 * caller that could inject `fetch` could hand back any answer, so only `timeoutMs` passes through.
 */
export async function releaseByHal(
  id: number,
  opts: { timeoutMs?: number } = {},
  env: NodeJS.ProcessEnv = process.env,
): Promise<ReleaseOutcome & { claim?: ClaimResult }> {
  return releaseByHalWith(id, { timeoutMs: opts.timeoutMs }, env);
}

/**
 * INTERNAL, for tests only: the same release with an injectable transport. NOT exported from the SDK
 * (src/lib/index.ts), and the package's `exports` map does not expose this file.
 */
export async function releaseByHalWith(
  id: number,
  opts: ClaimOptions = {},
  env: NodeJS.ProcessEnv = process.env,
): Promise<ReleaseOutcome & { claim?: ClaimResult }> {
  const pre = preflight(id, env);
  if (!('row' in pre)) return pre;
  const claimEnv = opts.env ?? env;
  if (resolveClassifyUrl(opts.apiUrl, claimEnv) !== resolveClassifyUrl(DEFAULT_API_URL, {})) {
    const reason = 'hal not-checked: release needs the default endpoint; a custom apiUrl or TRUSTSHELL_API_URL cannot release a note';
    setQuarantineReason(memoryDbPath(env), id, reason);
    return { released: false, id, status: 'NOT_CHECKED', reason };
  }
  const claim = await classifyClaim(pre.row.body, { ...opts, env: claimEnv });
  if (claim.scrubbed) {
    const reason =
      'hal not-checked: the scrubber removed part of the note before sending, so the label is not about the stored text';
    setQuarantineReason(memoryDbPath(env), id, reason);
    return { released: false, id, status: 'NOT_CHECKED', reason, claim };
  }
  const block = halReleaseBlock(claim);
  if (block) {
    setQuarantineReason(memoryDbPath(env), id, block);
    return { released: false, id, status: claim.label === 'veto' ? 'HELD' : 'NOT_CHECKED', reason: block, claim };
  }
  const [a, b] = claim.deciders!.map((d) => claim.votes!.find((v) => v.voter === d)!);
  const releasedBy = `hal pass by votes: ${a!.voter} (${a!.family}) and ${b!.voter} (${b!.family}) both said TRUE`;
  markReleased(memoryDbPath(env), id, releasedBy);
  return { released: true, id, check: 'hal', released_by: releasedBy, claim };
}
