/**
 * Delete one keyed row from the local sqlite file. No network.
 */
import { deleteKeyed, memoryDbPath } from '../memory/local-store';

export function redactKey(key: string, env: NodeJS.ProcessEnv = process.env): 'redacted' | 'NOT_CHECKED' {
  return deleteKeyed(memoryDbPath(env), key);
}
