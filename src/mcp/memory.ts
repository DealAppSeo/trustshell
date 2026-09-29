/**
 * Local memory tools. They write and list sqlite notes.
 * They do not call an LLM or any network helper.
 */
import { formatRecall, insertMemory, memoryDbPath } from '../memory/local-store';

export function rememberLocal(
  text: string,
  env: NodeJS.ProcessEnv = process.env,
): { kind: 'note'; remembered: true } {
  insertMemory(memoryDbPath(env), 'note', text);
  return { kind: 'note', remembered: true };
}

export function recallLocal(env: NodeJS.ProcessEnv = process.env): { notes: string } {
  return { notes: formatRecall(memoryDbPath(env)) };
}
