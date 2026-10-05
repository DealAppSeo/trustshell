/**
 * Write one local note, or one value under a key. No network.
 */
import { insertMemory, memoryDbPath, writeKeyed } from '../memory/local-store';
import { PREFIXED_TOKEN, containsSecret } from '../memory/redact';

/** Authorization header tokens, including `Bearer <jwt>`. Tokens are assumed to be at least 8 characters. */
const BEARER = /\bBearer\s+[A-Za-z0-9_\-./]{8,}/;

/**
 * True when a value carries a secret shape and must not be stored. Uses the same detector as the
 * outbound scrubber (containsSecret), so a key the checkers would never see is not written to
 * disk either: until 2026-10-05 this list was narrower and stored `sk-…` and `AKIA…` keys.
 * Personal data such as an email is NOT refused: local memory is the place for it.
 */
export function refusedValue(value: string): boolean {
  return containsSecret(value) || /sb_secret_/.test(value) || /postgresql:\/\//i.test(value) || value.includes('eyJ') || BEARER.test(value) || PREFIXED_TOKEN.test(value);
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
