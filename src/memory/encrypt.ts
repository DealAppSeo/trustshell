/**
 * Optional encryption for local memory blobs.
 *
 * When TRUSTSHELL_MEMORY_ENCRYPT is unset, empty, or 'off', remember/recall
 * pass bodies through unchanged. When 'on', AES-256-GCM is used with a key
 * derived from TRUSTSHELL_MEMORY_KEY. No network.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const FLAG = 'TRUSTSHELL_MEMORY_ENCRYPT';
const KEY = 'TRUSTSHELL_MEMORY_KEY';

function encryptionEnabled(env: NodeJS.ProcessEnv): boolean {
  const raw = env[FLAG];
  if (raw === undefined) return false;
  const trimmed = raw.trim();
  return trimmed.length > 0 && trimmed.toLowerCase() !== 'off';
}

function deriveKey(password: string): Buffer {
  return scryptSync(password, 'trustshell-memory-salt', 32);
}

/** Encrypt a memory blob, or return it unchanged when encryption is off/unset. */
export function encryptMemory(body: string, env: NodeJS.ProcessEnv = process.env): string {
  if (!encryptionEnabled(env)) return body;
  const password = env[KEY];
  if (typeof password !== 'string' || password.trim().length === 0) {
    throw new Error(`NOT_CHECKED ${KEY} missing`);
  }
  const key = deriveKey(password);
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(body, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

/** Decrypt a memory blob, or return it unchanged when encryption is off/unset. */
export function decryptMemory(body: string, env: NodeJS.ProcessEnv = process.env): string {
  if (!encryptionEnabled(env)) return body;
  const password = env[KEY];
  if (typeof password !== 'string' || password.trim().length === 0) {
    throw new Error(`NOT_CHECKED ${KEY} missing`);
  }
  const parts = body.split(':');
  if (parts.length !== 3) {
    throw new Error('NOT_CHECKED malformed encrypted memory');
  }
  const [ivB64, tagB64, encryptedB64] = parts;
  try {
    const key = deriveKey(password);
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedB64, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    throw new Error('NOT_CHECKED decrypt failed');
  }
}
