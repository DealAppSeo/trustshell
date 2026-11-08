import { TrustShellError } from './trustshell';
export declare const KERNEL_RECEIPT_SCHEMA: "kernel-receipt/1";
/** The signed receipt: the same body plus header.signer and header.signature. */
export declare const KERNEL_RECEIPT_SCHEMA_SIGNED: "kernel-receipt/2";
/** The engine's prefix on the signed bytes (repid-engine src/kernel/receipt-signing.ts). */
export declare const KERNEL_RECEIPT_SIGNATURE_DOMAIN = "hyperdag.kernel-receipt.signature.v1\n";
/** Comma-separated Ed25519 public keys (0x + 64 hex) whose kernel-receipt/2 this client calls AUTHENTIC. */
export declare const KERNEL_TRUSTED_SIGNERS_ENV = "TRUSTSHELL_KERNEL_TRUSTED_SIGNERS";
export type KernelVerdict = 'ALLOW' | 'DENY' | 'NOT_CHECKED';
export type KernelToolClass = 'read' | 'spend' | 'post' | 'other';
/** What the client sends the kernel. Arguments are hashed locally and never transmitted. */
export interface KernelCallInput {
    agent: {
        agent_id: string;
        agent_name: string;
    };
    tool: {
        name: string;
        class: KernelToolClass;
    };
    /** Where the turn came from: Cli | Site | Mcp | Market. */
    origin: string;
    /** The tool's arguments. Hashed here; only the hash is sent. */
    args?: unknown;
    /** Or a hash you computed with `hashKernelArgs`. */
    args_hash?: string;
    /** Smallest-unit amount, for a spend. A canonical decimal string or a safe integer. */
    amount_raw?: string | number | null;
    payee?: string | null;
    asset?: string | null;
    chain_id?: number | null;
}
export interface KernelClientOptions {
    /** Defaults to TRUSTSHELL_API_URL, then the production engine, like the rest of the SDK. */
    apiUrl?: string;
    apiKey?: string;
    /** Injected for tests. Defaults to the global fetch. */
    fetch?: typeof fetch;
    /** Default 10 000 ms. A timeout is a REFUSE. */
    timeoutMs?: number;
    /** Pinned Ed25519 public keys (0x + 64 hex). Defaults to TRUSTSHELL_KERNEL_TRUSTED_SIGNERS. */
    trustedSigners?: readonly string[];
}
/** The parts of a kernel-receipt/1 this client reads. The full shape is schemas/kernel-receipt.v1.json. */
export interface KernelReceiptV1 {
    header: {
        schema: typeof KERNEL_RECEIPT_SCHEMA;
        version: 1;
        receipt_id: string;
        prev_receipt_id: string | null;
        prev_hash: string | null;
        created_at: string;
        receipt_hash: string;
        env: {
            network: string;
            chain_id: number;
            is_simulated: boolean;
        };
        signer: null;
    };
    subject: {
        agent: {
            agent_id: string;
            agent_name: string;
        };
        owner: {
            wallet: string | null;
            assurance: string | null;
            status: 'resolved' | 'none' | 'unknown';
        };
    };
    request: {
        tool: {
            name: string;
            class: KernelToolClass;
        };
        origin: string;
        args_hash: string;
        amount_raw: string | null;
        payee: string | null;
        asset: string | null;
        chain_id: number | null;
    };
    decision: {
        verdict: KernelVerdict;
        blocking: boolean;
        executed: boolean;
        reasons: Array<{
            code: string;
            detail: string;
        }>;
        checks: Array<{
            name: string;
            outcome: 'PASS' | 'FAIL' | 'NOT_CHECKED';
            source: string;
        }>;
        does_not_attest: string[];
        policy: {
            policy_hash: string | null;
            signer: string | null;
            signature: 'VERIFIED' | 'FAILED' | 'NOT_CHECKED';
            expires_at: number | null;
            revocation: 'VERIFIED' | 'NOT_CHECKED';
        };
        limits: {
            per_tx_raw: string;
            daily_raw: string;
            total_raw: string;
            effective_per_tx_raw: string;
            binding_term: string;
        };
        laya: {
            lane: string | null;
            mode: 'shadow';
            consulted: false;
        };
    };
    payment: {
        status: string;
        [k: string]: unknown;
    };
    verification: {
        status: string;
        [k: string]: unknown;
    };
}
/** Who sealed a kernel-receipt/2. Public material only, 0x hex. fingerprint = sha256 of the raw key. */
export interface KernelReceiptSigner {
    alg: 'ed25519';
    public_key: string;
    fingerprint: string;
}
/** kernel-receipt/2: a kernel-receipt/1 body, sealed by an Ed25519 key. */
export type KernelReceiptV2 = Omit<KernelReceiptV1, 'header'> & {
    header: Omit<KernelReceiptV1['header'], 'schema' | 'version' | 'signer'> & {
        schema: typeof KERNEL_RECEIPT_SCHEMA_SIGNED;
        version: 2;
        signer: KernelReceiptSigner;
        /** Ed25519, lower-case 0x + 128 hex. */
        signature: string;
    };
};
export type KernelReceipt = KernelReceiptV1 | KernelReceiptV2;
/** WHO made a receipt, apart from whether it is whole. Only NOT_AUTHENTIC is a refusal; see the header. */
export type KernelReceiptAuthenticity = {
    status: 'AUTHENTIC';
    fingerprint: string;
} | {
    status: 'NOT_AUTHENTIC';
    reason: 'invalid' | 'untrusted_signer' | 'unsigned';
    detail: string;
} | {
    status: 'NOT_CHECKED';
    reason: 'no_trusted_signers' | 'unsigned';
    detail: string;
};
export type KernelOutcome = {
    allowed: true;
    verdict: 'ALLOW';
    source: 'kernel';
    args_hash: string;
    receipt: KernelReceipt;
    reasons: [];
    authenticity: KernelReceiptAuthenticity;
} | {
    allowed: false;
    /** The kernel's verdict when it gave one; NOT_CHECKED when we never got an answer. */
    verdict: 'DENY' | 'NOT_CHECKED';
    /** Who refused: the kernel, or this client because it could not trust what it got. */
    source: 'kernel' | 'client';
    args_hash: string | null;
    receipt: KernelReceipt | null;
    /** Stable codes, e.g. `spend_limit_zero`, `network_error`, `http_503`, `allow_not_bound_to_request`. */
    reasons: Array<{
        code: string;
        detail: string;
    }>;
    http_status: number | null;
};
/** Thrown by `requireKernelAllow`. Carries the full refusal so the caller can log the codes. */
export declare class KernelRefusedError extends TrustShellError {
    readonly code = "KERNEL_REFUSED";
    readonly outcome: Extract<KernelOutcome, {
        allowed: false;
    }>;
    constructor(outcome: Extract<KernelOutcome, {
        allowed: false;
    }>);
}
/** Object keys sorted at every depth, arrays in order, no whitespace. Identical to the engine's. */
export declare function kernelCanonicalJson(value: unknown): string;
/** keccak256 of the canonical JSON of the arguments. Needs the optional `ethers` peer. */
export declare function hashKernelArgs(args: unknown): Promise<string>;
/**
 * keccak256 of the canonical JSON of a receipt without `header.receipt_hash`. Uses @noble/hashes, a
 * direct dependency, so sealing and verifying a receipt work on a cold install with no `ethers`.
 */
