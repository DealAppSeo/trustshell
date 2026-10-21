/**
 * This install's Ed25519 key: `<TRUSTSHELL_HOME or ~/.trustshell>/bundle-signing-key.pem`, created 0600 on
 * first use, never written into anything it signs. It signs bundles (authorship) and, when the owner asks,
 * the local policy (`trustshell guard sign`). A signature proves integrity only as far as the key is
 * trusted; it encrypts nothing. Every check recomputes the fingerprint from the key, never reads it off a file.
 */
import { type KeyObject } from 'node:crypto';
export declare const SIGNING_KEY_FILE = "bundle-signing-key.pem";
export interface Signer {
    alg: 'ed25519';
    /** The raw 32-byte public key, base64url (the JWK `x`). */
    public_key: string;
    /** sha256 hex of the raw public key. */
    fingerprint: string;
}
export declare function fingerprintOf(publicKeyB64url: string): string;
export declare function signerOf(key: KeyObject): Signer;
/** The filesystem calls the key needs. Injectable for tests. */
export interface KeyFs {
    exists(p: string): boolean;
    read(p: string): string;
    /** Create the file 0600 and fail if it already exists. */
    writeNew(p: string, data: string): void;
    mkdirp(p: string): void;
}
export declare const nodeKeyFs: () => KeyFs;
/** This install's key, created on first use. */
export declare function signingKey(dir: string, fs?: KeyFs): {
    key: KeyObject;
    signer: Signer;
    created: boolean;
    path: string;
};
/** The fingerprint of this install's key, or null when it has none yet (nothing is created). */
export declare function ownFingerprint(dir: string, fs?: KeyFs): string | null;
/** Ed25519 over the RFC 8785 form of `value`, base64. */
export declare function signValue(value: unknown, key: KeyObject): string;
/** True only when `signer` is well formed, its fingerprint is its key's, and `signature` verifies over `value`. */
export declare function verifyValue(value: unknown, signer: Signer, signature: string): boolean;
