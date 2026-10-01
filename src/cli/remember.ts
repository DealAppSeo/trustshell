/**
 * Write one local note, or one value under a key. No network.
 */
import { insertMemory, memoryDbPath, writeKeyed } from '../memory/local-store';

/** Authorization header tokens, including `Bearer <jwt>`. Tokens are assumed to be at least 8 characters. */
const BEARER = /\bBearer\s+[A-Za-z0-9_\-./]{8,}/;

/** Slack enterprise tokens (Enterprise Grid / org-level workflows). */
const XOXE = /\bxoxe-/i;

/** True when a value carries a secret shape and must not be stored. */
export function refusedValue(value: string): boolean {
  return /sb_secret_/.test(value) || /postgresql:\/\//i.test(value) || value.includes('eyJ') || BEARER.test(value) || XOXE.test(value);
}

export function rememberNote(text: string, env: NodeJS.ProcessEnv = process.env): void {
  insertMemory(memoryDbPath(env), 'note', text);
}

/**
 * Save one value under key in the same local file.
 * A secret-shaped value is refused and nothing is written. No network.
 */
export function rememberKey(key: string, value: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (refusedValue(value)) return false;
  writeKeyed(memoryDbPath(env), key, value);
  return true;
}
