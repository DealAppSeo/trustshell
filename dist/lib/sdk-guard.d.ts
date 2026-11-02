/**
 * GUARD FOR SDK CALLS (containment row C4). What `@hyperdag/trustshell` exports at its root, gated.
 * ---------------------------------------------------------------------------------------------------------
 * Every SDK function that acts (sends over the network on the agent's behalf, posts, writes memory) asks the
 * owner's Guard policy first, through sdkGuard: the CLI's own decision and hash-chained ledger, origin 'Sdk', the
 * policy re-read from TRUSTSHELL_HOME on every call. Denied, it throws GuardDeniedError and does nothing. The one
 * place a payment is signed, buildX402Payment, asks inside src/lib/trustshell.ts, so guardedX402Payment is covered
 * by the same decision and the Guard's spend limits (C8).
 *
 * Why wrappers here and not a check inside each function: the CLI (C1) and the MCP server (C3) already decide each
 * command or tool call and then use these same functions from their own modules. Gating the shared code would
 * decide every CLI and MCP action twice. The package root (src/lib/index.ts) is the SDK; the `exports` map does
 * not expose this file's inner modules.
 *
 * The caller cannot pass an allow: nothing here reads an option that skips the decision. A function that already
 * takes `env` (the memory ones) is decided against that env's TRUSTSHELL_HOME, the caller's own home.
 *
 * WHAT THIS IS NOT. Code in the same process can skip the SDK: call fetch, sign with ethers, write the files itself.
 * Nothing here bounds that code (C4 is PARTIAL). A sandbox mission is the answer for code that is not trusted.
 */
import { type GuardRequest } from './guardrails';
import { TrustShell as Core, type AgentLeaderboard, type InitHealth, type ModelLeaderboard, type TrustShellConfig } from './trustshell';
import * as kernel from './kernel-client';
import * as signers from './verify-signer';
import * as quarantine from '../memory/quarantine';
type Act = Pick<GuardRequest, 'tool' | 'class'>;
/**
 * THE table of gated TrustShell methods and the action each is decided as. Tool names are the CLI's where one
 * mirrors the method (MCP_GUARD_TOOLS uses the same), so `tool:verify` in a policy means the same everywhere.
 * Not here, and not gated: `subscribe` (a local listener) and `getAllowance` (calls the caller's own readAllowance).
 * tests/sdk-guard.test.ts fails if a TrustShell method is in neither list.
 */
