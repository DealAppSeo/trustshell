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
import { type ClaimOptions, type ClaimResult } from '../lib/claim';
import { type ReleaseOutcome } from './quarantine';
/** Why a classify answer may not release a note, or null when it may. PURE. */
export declare function halReleaseBlock(claim: ClaimResult): string | null;
/**
 * Release a quarantined note by HAL. The public signature takes no transport and no endpoint: a
 * caller that could inject `fetch` could hand back any answer, so only `timeoutMs` passes through.
 */
export declare function releaseByHal(id: number, opts?: {
    timeoutMs?: number;
}, env?: NodeJS.ProcessEnv): Promise<ReleaseOutcome & {
    claim?: ClaimResult;
}>;
/**
 * INTERNAL, for tests only: the same release with an injectable transport. NOT exported from the SDK
 * (src/lib/index.ts), and the package's `exports` map does not expose this file.
 */
export declare function releaseByHalWith(id: number, opts?: ClaimOptions, env?: NodeJS.ProcessEnv): Promise<ReleaseOutcome & {
    claim?: ClaimResult;
}>;
