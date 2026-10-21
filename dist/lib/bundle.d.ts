/**
 * CARRY: `trustshell bundle` — the owner's context as one signed file, to another model or host.
 * --------------------------------------------------------------------------------------------
 * AUTHORITY NEVER TRAVELS. What a bundle carries, and nothing else:
 *   profile     `.trustshell/profile.md`, byte for byte (preferences, values, constraints, trust settings)
 *   policy      the owner policy BY HASH, with its `{ policy, signature }` document so the receiving host can
 *               check it. The receiving host ENFORCES it only when its owner signature verifies with a key that
 *               host trusts AND its nonce is higher than the policy already in force (the kernel's supersession,
 *               so an old, looser policy can never be replayed). Anything else imports as "suggested, not
 *               enforced" (`policy.suggested.json`). The bundle's own signature grants nothing.
 *   memories    ONLY the notes the owner selects (`--note <id>`, `--notes released`). None by default. Each
 *               imports as UNTRUSTED input through the quarantine (src/memory/quarantine.ts): held until a
 *               check or the operator releases it; injection-looking text is held for good.
 *   evidence    POINTERS: kind, name and sha256 of a record (a `check --claims` record, the guard ledger head).
 *               Never the record's contents.
 *   metadata    schema version, creation time, the author key and the tool version; Ed25519 over the RFC 8785
 *               form of all of it. A signature proves integrity only as far as the key is trusted; it encrypts
 *               NOTHING: a bundle is readable by anyone who has the file.
 * NEVER: credentials (the `remember` detector refuses the export), keys, spending authority, encrypted notes
 * (a bundle is plain JSON, so it never decrypts what you encrypted), do_not_send rows.
 *
 * EGRESS: none.
 */
import type { KeyObject } from 'node:crypto';
import { type PolicyDocument } from './guardrails';
import { type Signer } from './install-key';
export declare const BUNDLE_SCHEMA = "trustshell.bundle/2";
/** A bundle larger than this is refused before it is parsed. */
export declare const MAX_BUNDLE_BYTES: number;
export interface BundleMemory {
    text: string;
    created_at: string;
}
export interface EvidencePointer {
    kind: 'file' | 'guard-ledger-head';
    name: string;
    sha256: string;
}
export interface BundlePayload {
    profile: string | null;
    policy: {
        sha256: string;
        nonce: string;
        document: PolicyDocument;
    } | null;
    memories: BundleMemory[];
    evidence: EvidencePointer[];
}
export interface Bundle {
    schema: typeof BUNDLE_SCHEMA;
    created_at: string;
    author: Signer;
    tool: {
        name: string;
        version: string;
    };
    payload: BundlePayload;
    /** Ed25519 over canonicalize(everything but this field), base64. */
    signature: string;
}
export declare class BundleError extends Error {
    /** 1 = refused (altered, malformed, partial, other version, credential shape); 2 = not checked (signer unknown, conflict); 3 = could not run. */
    readonly exit: 1 | 2 | 3;
    constructor(message: string, 
    /** 1 = refused (altered, malformed, partial, other version, credential shape); 2 = not checked (signer unknown, conflict); 3 = could not run. */
    exit: 1 | 2 | 3);
}
/** Text that may not travel, or may not be handed to a model: a credential shape or injection-looking text. */
export declare function unsafeText(s: string): 'credential' | 'injection' | null;
/** PURE apart from signing. A profile or a selected note holding unsafe text refuses the whole export. */
export declare function buildBundle(payload: BundlePayload, key: KeyObject, author: Signer, version: string, now?: string): Bundle;
/** PURE. Every field a bundle may hold, of the type it must be. */
export declare function bundleProblems(v: unknown): string[];
export interface VerifiedBundle {
    bundle: Bundle;
    trusted_as: 'this install' | '--signer';
}
/**
 * Parse, check the version, check every field, check the signature, then check the author is one you trust,
 * in that order. Throws {@link BundleError}: exit 1 when the file is malformed, partial, another version,
 * altered or carries a credential shape; exit 2 when it is intact but its author is not one you named.
 */
export declare function verifyBundle(text: string, opts: {
    ownFingerprint: string | null;
    signer?: string;
}): VerifiedBundle;
/**
 * Should the bundle's policy be ENFORCED here? Only when its owner signature verifies with a trusted key and
 * its nonce supersedes the policy in force. PURE (the signature check is passed in).
 */
export declare function policyImportDecision(carried: BundlePayload['policy'], trustedOwners: readonly string[], inForce: {
    nonce: string;
} | null, signedBy: (doc: PolicyDocument, trusted: readonly string[]) => boolean): {
    enforce: boolean;
    why: string;
} | null;
/**
 * PURE. The person, as text for a model. Built only from the bundle; the policy is shown as INFORMATION
 * (enforcement stays in the harness, whatever a model does with this text). A memory that looks like an
 * injection is left out, so a poisoned note never reaches a model through this path.
 */
export declare function brainContext(p: BundlePayload): string;