export declare const SDK_GUARD_METHODS: {
    readonly score: Act;
    readonly verifyOutput: Act;
    readonly evaluate: Act;
    readonly verify: Act;
    readonly getRepID: Act;
    readonly getIdentity: Act;
    readonly getRepIDStake: Act;
    readonly getLeaderboard: Act;
    readonly getFactCheckCount: Act;
    readonly presentProof: Act;
    readonly verifyProof: Act;
    readonly audit: Act;
    readonly listServices: Act;
    readonly getService: Act;
    readonly getContractStatus: Act;
    readonly pollUntilSettled: Act;
    readonly executeA2A: {
        readonly tool: "a2a";
        readonly class: "post";
    };
    readonly register: {
        readonly tool: "register";
        readonly class: "post";
    };
    readonly registerHuman: {
        readonly tool: "register";
        readonly class: "post";
    };
};
/** The TrustShell client, each network method decided by the Guard policy first (see SDK_GUARD_METHODS). */
export declare class TrustShell {
    constructor(config?: TrustShellConfig);
    /** As the ungated init; the `/health` probe is a network call, so it is decided as tool:status unless skipped. */
    static init(config?: TrustShellConfig): Promise<{
        client: TrustShell;
        health: InitHealth;
    }>;
    subscribe(...a: Parameters<Core['subscribe']>): ReturnType<Core['subscribe']>;
    getAllowance(...a: Parameters<Core['getAllowance']>): ReturnType<Core['getAllowance']>;
    score(...a: Parameters<Core['score']>): Promise<import("./trustshell").ScoreResult>;
    verifyOutput(...a: Parameters<Core['verifyOutput']>): Promise<import("./trustshell").VerifyOutputResult>;
    evaluate(...a: Parameters<Core['evaluate']>): Promise<import("./trustshell").VerifyOutputResult>;
    verify(...a: Parameters<Core['verify']>): Promise<import("./trustshell").VerifyResult>;
    getRepID(...a: Parameters<Core['getRepID']>): Promise<import("./trustshell").RepIDResult>;
    getIdentity(...a: Parameters<Core['getIdentity']>): Promise<import("./identity").AgentIdentity>;
    getRepIDStake(...a: Parameters<Core['getRepIDStake']>): Promise<import("./trustshell").RepIDStake>;
    getLeaderboard(board: 'agents'): Promise<AgentLeaderboard>;
    getLeaderboard(board: 'models'): Promise<ModelLeaderboard>;
    getFactCheckCount(): Promise<import("./trustshell").FactCheckCount>;
    presentProof(...a: Parameters<Core['presentProof']>): Promise<import("./trustshell").ProofPresentation>;
    verifyProof(...a: Parameters<Core['verifyProof']>): Promise<{
        verified: boolean;
        error: string | null;
        verifierVersion: string;
        reason?: "statement_for_other_agent" | "binding_unavailable";
    }>;
    audit(...a: Parameters<Core['audit']>): Promise<import("./trustshell").AuditResult>;
    listServices(...a: Parameters<Core['listServices']>): Promise<import("./trustshell").ServiceListPage>;
    getService(...a: Parameters<Core['getService']>): Promise<import("./trustshell").ServiceListing>;
    getContractStatus(...a: Parameters<Core['getContractStatus']>): Promise<{
        contractId: string;
        status: string;
        providerAgentId: string;
        buyerAgentId: string;
        agreedPriceUsdcRaw: number;
        settlementId?: string;
        result?: unknown;
    }>;
    pollUntilSettled(...a: Parameters<Core['pollUntilSettled']>): Promise<{
        contractId: string;
        status: string;
        providerAgentId: string;
        buyerAgentId: string;
        agreedPriceUsdcRaw: number;
        settlementId?: string;
        result?: unknown;
    }>;
    executeA2A(...a: Parameters<Core['executeA2A']>): Promise<import("./trustshell").A2AResult>;
    register(...a: Parameters<Core['register']>): Promise<import("./trustshell").RegisterResult>;
    registerHuman(...a: Parameters<Core['registerHuman']>): Promise<import("./trustshell").RegisterHumanResult>;
}
/** As kernel-client's; it never throws, so a Guard denial is its refusal with code `guard_denied`. */
export declare function kernelDecide(input: kernel.KernelCallInput, opts?: kernel.KernelClientOptions): Promise<kernel.KernelOutcome>;
export declare function requireKernelAllow(...a: Parameters<typeof kernel.requireKernelAllow>): Promise<{
    allowed: true;
    verdict: "ALLOW";
    source: "kernel";
    args_hash: string;
    receipt: kernel.KernelReceipt;
    reasons: [];
    authenticity: kernel.KernelReceiptAuthenticity;
}>;
/** As kernel-client's; it never throws, so a Guard denial is `{ ok: false, reason: 'guard_denied' }`. */
export declare function kernelReceipt(receiptId: string, opts?: kernel.KernelClientOptions): Promise<kernel.KernelReceiptRead>;
export declare function verifySigner(...a: Parameters<typeof signers.verifySigner>): Promise<signers.VerifySignerResult>;
export declare function onchainFeedbackClients(...a: Parameters<typeof signers.onchainFeedbackClients>): Promise<string[]>;
export declare function rememberUntrusted(text: string, opts: {
    source: string;
    sourceText?: string | null;
}, env?: NodeJS.ProcessEnv): quarantine.QuarantineRecord;
export declare function releaseByGround(id: number, sourceText: string, opts?: {
    page?: number | null;
    sourceLabel?: string;
}, env?: NodeJS.ProcessEnv): quarantine.ReleaseOutcome & {
    ground?: import("./ground").GroundResult;
};
export declare function releaseByHal(id: number, opts?: {
    timeoutMs?: number;
}, env?: NodeJS.ProcessEnv): Promise<quarantine.ReleaseOutcome & {
    claim?: import("./claim").ClaimResult;
}>;
export {};
