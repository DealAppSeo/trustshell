/**
 * List saved notes from the local sqlite file, oldest first.
 * do_not_send rows stay a count. No network.
 */
import { formatRecall, memoryDbPath } from '../memory/local-store';

export function recallNotes(env: NodeJS.ProcessEnv = process.env): string {
  return formatRecall(memoryDbPath(env));
}
