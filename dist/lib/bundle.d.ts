/**
 * `trustshell bundle` — the second brain as one signed file: profile, memory, settings, guardrails.
 * ------------------------------------------------------------------------------------------------
 * WHAT TRAVELS
 *   profile     `.trustshell/profile.md`, byte for byte (identity, context, trust settings, values,
 *               people, style, constraints, model priorities, and the share flags that guard them)
 *   guardrails  `~/.trustshell/guardrails.json` (egress, tools, spend limits), as parsed
 *   memory      every note with its whole taint record (provenance, source, quarantine state, who
 *               released it), and every `remember KEY VALUE` value
 * The model is not in it. Nothing in a bundle names or needs one, which is the point: the same file
 * gives any model on any host the same person.
 *
 * WHAT NEVER TRAVELS, counted instead (a count, never the text)
 *   anything shaped like a credential (the `remember` detector): a profile holding one refuses the
 *   whole export; a note or value holding one is left out · injection-looking notes (held for good,
 *   never printed, so never handed on) · encrypted bodies (a bundle is plain JSON,
 *   so it never decrypts what you chose to encrypt) · do_not_send rows · the learn loop's rows
 *   · the signing key itself · environment settings (TRUSTSHELL_LOCAL_ONLY and friends are env vars).
 *
 * SIGNED, AND THE SIGNER MUST BE ONE YOU TRUST. Ed25519 over the RFC 8785 form of everything but the
 * signature. A valid signature only proves the file is what SOME key signed; anyone can sign a
 * forgery with a key of their own. So import also requires the signer to be this install's own key,
 * or the fingerprint you pass with --signer (printed by export on the other machine). Anything else
 * is NOT_CHECKED, never imported. The fingerprint is recomputed from the key, never read off the file.
 *
 * EGRESS: none. Local files only.
 */
import { type KeyObject } from 'node:crypto';
import { type Guardrails } from './guardrails';
import { type PortableNote, type PortableValue, type WithheldCounts } from '../memory/local-store';
export declare const BUNDLE_SCHEMA = "trustshell.bundle/1";
export declare const SIGNING_KEY_FILE = "bundle-signing-key.pem";
/** A bundle larger than this is refused before it is parsed. */
export declare const MAX_BUNDLE_BYTES: number;
export interface BundlePayload {
    profile: string | null;
    guardrails: Guardrails | null;
    memory: {
        notes: PortableNote[];
        values: PortableValue[];
    };
    withheld: WithheldCounts & {
        secret_shaped: number;
        injection_held: number;
    };
}
export interface BundleSigner {
    alg: 'ed25519';
    /** The raw 32-byte public key, base64url (the JWK `x`). */
    public_key: string;
    /** sha256 hex of the raw public key. */
    fingerprint: string;
}
export interface Bundle {
    schema: typeof BUNDLE_SCHEMA;
    created_at: string;
    signer: BundleSigner;
    payload: BundlePayload;
    /** Ed25519 over canonicalize({ schema, created_at, signer, payload }), base64. */
    signature: string;
}
export declare class BundleError extends Error {
    /** 1 = the file was altered or holds what it must not (refused); 2 = not checked (signer unknown, conflict); 3 = could not run. */
    readonly exit: 1 | 2 | 3;
    constructor(message: string, 
    /** 1 = the file was altered or holds what it must not (refused); 2 = not checked (signer unknown, conflict); 3 = could not run. */
    exit: 1 | 2 | 3);
}
export declare function fingerprintOf(publicKeyB64url: string): string;
/** The filesystem calls the key needs. Injectable for tests. */
export interface KeyFs {
    exists(p: string): boolean;
    read(p: string): string;
    /** Create the file 0600 and fail if it already exists. */
    writeNew(p: string, data: string): void;
    mkdirp(p: string): void;
}
export declare const nodeKeyFs: () => KeyFs;
/**
 * This install's signing key: `<dir>/bundle-signing-key.pem`, Ed25519, created 0600 on first use.
 * It never leaves the machine and is never in a bundle; copy it yourself if you want one identity on
 * two machines, or import with --signer instead.
 */
export declare function signingKey(dir: string, fs?: KeyFs): {
    key: KeyObject;
    signer: BundleSigner;
    created: boolean;
    path: string;
};
/** The fingerprint of this install's key, or null when it has none yet (nothing is created). */
export declare function ownFingerprint(dir: string, fs?: KeyFs): string | null;
/** The parts a bundle is built from, read by the caller. */
export interface BundleSource {
    profile: string | null;
    guardrails: Guardrails | null;
    notes: PortableNote[];
    values: PortableValue[];
    withheld: WithheldCounts;
}
/**
 * PURE apart from signing. Screen, assemble and sign. A profile holding a credential shape refuses the
 * whole export (it cannot be cut in half honestly); a note or value holding one is left out and counted.
 */
export declare function buildBundle(src: BundleSource, key: KeyObject, now?: string): Bundle;
/** PURE. Every field a bundle may hold, of the type it must be. Anything else is a problem. */
export declare function bundleProblems(v: unknown): string[];
export interface VerifiedBundle {
    bundle: Bundle;
    /** Whose key signed it, as the import trusted it. */
    trusted_as: 'this install' | '--signer';
}
/**
 * Parse, check every field, check the signature, then check the signer is one you trust, in that
 * order. Throws {@link BundleError}: exit 1 when the file is malformed, altered or holds a credential
 * shape; exit 2 when it is intact but its signer is not one you named.
 */
export declare function verifyBundle(text: string, opts: {
    ownFingerprint: string | null;
    signer?: string;
}): VerifiedBundle;
/** What changes in the guardrails if `next` replaces `prev`: the rules that get WIDER, one line each. PURE. */
export declare function widenings(prev: Guardrails | null, next: Guardrails): string[];
/**
 * PURE. The person, as text for a model: what any model is handed, so swapping the model changes
 * nothing else. Built only from the bundle. Only RELEASED notes (never a quarantined one: untrusted
 * text does not reach a model until a check releases it). It sends nothing; where it goes is the
 * caller's choice, and through trustshell the outbound scrub and TRUSTSHELL_LOCAL_ONLY still apply.
 */
export declare function brainContext(p: BundlePayload): string;
