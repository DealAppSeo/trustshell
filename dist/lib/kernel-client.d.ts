import { TrustShellError } from './trustshell';
export declare const KERNEL_RECEIPT_SCHEMA: "kernel-receipt/1";
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
export type KernelOutcome = {
    allowed: true;
    verdict: 'ALLOW';
    source: 'kernel';
    args_hash: string;
    receipt: KernelReceiptV1;
    reasons: [];
} | {
    allowed: false;
    /** The kernel's verdict when it gave one; NOT_CHECKED when we never got an answer. */
    verdict: 'DENY' | 'NOT_CHECKED';
    /** Who refused: the kernel, or this client because it could not trust what it got. */
    source: 'kernel' | 'client';
    args_hash: string | null;
    receipt: KernelReceiptV1 | null;
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
/** keccak256 of the canonical JSON of a receipt without `header.receipt_hash`. */
export declare function kernelReceiptHash(receipt: KernelReceiptV1): Promise<string>;
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
    receipt: KernelReceiptV1;
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
 * with a kernel-receipt/1 for exactly this id whose hash, recomputed here, matches. The six claims ride
 * along only when they name that receipt; otherwise `six_claims` is null and `six_claims_note` says why.
 * Needs an API key: the route is authenticated, and an agent-bound key reads only its own agent's receipts.
 */
export declare function kernelReceipt(receiptId: string, opts?: KernelClientOptions): Promise<KernelReceiptRead>;
