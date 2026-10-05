/**
 * Local memory tools. They write and list sqlite notes.
 * They do not call an LLM or any network helper.
 */
import { refusedValue } from '../cli/remember';
import { formatRecall, insertMemory, memoryDbPath } from '../memory/local-store';

export function rememberLocal(
  text: string,
  env: NodeJS.ProcessEnv = process.env,
): { kind: 'note'; remembered: true } {
  if (refusedValue(text)) throw new Error('remember refused');
  insertMemory(memoryDbPath(env), 'note', text, undefined, env);
  return { kind: 'note', remembered: true };
}

export function recallLocal(env: NodeJS.ProcessEnv = process.env): { notes: string } {
  return { notes: formatRecall(memoryDbPath(env), env) };
}
