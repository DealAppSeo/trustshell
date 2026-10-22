/**
 * This install's Ed25519 key: `<TRUSTSHELL_HOME or ~/.trustshell>/bundle-signing-key.pem`, created 0600 on
 * first use, never written into anything it signs. It signs bundles (authorship) and, when the owner asks,
 * the local policy (`trustshell guard sign`). A signature proves integrity only as far as the key is
 * trusted; it encrypts nothing. Every check recomputes the fingerprint from the key, never reads it off a file.
 */
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from 'node:crypto';
import { join } from 'node:path';
import { canonicalize } from './jcs';

export const SIGNING_KEY_FILE = 'bundle-signing-key.pem';

export interface Signer {
  alg: 'ed25519';
  /** The raw 32-byte public key, base64url (the JWK `x`). */
  public_key: string;
  /** sha256 hex of the raw public key. */
  fingerprint: string;
}

export function fingerprintOf(publicKeyB64url: string): string {
  return createHash('sha256').update(Buffer.from(publicKeyB64url, 'base64url')).digest('hex');
}

export function signerOf(key: KeyObject): Signer {
  const x = String((createPublicKey(key).export({ format: 'jwk' }) as { x?: string }).x);
  return { alg: 'ed25519', public_key: x, fingerprint: fingerprintOf(x) };
}

/** The filesystem calls the key needs. Injectable for tests. */
export interface KeyFs {
  exists(p: string): boolean;
  read(p: string): string;
  /** Create the file 0600 and fail if it already exists. */
  writeNew(p: string, data: string): void;
  mkdirp(p: string): void;
}

export const nodeKeyFs = (): KeyFs => {
  const fs = require('node:fs') as typeof import('node:fs');
  return {
    exists: (p) => fs.existsSync(p),
    read: (p) => fs.readFileSync(p, 'utf8'),
    writeNew: (p, d) => fs.writeFileSync(p, d, { mode: 0o600, flag: 'wx' }),
    mkdirp: (p) => {
      fs.mkdirSync(p, { recursive: true, mode: 0o700 });
    },
  };
};

/** This install's key, created on first use. */
export function signingKey(dir: string, fs: KeyFs = nodeKeyFs()): { key: KeyObject; signer: Signer; created: boolean; path: string } {
  const path = join(dir, SIGNING_KEY_FILE);
  let created = false;
  if (!fs.exists(path)) {
    const { privateKey } = generateKeyPairSync('ed25519');
    fs.mkdirp(dir);
    fs.writeNew(path, String(privateKey.export({ format: 'pem', type: 'pkcs8' })));
    created = true;
  }
  const key = createPrivateKey(fs.read(path));
  if (key.asymmetricKeyType !== 'ed25519') throw new Error(`${path} is not an Ed25519 key`);
  return { key, signer: signerOf(key), created, path };
}

/** The fingerprint of this install's key, or null when it has none yet (nothing is created). */
export function ownFingerprint(dir: string, fs: KeyFs = nodeKeyFs()): string | null {
  const path = join(dir, SIGNING_KEY_FILE);
  return fs.exists(path) ? signerOf(createPrivateKey(fs.read(path))).fingerprint : null;
}

/** Ed25519 over the RFC 8785 form of `value`, base64. */
export function signValue(value: unknown, key: KeyObject): string {
  return sign(null, Buffer.from(canonicalize(value), 'utf8'), key).toString('base64');
}

/** True only when `signer` is well formed, its fingerprint is its key's, and `signature` verifies over `value`. */
export function verifyValue(value: unknown, signer: Signer, signature: string): boolean {
  try {
    if (signer.alg !== 'ed25519' || fingerprintOf(signer.public_key) !== signer.fingerprint) return false;
    const pub = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: signer.public_key }, format: 'jwk' });
    return verify(null, Buffer.from(canonicalize(value), 'utf8'), pub, Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
}
