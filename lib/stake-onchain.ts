/**
 * Real, on-chain testnet staking — the user's own wallet BUILDS, SIGNS and SENDS a Base Sepolia
 * USDC transfer to the bound agent's EXISTING SESSION ADDRESS, and a stake only counts once that
 * transfer is CONFIRMED on-chain. "A database row that says staked is not the test."
 *
 * There is no flag and no escrow env here, on purpose: Base Sepolia (chain 84532) IS the test, so
 * the stake leg just works there. What it needs is a destination it does not invent —
 *
 *   DESTINATION = THE AGENT'S SESSION ADDRESS, which the system already has. It is the agent's own
 *   wallet (`agent_wallet`), the same address the spend path funds, read from the engine via a
 *   dry-run spend probe ({@link fetchAgentSessionAddress}). If it cannot be read, the page SAYS SO
 *   and stops — a named blocker. We never fall back to a default, an env var, or an invented address.
 *
 * Two hands, on purpose — the same split the spend path (agent-spend-client.ts) uses:
 *   - the DEPOSIT is sent by the person, from their own wallet. This module builds the
 *     `USDC.transfer(sessionAddress, amount)` transaction and hands it to the wallet; it never
 *     holds the person's key, and there is NO server signer and NO key on disk on this path.
 *   - the TRUTH of the stake is the CONFIRMED on-chain transfer, read back from the receipt
 *     ({@link confirmStakeReceipt}: status success, the USDC Transfer landed at the session
 *     address, amount >= the staked amount). An unconfirmed / unreadable tx is NOT_CHECKED, never
 *     "staked"; a reverted or mismatched tx is FAILED.
 *
 * MAINNET IS OFF, structurally. The only token this module names is Base Sepolia test USDC
 * ({@link USDC_BASE_SEPOLIA}), and the only chain it will send on is 84532 ({@link assertBaseSepolia},
 * enforced by ensureBaseSepolia). There is no mainnet token and no mainnet chain id anywhere here.
 */
import { Interface, getAddress, isAddress } from 'ethers';
import {
  BASE_SEPOLIA_CHAIN_ID,
  BASESCAN_TX,
  USDC_BASE_SEPOLIA,
  ensureBaseSepolia,
  askSpend,
  type Eip1193,
} from './agent-spend-client';

export { BASE_SEPOLIA_CHAIN_ID, BASESCAN_TX, USDC_BASE_SEPOLIA, ensureBaseSepolia };
export type { Eip1193 };

