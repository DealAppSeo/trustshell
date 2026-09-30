/**
 * Write one local note. Kind is always note. No network.
 */
import { insertMemory, memoryDbPath, writeKeyed } from '../memory/local-store';

export function rememberNote(text: string, env: NodeJS.ProcessEnv = process.env): void {
  insertMemory(memoryDbPath(env), 'note', text);
}

/** Save one value under key in the same local file. No network. */
export function rememberKey(key: string, value: string, env: NodeJS.ProcessEnv = process.env): void {
  writeKeyed(memoryDbPath(env), key, value);
}
