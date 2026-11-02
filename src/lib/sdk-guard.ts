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
import { sdkGuard, GuardDeniedError, type GuardRequest } from './guardrails';
import {
  TrustShell as Core,
  type AgentLeaderboard,
  type InitHealth,
  type ModelLeaderboard,
  type TrustShellConfig,
} from './trustshell';
import * as kernel from './kernel-client';
import * as signers from './verify-signer';
import * as quarantine from '../memory/quarantine';
import * as quarantineHal from '../memory/quarantine-hal';

type Act = Pick<GuardRequest, 'tool' | 'class'>;
const read = (tool: string): Act => ({ tool, class: 'other' });

/**
 * THE table of gated TrustShell methods and the action each is decided as. Tool names are the CLI's where one
 * mirrors the method (MCP_GUARD_TOOLS uses the same), so `tool:verify` in a policy means the same everywhere.
 * Not here, and not gated: `subscribe` (a local listener) and `getAllowance` (calls the caller's own readAllowance).
 * tests/sdk-guard.test.ts fails if a TrustShell method is in neither list.
 */
export const SDK_GUARD_METHODS = {
  score: read('verify'),
  verifyOutput: read('verify'),
  evaluate: read('evaluate'),
  verify: read('repid'),
  getRepID: read('repid'),
  getIdentity: read('repid'),
  getRepIDStake: read('repid'),
  getLeaderboard: read('leaderboard'),
  getFactCheckCount: read('fact_checks'),
  presentProof: read('proof'),
  verifyProof: read('proof'),
  audit: read('audit'),
  listServices: read('market'),
  getService: read('market'),
  getContractStatus: read('contracts'),
  pollUntilSettled: read('contracts'),
  // A contract and its escrow: a write to the engine. The payment it carries is counted where it is signed.
  executeA2A: { tool: 'a2a', class: 'post' },
  register: { tool: 'register', class: 'post' },
  registerHuman: { tool: 'register', class: 'post' },
} as const satisfies Record<string, Act>;
type Gated = keyof typeof SDK_GUARD_METHODS;

// Module-private, so no caller can reach the ungated client behind a TrustShell.
const CORES = new WeakMap<TrustShell, Core>();

async function gated<T>(t: TrustShell, m: Gated, fn: (c: Core) => Promise<T>): Promise<T> {
  sdkGuard(`TrustShell.${m}`, SDK_GUARD_METHODS[m]);
  const c = CORES.get(t);
  if (!c) throw new TypeError('not a TrustShell client');
  return fn(c);
}

/** The TrustShell client, each network method decided by the Guard policy first (see SDK_GUARD_METHODS). */
export class TrustShell {
  constructor(config: TrustShellConfig = {}) {
    CORES.set(this, new Core(config));
  }

  /** As the ungated init; the `/health` probe is a network call, so it is decided as tool:status unless skipped. */
  static async init(config: TrustShellConfig = {}): Promise<{ client: TrustShell; health: InitHealth }> {
    if (config.healthCheck !== false) sdkGuard('TrustShell.init', read('status'));
    const { client, health } = await Core.init(config);
    const t = Object.create(TrustShell.prototype) as TrustShell;
    CORES.set(t, client);
    return { client: t, health };
  }

  subscribe(...a: Parameters<Core['subscribe']>): ReturnType<Core['subscribe']> {
    return CORES.get(this)!.subscribe(...a);
  }
  getAllowance(...a: Parameters<Core['getAllowance']>): ReturnType<Core['getAllowance']> {
    return CORES.get(this)!.getAllowance(...a);
  }