export declare function kernelReceiptHash(receipt: KernelReceipt): Promise<string>;
/**
 * The pinned public keys, lower-cased: `trustedSigners`, else TRUSTSHELL_KERNEL_TRUSTED_SIGNERS. [] when
 * none. null when any entry is not 0x + 64 hex: the caller refuses rather than trust fewer keys and pass.
 */
export declare function kernelTrustedSigners(trustedSigners?: readonly string[]): string[] | null;
/**
 * Is this receipt whole, and who sealed it? Recomputes receipt_hash, re-derives the engine's signed bytes
 * (the domain tag, then the canonical receipt without receipt_hash and signature), verifies the Ed25519
 * signature, and calls the signer AUTHENTIC only when its key is in `trusted` (from kernelTrustedSigners).
 * The header's own signer is never trusted by itself. Never throws, except for a missing optional ethers.
 */
export declare function kernelReceiptAuthenticity(receipt: unknown, trusted: readonly string[]): Promise<KernelReceiptAuthenticity>;
/**
 * Ask the kernel. NEVER THROWS and never resolves `allowed: true` unless the kernel said ALLOW,
 * with a 200, about exactly this request. Everything else is a refusal with a reason.
 */
export declare function kernelDecide(input: KernelCallInput, opts?: KernelClientOptions): Promise<KernelOutcome>;
/** Like `kernelDecide`, but a refusal is a THROW, so it cannot be ignored by forgetting to read a flag. */
export declare function requireKernelAllow(input: KernelCallInput, opts?: KernelClientOptions): Promise<Extract<KernelOutcome, {
    allowed: true;
}>>;
/** The six-claim envelope's claim keys, in canonical order. Mirrored by lib/six-claims.ts (a test pins the two). */
export declare const SIX_CLAIM_KEYS: readonly ["integrity", "authenticity", "observation", "correctness", "authorization", "containment"];
export type SixClaimKey = (typeof SIX_CLAIM_KEYS)[number];
export type SixClaimStatus = 'VERIFIED' | 'NOT_CHECKED' | 'FAILED' | 'NOT_APPLICABLE';
export interface SixClaim {
    status: SixClaimStatus;
    statement: string;
    supports: string[];
    gaps: string[];
}
export declare const SIX_CLAIMS_PREDICATE_TYPE: "https://hyperdag.dev/predicates/trust-receipt-six-claims/v1";
/** The engine's `toSixClaimStatement`: an in-toto Statement over the receipt. There is no rollup field, on purpose. */
export interface SixClaimStatement {
    _type: 'https://in-toto.io/Statement/v1';
    subject: Array<{
        name: string;
        digest: {
            keccak256: string;
        };
    }>;
    predicateType: typeof SIX_CLAIMS_PREDICATE_TYPE;
    predicate: {
        claims: Record<SixClaimKey, SixClaim>;
        what_this_does_not_establish: string[];
    };
}
export type KernelReceiptRead = {
    ok: true;
    receipt_id: string;
    /** The latest ledger entry for the call. Its hash was recomputed here and matched. */
    receipt: KernelReceipt;
    /** Who sealed it. Never NOT_AUTHENTIC here: that is `ok: false, reason: receipt_not_authentic`. */
    authenticity: KernelReceiptAuthenticity;
    /** Present only when the envelope names exactly this receipt (id and hash). Otherwise null, never a guess. */
    six_claims: SixClaimStatement | null;
    /** Why six_claims is null, when it is. */
    six_claims_note: string | null;
} | {
    ok: false;
    /** `receipt_hash_mismatch` means the receipt does not match its own hash: treat it as tampered, not missing. */
    reason: string;
    detail: string;
    http_status: number | null;
};
/**
 * Read a kernel receipt back and check it. NEVER THROWS. `ok: true` only when the engine answered 200
 * with a kernel-receipt/1 or /2 for exactly this id whose hash, recomputed here, matches, and that is not
 * NOT_AUTHENTIC (see the authenticity rules at the top). The six claims ride
 * along only when they name that receipt; otherwise `six_claims` is null and `six_claims_note` says why.
 * Needs an API key: the route is authenticated, and an agent-bound key reads only its own agent's receipts.
 */
export declare function kernelReceipt(receiptId: string, opts?: KernelClientOptions): Promise<KernelReceiptRead>;