const TRANSFER = new Interface([
  'function transfer(address to, uint256 value) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);
// keccak256("Transfer(address,address,uint256)")
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

function eqAddr(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  try {
    return getAddress(a) === getAddress(b);
  } catch {
    return a.toLowerCase() === b.toLowerCase();
  }
}

/** The only token this module will ever move. Anything else — including any mainnet USDC — is refused. */
export function isTestnetUsdc(token: string | null | undefined): boolean {
  return eqAddr(token, USDC_BASE_SEPOLIA);
}

/**
 * The CHAIN gate, as a pure value so it is testable without a wallet. Returns a refusal reason, or
 * null to proceed. A mainnet id (1, 8453, …), any other id, or an unreadable id all refuse —
 * "not Base Sepolia" is never "allowed". The send enforces it again via ensureBaseSepolia.
 */
export function assertBaseSepolia(chainId: number | null | undefined): string | null {
  if (chainId === null || chainId === undefined) {
    return 'Not checked: your wallet network could not be read, so nothing is sent.';
  }
  if (chainId !== BASE_SEPOLIA_CHAIN_ID) {
    return `Refused: your wallet is on chain ${chainId}, not Base Sepolia (${BASE_SEPOLIA_CHAIN_ID}). Switch networks and try again — nothing is sent.`;
  }
  return null;
}

export type SessionAddress =
  | { ok: true; address: string }
  // blocker — the operator/user must act (unbound, no stored key, no session address on record).
  // not_checked — the engine could not be reached to read it. Fail closed either way: no real send.
  | { ok: false; kind: 'blocker' | 'not_checked'; reason: string };

/**
 * Read the bound agent's EXISTING session address (its own wallet) from the engine. This is the
 * destination a real stake funds, and it is never invented — a dry-run spend probe returns
 * `agent_wallet`, the very address the spend path uses. The probe signs nothing and sends nothing.
 *
 * It must be probed with the agent's BOUND OWNER as `owner`, because the engine only returns the
 * agent wallet once the owner check passes; an unbound agent has no session address to fund.
 * Returns a BLOCKER (say so and stop) when the address genuinely does not exist / cannot be
 * determined, and NOT_CHECKED when the engine could not be reached. Never a default or a guess.
 */
export async function fetchAgentSessionAddress(input: {
  engine: string;
  agentId: string;
  /** The agent's own key, stored in this browser. A read only; the stake tx is wallet-signed. */
  apiKey: string | undefined;
  /** The wallet BOUND as the agent's owner — the engine returns the session address only to it. */
  ownerWallet: string;
}): Promise<SessionAddress> {
  if (!input.engine) {
    return { ok: false, kind: 'not_checked', reason: 'No engine is configured for this deploy, so the session address could not be read. Nothing is sent.' };
  }
  if (!input.apiKey) {
    return { ok: false, kind: 'blocker', reason: 'This agent has no key stored in this browser, so its session address cannot be read here. Recreate or import the agent to stake on-chain.' };
  }
  if (!isAddress(input.ownerWallet)) {
    return { ok: false, kind: 'blocker', reason: 'This agent is not bound to a wallet owner, so it has no session address to fund yet. Bind it first.' };
  }
  const reply = await askSpend(
    input.engine,
    { id: input.agentId, apiKey: input.apiKey },
    { owner: input.ownerWallet, to: input.ownerWallet, amountUsdc: '0.000001', dryRun: true },
  );
  const addr = reply.agent_wallet;
  if (addr && isAddress(addr)) return { ok: true, address: getAddress(addr) };
  // The engine could not be reached / did not answer readably — NOT_CHECKED, not "no address".
  if (reply.code === 'unreachable' || reply.code === 'unreadable' || reply.code === 'owner_not_checked') {
    return { ok: false, kind: 'not_checked', reason: 'The agent’s session address could not be read right now. Nothing is sent — try again in a moment.' };
  }
  if (reply.code === 'not_bound') {
    return { ok: false, kind: 'blocker', reason: 'This agent is not bound yet, so it has no session address to fund. Bind it first.' };
  }
  // not_owner, or any reply that simply carried no agent_wallet.
  return { ok: false, kind: 'blocker', reason: reply.error || 'This agent has no session address on record, so there is nothing to fund. Nothing is sent.' };
}

/**
 * Build the `USDC.transfer(destination, amount)` transaction for the person's wallet to send.
 * `to` is the Base Sepolia test USDC contract — the only token address this module names — so a
 * mainnet-USDC transfer cannot be constructed here. Throws (never returns a half-built tx) on a
 * bad address or non-positive amount.
 */
export function buildStakeTransferTx(from: string, destination: string, amountRaw: string | bigint): { from: string; to: string; data: string } {
  if (!isAddress(from)) throw new Error('not an address: from');
  if (!isAddress(destination)) throw new Error('the session address is not a valid address');
  const amount = BigInt(amountRaw);
  if (amount <= BigInt(0)) throw new Error('amount must be positive');
  return {
    from: getAddress(from),
    to: USDC_BASE_SEPOLIA,
    data: TRANSFER.encodeFunctionData('transfer', [getAddress(destination), amount]),
  };
}

export type RawLog = { address: string; topics: string[]; data: string };
export type RawReceipt = { status?: string | number | null; logs?: RawLog[] };

export type ReceiptConfirmation =
  | { state: 'VERIFIED'; observed: string }
  | { state: 'NOT_CHECKED'; reason: string }
  | { state: 'FAILED'; reason: string };

/**
 * Confirm a transaction receipt actually moved the staked USDC into the session address, client-
 * side, BEFORE anything is shown as staked:
 *   - a null/absent receipt is NOT_CHECKED (unmined / unreadable) — never treated as success.
 *   - status 0 / '0x0' is a reverted tx — FAILED.
 *   - VERIFIED requires a USDC Transfer log whose `to` is the session address summing to >= the
 *     amount.
 * A success status with no matching transfer is FAILED, not a pass: the three outcomes are kept
 * distinct so "we could not look" never collapses into "it worked".
 */
export function confirmStakeReceipt(
  receipt: RawReceipt | null | undefined,
  opts: { destination: string; amountRaw: string | bigint },
): ReceiptConfirmation {
  if (!receipt) return { state: 'NOT_CHECKED', reason: 'The transaction is not confirmed yet — nothing counts as staked until it is.' };

  const status = receipt.status;
  const statusNum = typeof status === 'string' ? (status === '0x1' ? 1 : status === '0x0' ? 0 : NaN) : typeof status === 'number' ? status : NaN;
  if (statusNum === 0) return { state: 'FAILED', reason: 'The on-chain transfer reverted. Nothing moved and nothing is staked.' };
  if (Number.isNaN(statusNum)) return { state: 'NOT_CHECKED', reason: 'The receipt has no readable status — nothing counts as staked.' };

  const want = BigInt(opts.amountRaw);
  let observed = BigInt(0);
  for (const log of receipt.logs ?? []) {
    if (!log?.topics || log.topics.length < 3) continue;
    if ((log.topics[0] ?? '').toLowerCase() !== TRANSFER_TOPIC) continue;
    if (!isTestnetUsdc(log.address)) continue; // only the test USDC token counts
    let parsed;
    try {
      parsed = TRANSFER.parseLog({ topics: [...log.topics], data: log.data });
    } catch {
      continue;
    }
    if (!parsed) continue;
    const to = parsed.args?.['to'] as string | undefined;
    const value = parsed.args?.['value'] as bigint | undefined;
    if (eqAddr(to, opts.destination) && typeof value === 'bigint') observed += value;
  }

  if (observed === BigInt(0)) return { state: 'FAILED', reason: 'No USDC transfer into the agent’s session address was found in this transaction. Nothing is staked.' };
  if (observed < want) return { state: 'FAILED', reason: `The transfer into the session address (${observed}) was less than the staked amount (${want}). Nothing is staked.` };
  return { state: 'VERIFIED', observed: observed.toString() };
}

export type StakeSendResult =
  | { ok: true; hash: string; receipt: RawReceipt }
  | { ok: false; hash?: string; reason: string; pending?: boolean };

/**
 * Send the real stake transfer from the person's wallet and wait for it to be mined (~90s).
 *
 * Chain is enforced here (ensureBaseSepolia refuses or switches). A declined prompt, a wrong
 * network, or a tx that never mines all return ok:false with a reason and NEVER a staked state.
 * `pending:true` with a hash means the transfer was broadcast but we could not confirm it in
 * time — the funds may be in flight, so the hash is surfaced and the caller treats it as
 * NOT_CHECKED, never staked.
 */
export async function sendStakeTransfer(
  eth: Eip1193,
  from: string,
  destination: string,
  amountRaw: string | bigint,
): Promise<StakeSendResult> {
  try {
    await ensureBaseSepolia(eth);
  } catch (e: any) {
    return { ok: false, reason: e?.message ?? 'Your wallet is not on Base Sepolia. Nothing is sent.' };
  }

  let tx: { from: string; to: string; data: string };
  try {
    tx = buildStakeTransferTx(from, destination, amountRaw);
  } catch (e: any) {
    return { ok: false, reason: e?.message ?? 'Could not build the transfer. Nothing is sent.' };
  }

  let hash: string;
  try {
    hash = String(await eth.request({ method: 'eth_sendTransaction', params: [tx] }));
  } catch (e: any) {
    if (e?.code === 4001 || /reject|denied/i.test(e?.message ?? '')) {
      return { ok: false, reason: 'You declined the transfer — nothing was sent.' };
    }
    return { ok: false, reason: 'The wallet could not send the transfer. Nothing was sent.' };
  }

  for (let i = 0; i < 45; i++) {
    let r: RawReceipt | null;
    try {
      r = (await eth.request({ method: 'eth_getTransactionReceipt', params: [hash] })) as RawReceipt | null;
    } catch {
      r = null;
    }
    if (r) return { ok: true, hash, receipt: r };
    await new Promise((res) => setTimeout(res, 2000));
  }
  return { ok: false, hash, pending: true, reason: 'The transfer was sent but is not confirmed yet. Nothing counts as staked until it confirms.' };
}

/** A basescan link for a sent tx, so the receipt is something the person can see and keep. */
export function basescanTx(hash: string): string {
  return `${BASESCAN_TX}${hash}`;
}
