/**
 * List saved notes from the local sqlite file, oldest first.
 * do_not_send rows stay a count. No network.
 */
import { formatRecall, memoryDbPath, readKeyed } from '../memory/local-store';

export function recallNotes(env: NodeJS.ProcessEnv = process.env): string {
  return formatRecall(memoryDbPath(env), env);
}

/** The value for key, or NOT_CHECKED. Never an empty string. No network. */
export function recallKey(key: string, env: NodeJS.ProcessEnv = process.env): string {
  return readKeyed(memoryDbPath(env), key, env);
}
