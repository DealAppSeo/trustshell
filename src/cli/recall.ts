/**
 * List saved notes from the local sqlite file, oldest first.
 * do_not_send rows stay a count. Quarantined notes are left out (and counted) unless
 * `includeQuarantined` is set, and then each is marked [QUARANTINED: reason]. No network.
 */
import { formatRecall, memoryDbPath, readKeyed } from '../memory/local-store';

export function recallNotes(
  env: NodeJS.ProcessEnv = process.env,
  opts: { includeQuarantined?: boolean } = {},
): string {
  return formatRecall(memoryDbPath(env), env, opts);
}

/** The value for key, or NOT_CHECKED. Never an empty string. No network. */
export function recallKey(key: string, env: NodeJS.ProcessEnv = process.env): string {
  return readKeyed(memoryDbPath(env), key, env);
}