  score(...a: Parameters<Core['score']>) { return gated(this, 'score', (c) => c.score(...a)); }
  verifyOutput(...a: Parameters<Core['verifyOutput']>) { return gated(this, 'verifyOutput', (c) => c.verifyOutput(...a)); }
  evaluate(...a: Parameters<Core['evaluate']>) { return gated(this, 'evaluate', (c) => c.evaluate(...a)); }
  verify(...a: Parameters<Core['verify']>) { return gated(this, 'verify', (c) => c.verify(...a)); }
  getRepID(...a: Parameters<Core['getRepID']>) { return gated(this, 'getRepID', (c) => c.getRepID(...a)); }
  getIdentity(...a: Parameters<Core['getIdentity']>) { return gated(this, 'getIdentity', (c) => c.getIdentity(...a)); }
  getRepIDStake(...a: Parameters<Core['getRepIDStake']>) { return gated(this, 'getRepIDStake', (c) => c.getRepIDStake(...a)); }
  getLeaderboard(board: 'agents'): Promise<AgentLeaderboard>;
  getLeaderboard(board: 'models'): Promise<ModelLeaderboard>;
  getLeaderboard(board: 'agents' | 'models'): Promise<AgentLeaderboard | ModelLeaderboard> {
    return gated<AgentLeaderboard | ModelLeaderboard>(this, 'getLeaderboard', (c) => (board === 'agents' ? c.getLeaderboard('agents') : c.getLeaderboard(board)));
  }
  getFactCheckCount() { return gated(this, 'getFactCheckCount', (c) => c.getFactCheckCount()); }
  presentProof(...a: Parameters<Core['presentProof']>) { return gated(this, 'presentProof', (c) => c.presentProof(...a)); }
  verifyProof(...a: Parameters<Core['verifyProof']>) { return gated(this, 'verifyProof', (c) => c.verifyProof(...a)); }
  audit(...a: Parameters<Core['audit']>) { return gated(this, 'audit', (c) => c.audit(...a)); }
  listServices(...a: Parameters<Core['listServices']>) { return gated(this, 'listServices', (c) => c.listServices(...a)); }
  getService(...a: Parameters<Core['getService']>) { return gated(this, 'getService', (c) => c.getService(...a)); }
  getContractStatus(...a: Parameters<Core['getContractStatus']>) { return gated(this, 'getContractStatus', (c) => c.getContractStatus(...a)); }
  pollUntilSettled(...a: Parameters<Core['pollUntilSettled']>) { return gated(this, 'pollUntilSettled', (c) => c.pollUntilSettled(...a)); }
  executeA2A(...a: Parameters<Core['executeA2A']>) { return gated(this, 'executeA2A', (c) => c.executeA2A(...a)); }
  register(...a: Parameters<Core['register']>) { return gated(this, 'register', (c) => c.register(...a)); }
  registerHuman(...a: Parameters<Core['registerHuman']>) { return gated(this, 'registerHuman', (c) => c.registerHuman(...a)); }
}

const KERNEL = read('kernel');

/** The Guard's refusal, or null when the call may go ahead. For the functions documented never to throw. */
function refusal(call: string, act: Act): GuardDeniedError | null {
  try {
    sdkGuard(call, act);
    return null;
  } catch (e) {
    if (e instanceof GuardDeniedError) return e;
    throw e;
  }
}

/** As kernel-client's; it never throws, so a Guard denial is its refusal with code `guard_denied`. */
export async function kernelDecide(input: kernel.KernelCallInput, opts: kernel.KernelClientOptions = {}): Promise<kernel.KernelOutcome> {
  const no = refusal('kernelDecide', KERNEL);
  if (no) return { allowed: false, verdict: 'NOT_CHECKED', source: 'client', args_hash: null, receipt: null, reasons: [{ code: 'guard_denied', detail: no.message }], http_status: null };
  return kernel.kernelDecide(input, opts);
}

export async function requireKernelAllow(...a: Parameters<typeof kernel.requireKernelAllow>) {
  sdkGuard('requireKernelAllow', KERNEL);
  return kernel.requireKernelAllow(...a);
}

/** As kernel-client's; it never throws, so a Guard denial is `{ ok: false, reason: 'guard_denied' }`. */
export async function kernelReceipt(receiptId: string, opts: kernel.KernelClientOptions = {}): Promise<kernel.KernelReceiptRead> {
  const no = refusal('kernelReceipt', read('receipt'));
  if (no) return { ok: false, reason: 'guard_denied', detail: no.message, http_status: null };
  return kernel.kernelReceipt(receiptId, opts);
}

export async function verifySigner(...a: Parameters<typeof signers.verifySigner>) {
  sdkGuard('verifySigner', read('signers'));
  return signers.verifySigner(...a);
}

export async function onchainFeedbackClients(...a: Parameters<typeof signers.onchainFeedbackClients>) {
  sdkGuard('onchainFeedbackClients', read('signers'));
  return signers.onchainFeedbackClients(...a);
}

export function rememberUntrusted(text: string, opts: { source: string; sourceText?: string | null }, env: NodeJS.ProcessEnv = process.env) {
  sdkGuard('rememberUntrusted', read('remember'), env);
  return quarantine.rememberUntrusted(text, opts, env);
}

export function releaseByGround(id: number, sourceText: string, opts: { page?: number | null; sourceLabel?: string } = {}, env: NodeJS.ProcessEnv = process.env) {
  sdkGuard('releaseByGround', read('quarantine'), env);
  return quarantine.releaseByGround(id, sourceText, opts, env);
}

export async function releaseByHal(id: number, opts: { timeoutMs?: number } = {}, env: NodeJS.ProcessEnv = process.env) {
  sdkGuard('releaseByHal', read('quarantine'), env);
  return quarantineHal.releaseByHal(id, opts, env);
}
