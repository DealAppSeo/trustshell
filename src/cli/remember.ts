/**
 * Write one local note. Kind is always note. No network.
 */
import { insertMemory, memoryDbPath } from '../memory/local-store';

export function rememberNote(text: string, env: NodeJS.ProcessEnv = process.env): void {
  insertMemory(memoryDbPath(env), 'note', text);
}
