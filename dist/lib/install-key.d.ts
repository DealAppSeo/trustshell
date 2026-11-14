/**
 * This install's Ed25519 key: `<TRUSTSHELL_HOME or ~/.trustshell>/bundle-signing-key.pem`, created on first
 * use and limited to this user with its folder (0600/0700 on POSIX, an owner/SYSTEM/Administrators ACL on
 * Windows; see src/lib/owner-only.ts), never written into anything it signs. It signs bundles (authorship) and, when the owner asks,
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
    /** Limit the key file to this user (src/lib/owner-only.ts). Throws when it cannot. Optional for test doubles. */
    restrict?(p: string): void;
    /** Limit the key's folder, the TrustShell home, to this user. Throws when it cannot. Optional for test doubles. */
    restrictDir?(p: string): void;
}
export declare const nodeKeyFs: () => KeyFs;
/**
 * This install's key, created on first use. The key is narrowed to this user on load, not only on create, so
 * a key made by an earlier version, or loosened since, is repaired. Its folder is narrowed too, but only when
 * this call created it or it is the default ~/.trustshell (isDefaultHome): TRUSTSHELL_HOME may name a project
 * or a whole home folder, and resetting that tree would strip grants other programs rely on. Once per process
 * (tryOwnerOnly). When it cannot be done the key still works and a TRUSTSHELL_HOME_PERMISSIONS or
 * TRUSTSHELL_KEY_PERMISSIONS warning says so: unrestricted is what every earlier version had, and failing the
 * command would not make it safer.
 */
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
