/**
 * quarantine-hal — release a quarantined note by the HAL classify path. THE ONLY NETWORK PATH in the
 * quarantine feature, kept in its own file so the local paths (remember, recall, list, explain, ground
 * release) never import network code.
 *
 * It sends the note, after the same secret / personal-data scrub `trustshell check "<sentence>"`
 * applies, to the backend's POST /api/v1/classify. Only the label `pass` releases. A note the
 * scrubber changed is NOT released: the label would be about other text than the stored note.
 */
import { type ClaimOptions, type ClaimResult } from '../lib/claim';
import { type ReleaseOutcome } from './quarantine';
export declare function releaseByHal(id: number, opts?: ClaimOptions, env?: NodeJS.ProcessEnv): Promise<ReleaseOutcome & {
    claim?: ClaimResult;
}>;
